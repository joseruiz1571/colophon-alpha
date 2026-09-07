import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadScenario } from "./scenario.ts";
import { ScriptDriver } from "./driver.ts";
import { newUuidV4 } from "../util/id.ts";

const CLI_ENTRYPOINT = new URL("../cli/index.ts", import.meta.url).pathname;
const DEFAULT_UPSTREAM_COMMAND = `bun run ${CLI_ENTRYPOINT} upstream demo`;

export interface AgentRunOptions {
  scenarioPath?: string;
  cardPath: string;
  upstreamCommand?: string;
  approvalsPath?: string;
  sessionId?: string;
  listToolsOnly?: boolean;
}

export interface AgentRunOutcome {
  sessionId: string;
  toolNames?: string[];
  steps?: Array<{ index: number; tool: string; effect: "allow" | "denied"; summary: string }>;
}

async function connectToGate(opts: AgentRunOptions): Promise<{ client: Client; sessionId: string }> {
  const sessionId = opts.sessionId ?? newUuidV4();
  const upstreamCommand = opts.upstreamCommand ?? DEFAULT_UPSTREAM_COMMAND;
  const gateArgs = [
    "run",
    CLI_ENTRYPOINT,
    "gate",
    "serve",
    "--card",
    opts.cardPath,
    "--upstream",
    upstreamCommand,
    "--session",
    sessionId,
  ];
  if (opts.approvalsPath) {
    gateArgs.push("--approvals", opts.approvalsPath);
  }
  const transport = new StdioClientTransport({ command: "bun", args: gateArgs });
  const client = new Client({ name: "colophon-agent", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, sessionId };
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunOutcome> {
  const { client, sessionId } = await connectToGate(opts);
  try {
    if (opts.listToolsOnly) {
      const { tools } = await client.listTools();
      return { sessionId, toolNames: tools.map((t) => t.name) };
    }

    if (!opts.scenarioPath) {
      throw new Error("agent run: --scenario is required unless --list-tools is given");
    }
    const scenario = await loadScenario(opts.scenarioPath);
    const driver = new ScriptDriver();
    const results = await driver.run(scenario, async (call) => {
      const res = await client.callTool({ name: call.name, arguments: call.arguments });
      return res as { isError: boolean; content: Array<{ type: string; text?: string }> };
    });
    return {
      sessionId,
      steps: results.map((r) => ({
        index: r.index,
        tool: r.call.name,
        effect: r.isError ? "denied" : "allow",
        summary: r.summary,
      })),
    };
  } finally {
    await client.close();
  }
}
