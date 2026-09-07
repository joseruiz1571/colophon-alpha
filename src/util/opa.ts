// Thin wrapper around the `opa` CLI binary.
//
// SPEC.md's Principle 1 is "policy is data, not code": every allow/deny/
// escalate decision must come from Rego evaluated by OPA, and application
// code must never itself branch on tool name or argument content (see
// anti-claim A1). Concretely, that means every decision point in Colophon
// (gate, card lint) calls out to a real `opa eval` process against the
// policy files on disk, rather than reimplementing any part of the rule
// logic in TypeScript. `opa` must be on PATH; see README's prerequisites.

export interface OpaEvalResult {
  ok: boolean;
  /** Parsed JSON value at the queried path, or undefined if undefined/error. */
  value: unknown;
  /** stderr, for diagnostics when ok is false. */
  stderr: string;
}

/**
 * Run `opa eval -d <policyDir> -i <input (stdin)> --format json <query>` and
 * return the value bound at the query path. If OPA errors, or the query is
 * undefined, `ok` is false and `value` is undefined — callers must treat
 * this as fail-closed (deny), never as fail-open.
 */
export async function opaEval(policyDir: string, input: unknown, query: string): Promise<OpaEvalResult> {
  const proc = Bun.spawn({
    cmd: ["opa", "eval", "-d", policyDir, "-I", "--format", "json", query],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(JSON.stringify(input));
  await proc.stdin.end();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    return { ok: false, value: undefined, stderr: stderr || `opa exited ${exitCode}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    return { ok: false, value: undefined, stderr: `opa produced non-JSON output: ${(err as Error).message}` };
  }

  const result = (parsed as { result?: Array<{ expressions?: Array<{ value?: unknown }> }> }).result;
  if (!result || result.length === 0) {
    return { ok: false, value: undefined, stderr: "opa: query undefined (no result)" };
  }
  const expr = result[0]?.expressions?.[0];
  if (!expr || !("value" in expr)) {
    return { ok: false, value: undefined, stderr: "opa: query undefined (no expression value)" };
  }
  return { ok: true, value: expr.value, stderr: "" };
}
