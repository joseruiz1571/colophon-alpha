export type DecisionEffect = "allow" | "deny" | "escalate";

/** One hash-chained line in trace/<session_id>.jsonl (SPEC.md C27). */
export interface TraceLine {
  ts: string;
  session_id: string;
  call_index: number;
  tool: string;
  args_sha256: string;
  args_redacted: unknown;
  effect: DecisionEffect;
  rule_ids: string[];
  reasons: string[];
  card_sha256: string;
  prev_hash: string;
  hash: string;
}

export const GENESIS_HASH = "0".repeat(64);
