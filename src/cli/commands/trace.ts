import { verifyTraceFile } from "../../trace/verify.ts";

export async function runTraceCommand(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  if (subcommand !== "verify") {
    console.error(`colophon trace: unknown subcommand '${subcommand ?? ""}'`);
    console.error("usage: colophon trace verify <file>");
    return 1;
  }
  const path = rest[0];
  if (!path) {
    console.error("usage: colophon trace verify <file>");
    return 1;
  }
  const result = await verifyTraceFile(path);
  if (!result.ok) {
    console.error(`colophon trace verify: ${path}: TAMPERED at line ${result.badLine}`);
    console.error(`  - ${result.reason}`);
    return 1;
  }
  console.log(`colophon trace verify: ${path}: OK (${result.lineCount} lines)`);
  return 0;
}
