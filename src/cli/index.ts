#!/usr/bin/env bun
import { runDeclareCommand } from "./commands/declare.ts";
import { runCardCommand } from "./commands/card.ts";
import { runGateCommand } from "./commands/gate.ts";
import { runUpstreamCommand } from "./commands/upstream.ts";
import { runAgentCommand } from "./commands/agent.ts";
import { runTraceCommand } from "./commands/trace.ts";
import { runReportCommand } from "./commands/report.ts";
import { runBundleCommand } from "./commands/bundle.ts";

const USAGE = `colophon — a signed, machine-readable record of what an AI agent was allowed to do.

Usage: colophon <command> [subcommand] [options]

Commands:
  declare validate <file>            Validate one Declaration against schemas/declaration.schema.json
  declare list                       List every Declaration under inventory/agents/
  card export <agent-id> --out <dir> Export a Declaration to a signed/hashable Agent Card
  card verify <card>                 Recompute and compare a Card's canonical_sha256
  card lint <card>                   Evaluate policy/card.rego against a Card
  card validate <card>               Validate a Card against schemas/agent-card.schema.json
  gate serve --card <card> --upstream "<cmd>" [--approvals <file>]
                                      Start the MCP gate as a stdio server
  upstream demo [--list-tools]       Start (or introspect) the synthetic demo upstream MCP server
  agent run --scenario <file> --card <card> [--approvals <file>] [--list-tools]
                                      Replay a scenario through the gate
  trace verify <file>                Verify a trace's hash chain
  report --session <id> --out <dir>  Emit assessment-results.json + narrative.md
  report --trace <file> --out <dir>  Same, from an arbitrary trace file (no live session)
  bundle --session <id> --out <dir>  Assemble report+evidence+trace+manifest
  bundle verify <dir> [--pub <pub>]  Verify a bundle's integrity (and signature, with --pub)
  bundle sign <dir> --key <key>      Cosign-sign a bundle's manifest

Run 'colophon <command> --help' for command-specific help.
`;

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case undefined:
    case "-h":
    case "--help":
      console.log(USAGE);
      return command === undefined ? 1 : 0;
    case "declare":
      return runDeclareCommand(rest);
    case "card":
      return runCardCommand(rest);
    case "gate":
      return runGateCommand(rest);
    case "upstream":
      return runUpstreamCommand(rest);
    case "agent":
      return runAgentCommand(rest);
    case "trace":
      return runTraceCommand(rest);
    case "report":
      return runReportCommand(rest);
    case "bundle":
      return runBundleCommand(rest);
    default:
      console.error(`colophon: unknown command '${command}'\n`);
      console.error(USAGE);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`colophon: fatal error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    process.exit(1);
  });
