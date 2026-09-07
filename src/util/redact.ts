// Credential redaction (SPEC.md §5: "No credential value of any kind ever
// appears in a trace, an evidence item, a report, or a bundle. Arguments
// that carry credentials are stored as their SHA-256 only.") and C29.

const CREDENTIAL_KEY_PATTERN = /token|secret|password|credential|api[_-]?key/i;

/**
 * Deep-clone `value`, replacing any object value whose key looks
 * credential-bearing with the literal string "[REDACTED]". The original
 * (unredacted) value is never returned from this function; callers that
 * need to reference it (e.g. to compute args_sha256 over the true
 * arguments) must keep their own reference to the original.
 */
export function redactCredentials(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactCredentials);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = CREDENTIAL_KEY_PATTERN.test(key) ? "[REDACTED]" : redactCredentials(v);
    }
    return out;
  }
  return value;
}
