import type { ControlOutcome } from "./oscal.ts";

/**
 * Build narrative.md (SPEC.md C38): a human-readable companion to
 * assessment-results.json with an explicit "what this proves / what it
 * does not prove" section (SPEC.md §4, "Custody is provable, judgment is
 * not"). Written to be pasteable into a third-party risk review as-is
 * (SPEC.md §11).
 */
export function buildNarrative(opts: { sessionId: string; outcomes: ControlOutcome[] }): string {
  const { sessionId, outcomes } = opts;
  const satisfied = outcomes.filter((o) => o.result.state === "satisfied");
  const notSatisfied = outcomes.filter((o) => o.result.state !== "satisfied");

  const lines: string[] = [];
  lines.push(`# Colophon assessment narrative — session ${sessionId}`);
  lines.push("");
  lines.push(
    `${outcomes.length} control(s) were evaluated against this session's hash-chained trace and Agent Card. ` +
      `${satisfied.length} satisfied, ${notSatisfied.length} not satisfied.`,
  );
  lines.push("");

  lines.push("## Findings");
  lines.push("");
  for (const { control, result } of outcomes) {
    const mark = result.state === "satisfied" ? "PASS" : "FAIL";
    lines.push(`- **[${mark}] ${control.id}** — ${result.reasonSummary}`);
  }
  lines.push("");

  lines.push("## What this proves");
  lines.push("");
  lines.push(
    "- **Integrity**: every decision in this session's trace is linked into a hash chain " +
      "(`colophon trace verify`); a single altered byte anywhere in the file is detectable and named by line.",
  );
  lines.push(
    "- **Completeness**: the evidence store behind this report holds one item per decision plus a summary " +
      "and the governing Card, each content-addressed by the SHA-256 of its own payload — nothing in this " +
      "report cites evidence that was not actually collected in this run (SPEC.md C37).",
  );
  lines.push(
    "- **Authenticity**: every allow, deny, and escalate decision here came from `policy/gate.rego` evaluated " +
      "by OPA, not from a branch in application code (SPEC.md A1) — the policy is what decided, and the trace " +
      "is what recorded that it did.",
  );
  lines.push("");

  lines.push("## What this does not prove");
  lines.push("");
  lines.push(
    "- **Correctness of judgment**: this report proves the gate enforced whatever `policy/gate.rego` says, " +
      "and that the record of it is unaltered. It does not prove the Card's declared scope, or the policy's " +
      "rules, were the *right* scope or rules for this agent — that is a judgment for the operator and any " +
      "reviewer, not something a hash chain can certify.",
  );
  lines.push(
    "- **What happened outside this session**: the trace, evidence, and findings above cover exactly one " +
      "session's decisions. They say nothing about calls made under a different Card, a different session, " +
      "or outside Colophon's gate entirely.",
  );
  if (notSatisfied.length > 0) {
    lines.push(
      `- **That every control held**: ${notSatisfied.length} control(s) in this run were **not satisfied** ` +
        `(${notSatisfied.map((o) => o.control.id).join(", ")}) — see Findings above for what each one found.`,
    );
  }
  lines.push("");

  return lines.join("\n");
}
