import { validate as uuidValidate, version as uuidVersion, v4 as uuidv4 } from "uuid";

/** Generate a fresh UUID v4. */
export function newUuidV4(): string {
  return uuidv4();
}

/** True iff `value` is a syntactically valid UUID, version 4. */
export function isUuidV4(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!uuidValidate(value)) return false;
  return uuidVersion(value) === 4;
}

/** The all-zero UUID, used by fixtures to exercise "invalid identity" checks. */
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";
