#!/usr/bin/env bun
import { runDemo, formatSummaryTable } from "../src/demo/run.ts";

async function main(): Promise<number> {
  try {
    const result = await runDemo();
    console.log(`colophon demo: run ${result.runId} completed in ${result.elapsedMs}ms\n`);
    console.log(formatSummaryTable(result));
    console.log(`\ncolophon demo: bundles written under ${result.runDir}/`);
    return 0;
  } catch (err) {
    console.error(`colophon demo: FAILED: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    return 1;
  }
}

main().then((code) => process.exit(code));
