import { describe, expect, test } from "bun:test";
import { loadControls } from "../src/report/controls.ts";
import { CHECKS, type CheckContext } from "../src/report/checks.ts";
import { buildReport, ReportBuildError } from "../src/report/build.ts";
import { validateCitations, MissingEvidenceCitationError } from "../src/report/citations.ts";
import { EvidenceStore } from "../src/evidence/store.ts";
import { sha256OfCanonical } from "../src/util/canonical.ts";
import { runAgent } from "../src/agent/run.ts";
import type { EvidenceItem } from "../src/evidence/types.ts";
import type { AgentCard } from "../src/card/types.ts";

const EVIDENCE_CARD_PATH = "cards/3f2a9e10-6b7a-4b1a-9c9e-2b6a7f4d1a01.card.json";

function evidenceItem(source: string, payload: unknown): EvidenceItem {
  const sha256 = sha256OfCanonical(payload);
  return { id: sha256, source, retrieved_at: "2026-01-01T00:00:00.000Z", sha256, payload };
}

describe("controls/agent-controls.yaml (C34, C35)", () => {
  test("defines at least 8 controls, each naming a real CHECKS function", async () => {
    const result = await loadControls("controls/agent-controls.yaml");
    expect(result.valid).toBe(true);
    expect(result.controls.length).toBeGreaterThanOrEqual(8);
    for (const control of result.controls) {
      expect(CHECKS[control.check]).toBeDefined();
      expect(control.framework_refs.length).toBeGreaterThan(0);
      expect(control.intent.length).toBeGreaterThan(0);
    }
  });

  test("covers all eight required themes in the file text", async () => {
    const text = await Bun.file("controls/agent-controls.yaml").text();
    for (const theme of ["outside", "sandbox", "scope", "rule_id", "chain", "stale", "approval", "manifest"]) {
      expect(text).toContain(theme);
    }
  });
});

describe("report checks (F7)", () => {
  test("no-outside-calls: satisfied when every allow names a Card tool", async () => {
    const card = JSON.parse(await Bun.file(EVIDENCE_CARD_PATH).text()) as AgentCard;
    const cardItem = evidenceItem(`card:${card.metadata.id}`, card);
    const decision = evidenceItem("trace:s:0", {
      tool: "repo.list",
      effect: "allow",
      rule_ids: ["GATE-ALLOWED"],
      args_redacted: {},
    });
    const ctx: CheckContext = {
      traceDecisionItems: [decision],
      traceSummaryItem: undefined,
      cardItems: [cardItem],
      chainVerified: true,
    };
    expect(CHECKS["no-outside-calls"]!(ctx).state).toBe("satisfied");
  });

  test("no-outside-calls: not-satisfied when an allow names a tool outside the Card", async () => {
    const card = JSON.parse(await Bun.file(EVIDENCE_CARD_PATH).text()) as AgentCard;
    const cardItem = evidenceItem(`card:${card.metadata.id}`, card);
    const decision = evidenceItem("trace:s:0", {
      tool: "mail.send",
      effect: "allow",
      rule_ids: ["GATE-ALLOWED"],
      args_redacted: {},
    });
    const ctx: CheckContext = {
      traceDecisionItems: [decision],
      traceSummaryItem: undefined,
      cardItems: [cardItem],
      chainVerified: true,
    };
    const result = CHECKS["no-outside-calls"]!(ctx);
    expect(result.state).toBe("not-satisfied");
    expect(result.relatedEvidenceIds).toContain(decision.id);
  });

  test("trace-chain-intact: mirrors the chainVerified flag it's given", () => {
    const ctx: CheckContext = { traceDecisionItems: [], traceSummaryItem: undefined, cardItems: [], chainVerified: false };
    expect(CHECKS["trace-chain-intact"]!(ctx).state).toBe("not-satisfied");
  });

  test("card-not-stale: not-satisfied when next_review is in the past", () => {
    const staleCard = {
      metadata: { id: "x" },
      classification: { next_review: "2000-01-01" },
      tools: [],
      sandbox: { write_paths: [] },
    } as unknown as AgentCard;
    const ctx: CheckContext = {
      traceDecisionItems: [],
      traceSummaryItem: undefined,
      cardItems: [evidenceItem("card:x", staleCard)],
      chainVerified: true,
    };
    expect(CHECKS["card-not-stale"]!(ctx).state).toBe("not-satisfied");
  });

  test("approval-required-enforced: not-satisfied when an approval-required tool ran without GATE-APPROVED", () => {
    const card = {
      metadata: { id: "x" },
      classification: { next_review: "2099-01-01" },
      tools: [{ name: "fs.write", data_access: "write", data_classes: [], requires_approval: true }],
      sandbox: { write_paths: [] },
    } as unknown as AgentCard;
    const decision = evidenceItem("trace:s:0", {
      tool: "fs.write",
      effect: "allow",
      rule_ids: ["GATE-ALLOWED"],
      args_redacted: {},
    });
    const ctx: CheckContext = {
      traceDecisionItems: [decision],
      traceSummaryItem: undefined,
      cardItems: [evidenceItem("card:x", card)],
      chainVerified: true,
    };
    expect(CHECKS["approval-required-enforced"]!(ctx).state).toBe("not-satisfied");
  });
});

