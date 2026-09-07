import type { Collector } from "../evidence/types.ts";
import type { EvidenceItem } from "../evidence/types.ts";
import { sha256OfCanonical } from "../util/canonical.ts";
import { verifyTraceFile } from "../trace/verify.ts";
import { nowIso } from "../util/time.ts";
import type { TraceLine, DecisionEffect } from "../trace/types.ts";

/**
 * Turns one verified trace into evidence: one item per decision, plus one
 * summary item (SPEC.md C31). Refuses to produce evidence from a trace
 * that does not verify — evidence built on a tampered trace would be
 * worse than no evidence at all.
 */
export class MCPTraceCollector implements Collector {
  constructor(private readonly tracePath: string) {}

  async collect(): Promise<EvidenceItem[]> {
    const verification = await verifyTraceFile(this.tracePath);
    if (!verification.ok) {
      throw new Error(
        `MCPTraceCollector: refusing to collect from an unverified trace (${this.tracePath}): ` +
          `line ${verification.badLine}: ${verification.reason}`,
      );
    }

    const text = await Bun.file(this.tracePath).text();
    const lines = text
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as TraceLine);

    const retrievedAt = nowIso();
    const items: EvidenceItem[] = [];
    const bySessionId = lines[0]?.session_id ?? "unknown";

    for (const line of lines) {
      const sha256 = sha256OfCanonical(line);
      items.push({
        id: sha256,
        source: `trace:${line.session_id}:${line.call_index}`,
        retrieved_at: retrievedAt,
        sha256,
        payload: line,
      });
    }

    const effectCounts: Record<DecisionEffect, number> = { allow: 0, deny: 0, escalate: 0 };
    const ruleIdCounts: Record<string, number> = {};
    for (const line of lines) {
      effectCounts[line.effect]++;
      for (const rid of line.rule_ids) {
        ruleIdCounts[rid] = (ruleIdCounts[rid] ?? 0) + 1;
      }
    }
    const summaryPayload = {
      kind: "trace-summary",
      session_id: bySessionId,
      total_decisions: lines.length,
      effect_counts: effectCounts,
      rule_id_counts: ruleIdCounts,
      chain_verified: true,
    };
    const summarySha = sha256OfCanonical(summaryPayload);
    items.push({
      id: summarySha,
      source: `trace:${bySessionId}:summary`,
      retrieved_at: retrievedAt,
      sha256: summarySha,
      payload: summaryPayload,
    });

    return items;
  }
}
