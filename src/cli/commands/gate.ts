import { runGateStdioServer, Gate } from "../../gate/server.ts";

function parseFlags(args: string[]): Record<string, string> {
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
    }
  }
  return flags;
}

export async function runGateCommand(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  if (subcommand !== "serve") {
    console.error(`colophon gate: unknown subcommand '${subcommand ?? ""}'`);
    console.error('usage: colophon gate serve --card <card> --upstream "<cmd>" [--approvals <file>] [--session <id>]');
    return 1;
  }
  const flags = parseFlags(rest);
  const cardPath = flags["card"];
  const upstreamCommand = flags["upstream"];
  if (!cardPath || !upstreamCommand) {
    console.error('usage: colophon gate serve --card <card> --upstream "<cmd>" [--approvals <file>] [--session <id>]');
    return 1;
  }

  if (flags["list-tools"] === "true") {
    const gate = new Gate({
      cardPath,
      upstreamCommand,
      approvalsPath: flags["approvals"],
      sessionId: flags["session"],
    });
    await gate.init();
    const { tools } = await gate.listTools();
    for (const t of tools) console.log(t.name);
    await gate.close();
    return 0;
  }

  await runGateStdioServer({
    cardPath,
    upstreamCommand,
    approvalsPath: flags["approvals"],
    sessionId: flags["session"],
  });
  return 0;
}
