import { loadDeclaration, loadDeclarationsFromDir } from "../../declare/load.ts";

const DEFAULT_INVENTORY_DIR = "inventory/agents";

export async function runDeclareCommand(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "validate":
      return validate(rest);
    case "list":
      return list(rest);
    default:
      console.error(`colophon declare: unknown subcommand '${subcommand ?? ""}'`);
      console.error("usage: colophon declare validate <file> | colophon declare list");
      return 1;
  }
}

async function validate(args: string[]): Promise<number> {
  const file = args[0];
  if (!file) {
    console.error("usage: colophon declare validate <file>");
    return 1;
  }
  const result = await loadDeclaration(file);
  if (!result.valid) {
    console.error(`colophon declare validate: ${file}: INVALID`);
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    return 1;
  }
  console.log(`colophon declare validate: ${file}: OK (${result.declaration!.name})`);
  return 0;
}

async function list(args: string[]): Promise<number> {
  const dir = args[0] ?? DEFAULT_INVENTORY_DIR;
  const results = await loadDeclarationsFromDir(dir);
  if (results.length === 0) {
    console.error(`colophon declare list: no declarations found under ${dir}`);
    return 0;
  }

  let anyInvalid = false;
  const rows: { id: string; name: string; risk_tier: string; tools: number }[] = [];
  for (const r of results) {
    if (!r.valid || !r.declaration) {
      anyInvalid = true;
      console.error(`colophon declare list: ${r.path}: INVALID (${r.errors.join("; ")})`);
      continue;
    }
    rows.push({
      id: r.declaration.id,
      name: r.declaration.name,
      risk_tier: r.declaration.risk_tier,
      tools: r.declaration.tools.length,
    });
  }

  const idW = Math.max(2, ...rows.map((r) => r.id.length));
  const nameW = Math.max(4, ...rows.map((r) => r.name.length));
  const tierW = Math.max(9, ...rows.map((r) => r.risk_tier.length));
  console.log(
    `${"ID".padEnd(idW)}  ${"NAME".padEnd(nameW)}  ${"RISK_TIER".padEnd(tierW)}  TOOLS`
  );
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(idW)}  ${r.name.padEnd(nameW)}  ${r.risk_tier.padEnd(tierW)}  ${r.tools}`
    );
  }
  return anyInvalid ? 1 : 0;
}
