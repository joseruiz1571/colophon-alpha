import { describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { runDemo, formatSummaryTable } from "../src/demo/run.ts";

describe("colophon demo (F9, C43, C44)", () => {
  test(
    "runs declare -> card -> gate -> agent -> collect -> report -> bundle -> verify for all three scenarios",
    async () => {
      const result = await runDemo({ runId: `test-${Date.now()}-a` });
      expect(result.scenarios).toHaveLength(3);
      for (const s of result.scenarios) {
        expect(s.chainVerified).toBe(true);
        expect(s.bundleVerified).toBe(true);
        expect(s.signatureVerified).toBe(true);
      }

      const compliant = result.scenarios.find((s) => s.scenario === "compliant-run")!;
      expect(compliant.counts.deny).toBe(0);
      expect(compliant.counts.escalate).toBe(0);

      const evidenceReport = result.scenarios.find((s) => s.scenario === "evidence-report")!;
      expect(evidenceReport.counts.deny).toBe(4);

      const approvalFlow = result.scenarios.find((s) => s.scenario === "approval-flow")!;
      expect(approvalFlow.counts.allow).toBe(1);
      expect(approvalFlow.counts.escalate).toBe(1);

      const table = formatSummaryTable(result);
      expect(table).toContain("compliant-run");
      expect(table).toContain("evidence-report");
      expect(table).toContain("approval-flow");

      await rm(result.runDir, { recursive: true, force: true });
    },
    45000,
  );

  test(
    "two consecutive runs with distinct run ids both succeed without colliding",
    async () => {
      const runIdA = `test-${Date.now()}-b1`;
      const runIdB = `test-${Date.now()}-b2`;
      const resultA = await runDemo({ runId: runIdA });
      const resultB = await runDemo({ runId: runIdB });
      expect(resultA.runDir).not.toBe(resultB.runDir);
      expect(resultA.scenarios.every((s) => s.bundleVerified)).toBe(true);
      expect(resultB.scenarios.every((s) => s.bundleVerified)).toBe(true);
      await rm(resultA.runDir, { recursive: true, force: true });
      await rm(resultB.runDir, { recursive: true, force: true });
    },
    90000,
  );
});
