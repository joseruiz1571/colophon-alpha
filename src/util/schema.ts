// JSON Schema validation helpers.
//
// Colophon authors its own schemas (declaration, agent-card) as JSON Schema
// draft 2020-12 per SPEC.md §5, and validates them with Ajv2020. The one
// exception is the vendored, third-party NIST OSCAL schema, which targets
// draft-07 (see DECISIONS.md, "OSCAL/JSON-Schema draft mismatch") and is
// validated with a plain draft-07 Ajv instance instead — see
// `validateAgainstDraft07Schema` below, used only by src/report.

import Ajv2020 from "ajv/dist/2020.js";
import Ajv from "ajv";
import addFormats from "ajv-formats";

export interface SchemaValidationResult {
  valid: boolean;
  /** Human-readable "<path>: <message>" lines, empty when valid. */
  errors: string[];
}

function formatErrors(errors: import("ajv").ErrorObject[] | null | undefined): string[] {
  if (!errors) return [];
  return errors.map((e) => {
    const path = e.instancePath && e.instancePath.length > 0 ? e.instancePath : "(root)";
    const extra =
      e.keyword === "required" && e.params && "missingProperty" in e.params
        ? ` (${(e.params as { missingProperty: string }).missingProperty})`
        : "";
    return `${path}: ${e.message}${extra}`;
  });
}

/** Validate `data` against a 2020-12 JSON Schema object (our own authored schemas). */
export function validateAgainst2020Schema(schema: object, data: unknown): SchemaValidationResult {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validateFn = ajv.compile(schema);
  const valid = validateFn(data) as boolean;
  return { valid, errors: formatErrors(validateFn.errors) };
}

/** Validate `data` against a draft-07 JSON Schema object (the vendored NIST OSCAL schema). */
export function validateAgainstDraft07Schema(schema: object, data: unknown): SchemaValidationResult {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validateFn = ajv.compile(schema);
  const valid = validateFn(data) as boolean;
  return { valid, errors: formatErrors(validateFn.errors) };
}

export async function loadJson(path: string): Promise<unknown> {
  const text = await Bun.file(path).text();
  return JSON.parse(text);
}
