/** Current time as an RFC 3339 / ISO-8601 UTC timestamp with millisecond precision. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** True iff `value` parses as an RFC 3339 date (date-only, e.g. "2026-09-07"). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime());
}

/** True iff the given ISO date string (date-only) is strictly before today (UTC). */
export function isPastDate(isoDate: string): boolean {
  const d = new Date(isoDate + "T00:00:00Z");
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return d.getTime() < todayUtc.getTime();
}
