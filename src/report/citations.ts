import type { EvidenceStore } from "../evidence/store.ts";

/**
 * Thrown by validateCitations when an observation would cite an evidence
 * id that does not exist in this run's evidence store (SPEC.md C37: "a
 * report that would cite a missing id fails before writing, with a named
 * error"). Callers must call validateCitations before writing any report
 * file to disk.
 */
export class MissingEvidenceCitationError extends Error {
  constructor(
    public readonly evidenceId: string,
    public readonly observationUuid: string,
  ) {
    super(
      `report: observation ${observationUuid} cites evidence id '${evidenceId}', ` +
        "which does not exist in this run's evidence store — refusing to write a report with a dangling citation",
    );
    this.name = "MissingEvidenceCitationError";
  }
}

export interface CitingObservation {
  uuid: string;
  relatedEvidenceIds: string[];
}

/**
 * Verify every evidence id every observation cites actually exists in
 * `store`. Throws MissingEvidenceCitationError on the first miss. Must run
 * to completion before any report file is written (C37's fail-closed
 * citation invariant).
 */
export function validateCitations(observations: CitingObservation[], store: EvidenceStore): void {
  for (const obs of observations) {
    for (const id of obs.relatedEvidenceIds) {
      if (!store.has(id)) {
        throw new MissingEvidenceCitationError(id, obs.uuid);
      }
    }
  }
}
