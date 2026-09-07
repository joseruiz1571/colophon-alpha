import { runAgent } from "../../agent/run.ts";

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

export async function runAgentCommand(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  if (subcommand !== "run") {
    console.error(`colophon agent: unknown subcommand '${subcommand ?? ""}'`);
    console.error('usage: colophon agent run --scenario <file> --card <card> [--upstream "<cmd>"] [--approvals <file>] [--session <id>] [--list-tools]');
    return 1;
  }
  const flags = parseFlags(rest);
  const cardPath = flags["card"] as string | undefined;
  if (!cardPath) {
    console.error("usage: colophon agent run --scenario <file> --card <card> [...]");
    return 1;
  }
  const listToolsOnly = flags["list-tools"] === true;
  const scenarioPath = flags["scenario"] as string | undefined;
  if (!listToolsOnly && !scenarioPath) {
    console.error("colophon agent run: --scenario is required unless --list-tools is given");
    return 1;
  }

  try {
    const outcome = await runAgent({
      scenarioPath,
      cardPath,
      upstreamCommand: flags["upstream"] as string | undefined,
      approvalsPath: flags["approvals"] as string | undefined,
      sessionId: flags["session"] as string | undefined,
      listToolsOnly,
    });

    console.error(`colophon agent run: session ${outcome.sessionId}`);
    if (outcome.toolNames) {
      for (const name of outcome.toolNames) console.log(name);
      return 0;
    }
    for (const step of outcome.steps ?? []) {
      console.log(`[${step.index}] ${step.tool}: ${step.effect} — ${step.summary}`);
    }
    return 0;
  } catch (err) {
    console.error(`colophon agent run: ${(err as Error).message}`);
    return 1;
  }
}
