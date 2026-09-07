import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadCard } from "../card/io.ts";
import type { AgentCard } from "../card/types.ts";
import { opaEval } from "../util/opa.ts";
import { sha256OfCanonical } from "../util/canonical.ts";
import { TraceWriter } from "../trace/writer.ts";
import { newUuidV4 } from "../util/id.ts";
import type { DecisionEffect } from "../trace/types.ts";

const POLICY_DIR = new URL("../../policy", import.meta.url).pathname;

export interface GateOptions {
  cardPath: string;
  upstreamCommand: string;
  approvalsPath?: string;
  sessionId?: string;
  traceDir?: string;
}

interface GateDecision {
  effect: DecisionEffect;
  rule_ids: string[];
  reasons: string[];
  approval_fingerprint?: string;
}

interface PriorDecision {
  call_index: number;
  tool: string;
  effect: DecisionEffect;
  approval_fingerprint?: string;
}

async function loadApprovals(path: string | undefined): Promise<string[]> {
  if (!path) return [];
  try {
    const raw = JSON.parse(await Bun.file(path).text());
    if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
    return [];
  } catch (err) {
    console.error(`colophon gate: warning: could not read approvals file ${path}: ${(err as Error).message}`);
    return [];
  }
}

export class Gate {
  readonly sessionId: string;
  private cardValid = false;
  private cardInvalidReason = "";
  private card: AgentCard | undefined;
  private approvals: string[] = [];
  private callIndex = 0;
  private priorDecisions: PriorDecision[] = [];
  private trace: TraceWriter;
  private upstreamClient: Client | undefined;

  constructor(private readonly opts: GateOptions) {
    this.sessionId = opts.sessionId ?? newUuidV4();
    this.trace = new TraceWriter(this.sessionId, opts.traceDir ?? "trace");
  }

  /** Load the Card, load approvals, and connect to the upstream. Never throws — failures leave the gate in fail-closed mode. */
  async init(): Promise<void> {
    const result = await loadCard(this.opts.cardPath);
    if (!result.valid || !result.card) {
      this.cardValid = false;
      this.cardInvalidReason = `Card failed schema validation at startup: ${result.errors.join("; ")}`;
      console.error(`colophon gate: FAIL CLOSED: ${this.cardInvalidReason}`);
    } else {
      this.card = result.card;
      this.cardValid = true;
    }

    this.approvals = await loadApprovals(this.opts.approvalsPath);

    // Connect to upstream regardless of Card validity — needed only to
    // discover tool schemas for tools/list, and to forward allowed calls.
    // No call is ever forwarded while the Card is invalid (see callTool).
    const transport = new StdioClientTransport({
      command: "/bin/sh",
      args: ["-c", this.opts.upstreamCommand],
    });
    this.upstreamClient = new Client({ name: "colophon-gate", version: "0.1.0" }, { capabilities: {} });
    await this.upstreamClient.connect(transport);
  }

  private grantedToolNames(): Set<string> {
    if (!this.card) return new Set();
    return new Set(this.card.tools.map((t) => t.name));
  }

  async listTools() {
    if (!this.upstreamClient) return { tools: [] };
    const upstream = await this.upstreamClient.listTools();
    const granted = this.grantedToolNames();
    return { tools: upstream.tools.filter((t) => granted.has(t.name)) };
  }

  private async evaluate(name: string, args: Record<string, unknown>): Promise<GateDecision> {
    if (!this.cardValid || !this.card) {
      return { effect: "deny", rule_ids: ["GATE-INVALID-CARD"], reasons: [this.cardInvalidReason] };
    }
    const fingerprint = sha256OfCanonical({ name, arguments: args });
    const input = {
      card: this.card,
      call: { name, arguments: args, fingerprint },
      context: {
        session_id: this.sessionId,
        call_index: this.callIndex,
        prior_decisions: this.priorDecisions,
        approvals: this.approvals,
      },
    };
    const result = await opaEval(POLICY_DIR, input, "data.colophon.gate.decision");
    if (!result.ok) {
      return { effect: "deny", rule_ids: ["OPA-EVAL-ERROR"], reasons: [result.stderr] };
    }
    return result.value as GateDecision;
  }

  async callTool(name: string, args: Record<string, unknown>) {
    const decision = await this.evaluate(name, args);
    const cardSha256 = this.card?.metadata.canonical_sha256 ?? "";

    await this.trace.append({
      call_index: this.callIndex,
      tool: name,
      arguments: args,
      effect: decision.effect,
      rule_ids: decision.rule_ids,
      reasons: decision.reasons,
      card_sha256: cardSha256,
    });
    this.priorDecisions.push({
      call_index: this.callIndex,
      tool: name,
      effect: decision.effect,
      approval_fingerprint: decision.approval_fingerprint,
    });
    this.callIndex++;

    if (decision.effect === "deny") {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `DENY [${decision.rule_ids.join(", ")}]: ${decision.reasons.join("; ")}` }],
      };
    }
    if (decision.effect === "escalate") {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `ESCALATE [${decision.rule_ids.join(", ")}]: ${decision.reasons.join("; ")}` }],
      };
    }

    // effect === "allow": forward to upstream and return its real result.
    if (!this.upstreamClient) {
      return { isError: true, content: [{ type: "text" as const, text: "gate: no upstream connection" }] };
    }
    const upstreamResult = await this.upstreamClient.callTool({ name, arguments: args });
    return upstreamResult;
  }

  async close(): Promise<void> {
    await this.upstreamClient?.close();
  }
}

export function buildGateServer(gate: Gate): Server {
  const server = new Server({ name: "colophon-gate", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => gate.listTools());

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    return gate.callTool(request.params.name, args);
  });

  return server;
}

export async function runGateStdioServer(opts: GateOptions): Promise<void> {
  const gate = new Gate(opts);
  await gate.init();
  console.error(`colophon gate: session ${gate.sessionId}`);

  const server = buildGateServer(gate);
  const transport = new StdioServerTransport();
  const closed = new Promise<void>((resolveClosed) => {
    transport.onclose = () => resolveClosed();
  });
  await server.connect(transport);
  await closed;
  await gate.close();
}
