// RFC 8785 JSON Canonicalization Scheme (JCS), and SHA-256 over canonical bytes.
//
// Colophon's core evidentiary claims (Card integrity, trace hash-chaining,
// evidence content-addressing) all rest on "the same logical object always
// canonicalizes to the same bytes". We do not hand-roll JCS: we use the
// `canonicalize` package, which implements RFC 8785 directly.
import canonicalizeImpl from "canonicalize";

/**
 * Serialize a JSON-compatible value to its RFC 8785 canonical UTF-8 byte
 * representation. Throws if the value contains non-JSON-representable
 * members (undefined, functions, bigint, cyclic references) since those
 * have no canonical form.
 */
export function canonicalize(value: unknown): string {
  const result = canonicalizeImpl(value);
  if (result === undefined) {
    throw new Error("colophon: value is not JSON-serializable; cannot canonicalize");
  }
  return result;
}

/** SHA-256 of a UTF-8 string, returned as lowercase hex. */
export function sha256Hex(input: string | Uint8Array): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex");
}

/** SHA-256 of the RFC 8785 canonical form of a JSON-compatible value. */
export function sha256OfCanonical(value: unknown): string {
  return sha256Hex(canonicalize(value));
}
