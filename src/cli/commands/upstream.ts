import { UPSTREAM_TOOLS } from "../../upstream/tools.ts";
import { runUpstreamStdioServer } from "../../upstream/server.ts";

export async function runUpstreamCommand(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  if (subcommand !== "demo") {
    console.error(`colophon upstream: unknown subcommand '${subcommand ?? ""}'`);
    console.error('usage: colophon upstream demo [--list-tools]');
    return 1;
  }
  if (rest.includes("--list-tools")) {
    for (const t of UPSTREAM_TOOLS) console.log(t.name);
    return 0;
  }
  await runUpstreamStdioServer();
  return 0;
}
