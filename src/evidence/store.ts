import { sha256OfCanonical } from "../util/canonical.ts";
import type { EvidenceItem } from "./types.ts";

export class DuplicateEvidenceIdError extends Error {
  constructor(id: string) {
    super(`evidence item with id ${id} already exists in this store`);
  }
}

export class EvidenceHashMismatchError extends Error {
  constructor(id: string, expected: string, actual: string) {
    super(`evidence item ${id}: sha256 does not match its payload (declared ${expected}, computed ${actual})`);
  }
}

/**
 * Holds every evidence item retrieved in one run. Rejects a duplicate id
 * and rejects an item whose `sha256` does not match its payload (C33) —
 * the store is the single place that guarantees "every evidence UUID a
 * report cites really exists, with the content it claims to have".
 */
export class EvidenceStore {
  private readonly items = new Map<string, EvidenceItem>();

  add(item: EvidenceItem): void {
    const computed = sha256OfCanonical(item.payload);
    if (computed !== item.sha256) {
      throw new EvidenceHashMismatchError(item.id, item.sha256, computed);
    }
    if (this.items.has(item.id)) {
      throw new DuplicateEvidenceIdError(item.id);
    }
    this.items.set(item.id, item);
  }

  addAll(items: EvidenceItem[]): void {
    for (const item of items) this.add(item);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  get(id: string): EvidenceItem | undefined {
    return this.items.get(id);
  }

  all(): EvidenceItem[] {
    return [...this.items.values()];
  }

  get size(): number {
    return this.items.size;
  }
}
