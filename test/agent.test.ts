import { describe, expect, test } from "bun:test";
import { runAgent } from "../src/agent/run.ts";
import { UPSTREAM_TOOLS } from "../src/upstream/tools.ts";
import { verifyTraceFile } from "../src/trace/verify.ts";

const EVIDENCE_CARD = "cards/3f2a9e10-6b7a-4b1a-9c9e-2b6a7f4d1a01.card.json";
const NOTIFIER_CARD = "cards/8c1d4f22-0a3e-4c77-b6a1-5e9f2d7c3b02.card.json";

describe("Demo upstream (F4, C21)", () => {
  test("declares exactly the seven required synthetic tools", () => {
    const names = UPSTREAM_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      ["auth.request_scopes", "fs.read", "fs.write", "mail.send", "net.fetch", "repo.list", "repo.read_settings"].sort(),
    );
  });
});

describe("Agent driver interface (C23)", () => {
  test("an LlmDriver interface exists with no implementation", async () => {
    const src = await Bun.file("src/agent/driver.ts").text();
    expect(src).toMatch(/interface LlmDriver/);
    expect(src).not.toMatch(/class LlmDriver/);
  });

  test("no LLM provider SDK is a dependency (A4)", async () => {
    const pkg = JSON.parse(await Bun.file("package.json").text());
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const llmSdkPattern = /^(openai|anthropic-ai|@anthropic-ai|@google\/generative-ai|cohere-ai|@mistralai)/i;
    expect(deps.some((d) => llmSdkPattern.test(d))).toBe(false);
  });
});

describe("Scenarios (C10, C22, C24, C25, C26)", () => {
  test(
    "agent run --list-tools returns exactly the Card's granted tools (C10)",
    async () => {
      const outcome = await runAgent({ cardPath: EVIDENCE_CARD, listToolsOnly: true });
      expect(outcome.toolNames?.sort()).toEqual(["fs.read", "repo.list", "repo.read_settings"].sort());
    },
    20000,
  );

  test(
    "evidence-report.yaml: exits cleanly with 4 denials and in-scope reads allowed (C22, C24)",
    async () => {
      const outcome = await runAgent({ scenarioPath: "scenarios/evidence-report.yaml", cardPath: EVIDENCE_CARD });
      const steps = outcome.steps!;
      expect(steps).toHaveLength(8);

      const denied = steps.filter((s) => s.effect === "denied").map((s) => s.tool);
      expect(denied).toEqual(["auth.request_scopes", "fs.write", "repo.read_settings", "mail.send"]);

      const allowed = steps.filter((s) => s.effect === "allow").map((s) => s.tool);
      expect(allowed).toEqual(["repo.list", "repo.read_settings", "repo.read_settings", "fs.read"]);

      const trace = await verifyTraceFile(`trace/${outcome.sessionId}.jsonl`);
      expect(trace.ok).toBe(true);
      expect(trace.lineCount).toBe(8);
    },
    30000,
  );

  test(
    "compliant-run.yaml: every decision is allow (C25)",
    async () => {
      const outcome = await runAgent({ scenarioPath: "scenarios/compliant-run.yaml", cardPath: EVIDENCE_CARD });
      expect(outcome.steps!.every((s) => s.effect === "allow")).toBe(true);
    },
    20000,
  );

  test(
    "approval-flow.yaml with a matching approval: first call allow, identical second call escalates again (C17, C26)",
    async () => {
      const outcome = await runAgent({
        scenarioPath: "scenarios/approval-flow.yaml",
        cardPath: NOTIFIER_CARD,
        approvalsPath: "fixtures/approvals/one.json",
      });
      const steps = outcome.steps!;
      expect(steps).toHaveLength(2);
      expect(steps[0]!.effect).toBe("allow");
      expect(steps[1]!.effect).toBe("denied"); // escalate surfaces as isError, summarized as "denied"

      const trace = await verifyTraceFile(`trace/${outcome.sessionId}.jsonl`);
      expect(trace.ok).toBe(true);
      const lines = (await Bun.file(`trace/${outcome.sessionId}.jsonl`).text())
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      expect(lines.map((l) => l.effect)).toEqual(["allow", "escalate"]);
    },
    20000,
  );

  test(
    "approval-flow.yaml with no approvals file: both identical calls escalate",
    async () => {
      const outcome = await runAgent({ scenarioPath: "scenarios/approval-flow.yaml", cardPath: NOTIFIER_CARD });
      expect(outcome.steps!.every((s) => s.effect === "denied")).toBe(true);
    },
    20000,
  );

  test(
    "an invalid Card denies every call and never reaches the upstream (C18)",
    async () => {
      const outcome = await runAgent({
        scenarioPath: "scenarios/compliant-run.yaml",
        cardPath: "fixtures/cards/zero-uuid.card.json",
      });
      expect(outcome.steps!.every((s) => s.effect === "denied")).toBe(true);
      expect(outcome.steps!.every((s) => s.summary.includes("GATE-INVALID-CARD"))).toBe(true);
    },
    20000,
  );
});
