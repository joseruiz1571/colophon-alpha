import { canonicalize, sha256Hex } from "../util/canonical.ts";
import { GENESIS_HASH, type TraceLine } from "./types.ts";

export interface TraceVerifyResult {
  ok: boolean;
  /** 1-indexed line number of the first problem, if any. */
  badLine?: number;
  reason?: string;
  lineCount: number;
}

/**
 * Verify a trace file's hash chain: each line's `hash` must equal
 * SHA-256(canonical(line without `hash`)), and each line's `prev_hash`
 * must equal the previous line's `hash` (genesis for the first line).
 * SPEC.md C28: on failure, name the 1-indexed line of the first problem.
 */
export async function verifyTraceFile(path: string): Promise<TraceVerifyResult> {
  const text = await Bun.file(path).text();
  const rawLines = text.split("\n").filter((l) => l.trim().length > 0);

  let expectedPrevHash = GENESIS_HASH;
  for (let i = 0; i < rawLines.length; i++) {
    const lineNo = i + 1;
    let parsed: TraceLine;
    try {
      parsed = JSON.parse(rawLines[i]!) as TraceLine;
    } catch {
      return { ok: false, badLine: lineNo, reason: "not valid JSON", lineCount: rawLines.length };
    }

    const { hash, ...withoutHash } = parsed;
    const recomputed = sha256Hex(canonicalize(withoutHash));
    if (recomputed !== hash) {
      return {
        ok: false,
        badLine: lineNo,
        reason: `hash mismatch: stored ${hash}, recomputed ${recomputed}`,
        lineCount: rawLines.length,
      };
    }

    if (parsed.prev_hash !== expectedPrevHash) {
      return {
        ok: false,
        badLine: lineNo,
        reason: `prev_hash mismatch: expected ${expectedPrevHash}, got ${parsed.prev_hash}`,
        lineCount: rawLines.length,
      };
    }

    expectedPrevHash = hash;
  }

  return { ok: true, lineCount: rawLines.length };
}
