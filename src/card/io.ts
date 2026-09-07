import { validateAgainst2020Schema, loadJson, type SchemaValidationResult } from "../util/schema.ts";
import type { AgentCard } from "./types.ts";

const SCHEMA_PATH = new URL("../../schemas/agent-card.schema.json", import.meta.url).pathname;

export async function loadCardSchema(): Promise<object> {
  return (await loadJson(SCHEMA_PATH)) as object;
}

export interface CardLoadResult {
  valid: boolean;
  errors: string[];
  card?: AgentCard;
  path: string;
}

/** Read and schema-validate a Card JSON file. Never throws on malformed input. */
export async function loadCard(path: string): Promise<CardLoadResult> {
  let raw: unknown;
  try {
    const text = await Bun.file(path).text();
    raw = JSON.parse(text);
  } catch (err) {
    return { valid: false, errors: [`cannot read/parse JSON: ${(err as Error).message}`], path };
  }
  const schema = await loadCardSchema();
  const result: SchemaValidationResult = validateAgainst2020Schema(schema, raw);
  if (!result.valid) {
    return { valid: false, errors: result.errors, path };
  }
  return { valid: true, errors: [], card: raw as AgentCard, path };
}

export async function writeCard(path: string, card: AgentCard): Promise<void> {
  await Bun.write(path, JSON.stringify(card, null, 2) + "\n");
}
