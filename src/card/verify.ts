import type { AgentCard } from "./types.ts";
import { canonicalSha256Excluding } from "./build.ts";

export interface CardVerifyResult {
  ok: boolean;
  expected: string;
  actual: string;
}

/** Recompute a Card's canonical_sha256 and compare it to the stored value (SPEC.md C7). */
export function verifyCard(card: AgentCard): CardVerifyResult {
  const actual = canonicalSha256Excluding(card);
  const expected = card.metadata?.canonical_sha256 ?? "";
  return { ok: actual === expected, expected, actual };
}
