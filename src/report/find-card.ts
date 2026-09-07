import type { AgentCard } from "../card/types.ts";

export interface FoundCard {
  path: string;
  card: AgentCard;
}

/**
 * A trace's lines carry `card_sha256` but not the Card itself or its path
 * (SPEC.md C27 lists the trace's 12 fields; a file path is not one of
 * them, and `colophon report --session <id>` / `--trace <file>` take no
 * `--card` flag per the C39 probe). So the report engine has to find the
 * Card independently: scan every `*.card.json` under the given roots and
 * match by `metadata.canonical_sha256`, the same hash the gate embedded in
 * the trace. "No match found" is treated as a conservative failure by
 * callers (report/checks.ts's `noCardResult`), never as "assume no Card".
 */
export async function findCardBySha256(sha256: string, roots: string[] = ["cards", "fixtures/cards", "out"]): Promise<FoundCard | undefined> {
  const glob = new Bun.Glob("**/*.card.json");
  for (const root of roots) {
    const exists = await Bun.file(root)
      .exists()
      .catch(() => false);
    // Bun.file().exists() is for files; a directory root still needs scanning,
    // so don't skip on `exists === false` for directories — Glob.scan handles
    // a missing directory by yielding nothing, which is what we want anyway.
    void exists;
    try {
      for await (const file of glob.scan({ cwd: root, absolute: true })) {
        try {
          const card = JSON.parse(await Bun.file(file).text()) as AgentCard;
          if (card?.metadata?.canonical_sha256 === sha256) {
            return { path: file, card };
          }
        } catch {
          // Not a readable/parseable Card file — skip it rather than fail the whole search.
          continue;
        }
      }
    } catch {
      // Root doesn't exist or isn't scannable — try the next one.
      continue;
    }
  }
  return undefined;
}
