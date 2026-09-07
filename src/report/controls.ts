import { parse as parseYaml } from "yaml";
import type { ControlDef, FrameworkRef } from "./types.ts";
import { CHECKS } from "./checks.ts";

export interface ControlsLoadResult {
  valid: boolean;
  errors: string[];
  controls: ControlDef[];
}

function isFrameworkRef(value: unknown): value is FrameworkRef {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["framework"] === "string" &&
    typeof (value as Record<string, unknown>)["ref"] === "string"
  );
}

/**
 * Load and validate controls/agent-controls.yaml (SPEC.md C34). The file is
 * a bare top-level YAML sequence (see the comment at the top of that file
 * for why); each entry needs `id`, a non-empty `framework_refs[]`, a
 * non-empty `intent`, and a `check` naming a function in the CHECKS
 * registry — never inline Rego or TypeScript branching (that would put
 * allow/deny-adjacent judgment outside of policy; controls only *observe*
 * what the gate already decided).
 */
export async function loadControls(path: string): Promise<ControlsLoadResult> {
  let text: string;
  try {
    text = await Bun.file(path).text();
  } catch (err) {
    return { valid: false, errors: [`cannot read file: ${(err as Error).message}`], controls: [] };
  }

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    return { valid: false, errors: [`invalid YAML: ${(err as Error).message}`], controls: [] };
  }

  if (!Array.isArray(raw)) {
    return { valid: false, errors: ["controls file must be a top-level YAML sequence"], controls: [] };
  }

  const errors: string[] = [];
  const controls: ControlDef[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i] as Record<string, unknown>;
    const id = entry?.["id"];
    const frameworkRefs = entry?.["framework_refs"];
    const intent = entry?.["intent"];
    const check = entry?.["check"];

    if (typeof id !== "string" || id.length === 0) {
      errors.push(`control[${i}]: missing or invalid 'id'`);
      continue;
    }
    if (!Array.isArray(frameworkRefs) || frameworkRefs.length === 0 || !frameworkRefs.every(isFrameworkRef)) {
      errors.push(`control[${id}]: 'framework_refs' must be a non-empty array of {framework, ref}`);
      continue;
    }
    if (typeof intent !== "string" || intent.trim().length === 0) {
      errors.push(`control[${id}]: missing or invalid 'intent'`);
      continue;
    }
    if (typeof check !== "string" || !(check in CHECKS)) {
      errors.push(`control[${id}]: 'check' must name a function in the CHECKS registry (got '${String(check)}')`);
      continue;
    }
    controls.push({ id, framework_refs: frameworkRefs, intent, check });
  }

  if (controls.length < 8) {
    errors.push(`only ${controls.length} valid controls found; SPEC.md C34 requires at least 8`);
  }

  return { valid: errors.length === 0, errors, controls };
}