describe("citation invariant (C37)", () => {
  test("validateCitations throws MissingEvidenceCitationError for a dangling evidence id", () => {
    const store = new EvidenceStore();
    store.addAll([evidenceItem("card:x", { a: 1 })]);
    expect(() =>
      validateCitations([{ uuid: "obs-1", relatedEvidenceIds: ["not-a-real-id"] }], store),
    ).toThrow(MissingEvidenceCitationError);
  });

  test("validateCitations passes when every cited id exists", () => {
    const store = new EvidenceStore();
    const item = evidenceItem("card:x", { a: 1 });
    store.addAll([item]);
    expect(() => validateCitations([{ uuid: "obs-1", relatedEvidenceIds: [item.id] }], store)).not.toThrow();
  });
});

describe("colophon report end to end (C36, C38, C39)", () => {
  test(
    "compliant-run.yaml: report has all controls satisfied, valid OSCAL doc, narrative names what it does not prove",
    async () => {
      const outcome = await runAgent({ scenarioPath: "scenarios/compliant-run.yaml", cardPath: EVIDENCE_CARD_PATH });
      const report = await buildReport({ tracePath: `trace/${outcome.sessionId}.jsonl` });

      expect(report.outcomes.every((o) => o.result.state === "satisfied")).toBe(true);
      expect(report.narrativeMarkdown).toMatch(/does not prove/i);

      const doc = JSON.parse(report.assessmentResultsJson);
      expect(doc["assessment-results"].results[0].findings).toHaveLength(report.outcomes.length);
      const citedIds = doc["assessment-results"].results[0].observations.flatMap(
        (o: { "relevant-evidence"?: Array<{ href: string }> }) =>
          (o["relevant-evidence"] ?? []).map((e) => e.href.replace("urn:colophon:evidence:", "")),
      );
      for (const id of citedIds) expect(report.evidenceStore.has(id)).toBe(true);
    },
    20000,
  );

  test(
    "fixtures/traces/breach.jsonl (C39): the no-outside-calls control is not-satisfied and it is the only one",
    async () => {
      const report = await buildReport({ tracePath: "fixtures/traces/breach.jsonl" });
      const notSatisfied = report.outcomes.filter((o) => o.result.state === "not-satisfied");
      expect(notSatisfied.map((o) => o.control.id)).toEqual(["no-outside-calls"]);
    },
  );

  test("refuses to build from an unverified (tampered) trace", async () => {
    const outcome = await runAgent({ scenarioPath: "scenarios/compliant-run.yaml", cardPath: EVIDENCE_CARD_PATH });
    const path = `trace/${outcome.sessionId}.jsonl`;
    const tampered = (await Bun.file(path).text()).replace('"tool":"repo.list"', '"tool":"repo.tampered"');
    await Bun.write(path, tampered);
    await expect(buildReport({ tracePath: path })).rejects.toThrow(ReportBuildError);
  }, 20000);
});
