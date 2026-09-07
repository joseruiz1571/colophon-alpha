import { parse as parseYaml } from "yaml";
import { validateAgainst2020Schema, loadJson, type SchemaValidationResult } from "../util/schema.ts";
import type { Declaration } from "./types.ts";

const SCHEMA_PATH = new URL("../../schemas/declaration.schema.json", import.meta.url).pathname;

export interface DeclarationLoadResult {
  valid: boolean;
  errors: string[];
  declaration?: Declaration;
  /** The raw file path, for error messages. */
  path: string;
}

/**
 * Read, parse, and schema-validate one Declaration YAML file.
 * Never throws for a malformed or invalid file: parse failures and schema
 * failures both surface as `{ valid: false, errors }`, per SPEC.md's
 * fail-closed principle — a Declaration that cannot be trusted is treated
 * the same as one that says "deny everything".
 */
export async function loadDeclaration(path: string): Promise<DeclarationLoadResult> {
  let text: string;
  try {
    text = await Bun.file(path).text();
  } catch (err) {
    return { valid: false, errors: [`cannot read file: ${(err as Error).message}`], path };
  }

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    return { valid: false, errors: [`invalid YAML: ${(err as Error).message}`], path };
  }

  const schema = await loadJson(SCHEMA_PATH) as object;
  const result: SchemaValidationResult = validateAgainst2020Schema(schema, raw);
  if (!result.valid) {
    return { valid: false, errors: result.errors, path };
  }
  return { valid: true, errors: [], declaration: raw as Declaration, path };
}

/** Load every `*.yaml` / `*.yml` file directly under `dir`, skipping subdirectories. */
export async function loadDeclarationsFromDir(dir: string): Promise<DeclarationLoadResult[]> {
  const glob = new Bun.Glob("*.{yaml,yml}");
  const results: DeclarationLoadResult[] = [];
  for await (const file of glob.scan({ cwd: dir, absolute: true })) {
    results.push(await loadDeclaration(file));
  }
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}
