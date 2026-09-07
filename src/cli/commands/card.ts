import { loadDeclarationsFromDir } from "../../declare/load.ts";
import { buildCard } from "../../card/build.ts";
import { verifyCard } from "../../card/verify.ts";
import { lintCard } from "../../card/lint.ts";
import { loadCard, writeCard } from "../../card/io.ts";

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

export async function runCardCommand(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "export":
      return exportCard(rest);
    case "verify":
      return verify(rest);
    case "lint":
      return lint(rest);
    case "validate":
      return validate(rest);
    default:
      console.error(`colophon card: unknown subcommand '${subcommand ?? ""}'`);
      return 1;
  }
}

async function exportCard(args: string[]): Promise<number> {
  const { positional, flags } = parseFlags(args);
  const agentId = positional[0];
  const outDir = flags["out"];
  if (!agentId || !outDir) {
    console.error("usage: colophon card export <agent-id> --out <dir>");
    return 1;
  }

  const declarations = await loadDeclarationsFromDir("inventory/agents");
  const match = declarations.find((d) => d.valid && d.declaration?.id === agentId);
  if (!match || !match.declaration) {
    console.error(`colophon card export: no valid Declaration with id '${agentId}' found under inventory/agents/`);
    return 1;
  }

  const card = buildCard(match.declaration);
  const outPath = `${outDir.replace(/\/+$/, "")}/${agentId}.card.json`;
  await writeCard(outPath, card);
  console.log(`colophon card export: wrote ${outPath}`);
  return 0;
}

async function verify(args: string[]): Promise<number> {
  const path = args[0];
  if (!path) {
    console.error("usage: colophon card verify <card>");
    return 1;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await Bun.file(path).text());
  } catch (err) {
    console.error(`colophon card verify: cannot read/parse ${path}: ${(err as Error).message}`);
    return 1;
  }
  const result = verifyCard(raw as never);
  if (!result.ok) {
    console.error(`colophon card verify: ${path}: MISMATCH`);
    console.error(`  expected (stored):   ${result.expected}`);
    console.error(`  actual (recomputed): ${result.actual}`);
    return 1;
  }
  console.log(`colophon card verify: ${path}: OK (${result.actual})`);
  return 0;
}

async function lint(args: string[]): Promise<number> {
  const path = args[0];
  if (!path) {
    console.error("usage: colophon card lint <card>");
    return 1;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await Bun.file(path).text());
  } catch (err) {
    console.error(`colophon card lint: cannot read/parse ${path}: ${(err as Error).message}`);
    return 1;
  }
  const decision = await lintCard(raw);
  if (!decision.allow) {
    console.error(`colophon card lint: ${path}: DENY`);
    for (let i = 0; i < decision.reasons.length; i++) {
      console.error(`  - [${decision.rule_ids[i]}] ${decision.reasons[i]}`);
    }
    return 1;
  }
  console.log(`colophon card lint: ${path}: ALLOW`);
  return 0;
}

async function validate(args: string[]): Promise<number> {
  const path = args[0];
  if (!path) {
    console.error("usage: colophon card validate <card>");
    return 1;
  }
  const result = await loadCard(path);
  if (!result.valid) {
    console.error(`colophon card validate: ${path}: INVALID`);
    for (const err of result.errors) console.error(`  - ${err}`);
    return 1;
  }
  console.log(`colophon card validate: ${path}: OK`);
  return 0;
}
