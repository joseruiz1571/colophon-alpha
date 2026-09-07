import type { Collector, EvidenceItem } from "../evidence/types.ts";
import { sha256OfCanonical } from "../util/canonical.ts";
import { nowIso } from "../util/time.ts";
import type { AgentCard } from "../card/types.ts";

/** Yields the Card itself as a single evidence item (SPEC.md C31). */
export class CardCollector implements Collector {
  constructor(private readonly card: AgentCard) {}

  async collect(): Promise<EvidenceItem[]> {
    const sha256 = sha256OfCanonical(this.card);
    return [
      {
        id: sha256,
        source: `card:${this.card.metadata.id}`,
        retrieved_at: nowIso(),
        sha256,
        payload: this.card,
      },
    ];
  }
}
