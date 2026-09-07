/** One content-addressed evidence item retrieved by a collector in one run (SPEC.md F6). */
export interface EvidenceItem {
  /** Equal to `sha256`: evidence is identified by the hash of its own payload. */
  id: string;
  /** Where this item came from, e.g. "trace:<session>:<call_index>" or "card:<agent-id>". */
  source: string;
  retrieved_at: string;
  sha256: string;
  payload: unknown;
}

export interface Collector {
  collect(): Promise<EvidenceItem[]>;
}
