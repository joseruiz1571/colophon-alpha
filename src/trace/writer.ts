import { canonicalize, sha256Hex, sha256OfCanonical } from "../util/canonical.ts";
import { redactCredentials } from "../util/redact.ts";
import { nowIso } from "../util/time.ts";
import { GENESIS_HASH, type DecisionEffect, type TraceLine } from "./types.ts";

export interface AppendDecisionInput {
  call_index: number;
  tool: string;
  arguments: unknown;
  effect: DecisionEffect;
  rule_ids: string[];
  reasons: string[];
  card_sha256: string;
}

/**
 * Appends hash-chained decision lines to trace/<session_id>.jsonl.
 * If the file already has lines (resuming a session), the chain continues
 * from the last line's hash rather than restarting at genesis.
 */
export class TraceWriter {
  private prevHash: string = GENESIS_HASH;
  private ready: Promise<void>;

  constructor(
    private readonly sessionId: string,
    private readonly traceDir: string = "trace",
  ) {
    this.ready = this.init();
  }

  private get path(): string {
    return `${this.traceDir}/${this.sessionId}.jsonl`;
  }

  private async init(): Promise<void> {
    const file = Bun.file(this.path);
    if (await file.exists()) {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length > 0) {
        const last = JSON.parse(lines[lines.length - 1]!) as TraceLine;
        this.prevHash = last.hash;
      }
    }
  }

  async append(input: AppendDecisionInput): Promise<TraceLine> {
    await this.ready;
    const argsRedacted = redactCredentials(input.arguments);
    const argsSha256 = sha256OfCanonical(input.arguments);

    const withoutHash: Omit<TraceLine, "hash"> = {
      ts: nowIso(),
      session_id: this.sessionId,
      call_index: input.call_index,
      tool: input.tool,
      args_sha256: argsSha256,
      args_redacted: argsRedacted,
      effect: input.effect,
      rule_ids: input.rule_ids,
      reasons: input.reasons,
      card_sha256: input.card_sha256,
      prev_hash: this.prevHash,
    };
    const hash = sha256Hex(canonicalize(withoutHash));
    const line: TraceLine = { ...withoutHash, hash };

    await this.appendLine(line);
    this.prevHash = hash;
    return line;
  }

  private async appendLine(line: TraceLine): Promise<void> {
    const file = Bun.file(this.path);
    const existing = (await file.exists()) ? await file.text() : "";
    await Bun.write(this.path, existing + JSON.stringify(line) + "\n");
  }
}
