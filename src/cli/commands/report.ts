import { mkdir } from "node:fs/promises";
import { buildReport, ReportBuildError } from "../../report/build.ts";
import { MissingEvidenceCitationError } from "../../report/citations.ts";

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

const USAGE = "usage: colophon report --session <id> --out <dir>\n       colophon report --trace <file> --out <dir>";

export async function runReportCommand(args: string[]): Promise<number> {
  const flags = parseFlags(args);
  const outDir = flags["out"];
  const sessionId = flags["session"];
  const tracePathFlag = flags["trace"];

  if (!outDir || (!sessionId && !tracePathFlag)) {
    console.error(USAGE);
    return 1;
  }

  const tracePath = tracePathFlag ?? `trace/${sessionId}.jsonl`;

  try {
    const outcome = await buildReport({ tracePath });

    // Nothing is written until buildReport has already succeeded, including
    // the C37 citation check and OSCAL schema validation — so a partial or
    // invalid report is never left on disk.
    const dir = outDir.replace(/\/+$/, "");
    await mkdir(dir, { recursive: true });
    await Bun.write(`${dir}/assessment-results.json`, outcome.assessmentResultsJson);
    await Bun.write(`${dir}/narrative.md`, outcome.narrativeMarkdown);

    const satisfied = outcome.outcomes.filter((o) => o.result.state === "satisfied").length;
    console.log(
      `colophon report: session ${outcome.sessionId}: ${outcome.outcomes.length} control(s) evaluated, ` +
        `${satisfied} satisfied, ${outcome.outcomes.length - satisfied} not satisfied`,
    );
    console.log(`colophon report: wrote ${dir}/assessment-results.json and ${dir}/narrative.md`);
    return 0;
  } catch (err) {
    if (err instanceof MissingEvidenceCitationError || err instanceof ReportBuildError) {
      console.error(`colophon report: FAIL CLOSED: ${err.message}`);
      return 1;
    }
    console.error(`colophon report: ${(err as Error).message}`);
    return 1;
  }
}
