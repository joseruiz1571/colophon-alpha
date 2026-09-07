import { verifyTraceFile } from "../trace/verify.ts";
import { MCPTraceCollector } from "../collectors/mcp-trace-collector.ts";
import { CardCollector } from "../collectors/card-collector.ts";
import { EvidenceStore } from "../evidence/store.ts";
import type { EvidenceItem } from "../evidence/types.ts";
import { loadControls } from "./controls.ts";
import { CHECKS, type CheckContext } from "./checks.ts";
import { findCardBySha256 } from "./find-card.ts";
import { buildAssessmentResults, type ControlOutcome } from "./oscal.ts";
import { buildNarrative } from "./narrative.ts";
import { validateCitations } from "./citations.ts";
import { validateAgainstDraft07Schema, loadJson } from "../util/schema.ts";
import type { TraceLine } from "../trace/types.ts";

const OSCAL_SCHEMA_PATH = new URL(
  "../../schemas/vendor/oscal_assessment-results_schema-1.1.2.json",
  import.meta.url,
).pathname;
const DEFAULT_CONTROLS_PATH = "controls/agent-controls.yaml";

/**
 * Thrown for any condition that must stop report generation before a file
 * is written: an unverified trace, an invalid controls file, or a built
 * document that fails schema validation against the vendored OSCAL schema.
 * Fail-closed, same principle as the gate (SPEC.md §4).
 */
export class ReportBuildError extends Error {}

export interface BuildReportOptions {
  tracePath: string;
  controlsPath?: string;
}

export interface ReportBuildOutcome {
  sessionId: string;
  assessmentResultsJson: string;
  narrativeMarkdown: string;
  evidenceStore: EvidenceStore;
  outcomes: ControlOutcome[];
}

/**
 * Build an OSCAL Assessment Results document plus a narrative from one
 * trace file (SPEC.md F7). Never writes anything to disk itself — callers
 * (the CLI) only write once this resolves, so a thrown ReportBuildError or
 * MissingEvidenceCitationError (src/report/citations.ts) always means
 * nothing was written.
 */
export async function buildReport(opts: BuildReportOptions): Promise<ReportBuildOutcome> {
  const verification = await verifyTraceFile(opts.tracePath);
  if (!verification.ok) {
    throw new ReportBuildError(
      `refusing to build a report from an unverified trace (${opts.tracePath}): ` +
        `line ${verification.badLine}: ${verification.reason}`,
    );
  }

  const text = await Bun.file(opts.tracePath).text();
  const lines = text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as TraceLine);
  const sessionId = lines[0]?.session_id ?? opts.tracePath.split("/").pop()!.replace(/\.jsonl$/, "");
  const cardSha = lines[0]?.card_sha256;

  const store = new EvidenceStore();
  const traceItems = await new MCPTraceCollector(opts.tracePath).collect();
  store.addAll(traceItems);

  let cardItems: EvidenceItem[] = [];
  if (cardSha) {
    const found = await findCardBySha256(cardSha);
    if (found) {
      cardItems = await new CardCollector(found.card).collect();
      store.addAll(cardItems);
    }
  }

  const traceDecisionItems = traceItems.filter((i) => !i.source.endsWith(":summary"));
  const traceSummaryItem = traceItems.find((i) => i.source.endsWith(":summary"));

  const controlsResult = await loadControls(opts.controlsPath ?? DEFAULT_CONTROLS_PATH);
  if (!controlsResult.valid) {
    throw new ReportBuildError(`controls file invalid: ${controlsResult.errors.join("; ")}`);
  }

  const ctx: CheckContext = { traceDecisionItems, traceSummaryItem, cardItems, chainVerified: verification.ok };
  const outcomes: ControlOutcome[] = controlsResult.controls.map((control) => ({
    control,
    result: CHECKS[control.check]!(ctx),
  }));

  const { doc, observations } = buildAssessmentResults({ sessionId, outcomes });

  // SPEC.md C37: fail closed, before writing anything, if any observation
  // cites an evidence id this run's store doesn't actually hold.
  validateCitations(observations, store);

  const schema = (await loadJson(OSCAL_SCHEMA_PATH)) as object;
  const schemaResult = validateAgainstDraft07Schema(schema, doc);
  if (!schemaResult.valid) {
    throw new ReportBuildError(
      `built assessment-results document failed validation against the vendored OSCAL schema: ` +
        schemaResult.errors.join("; "),
    );
  }

  const narrativeMarkdown = buildNarrative({ sessionId, outcomes });

  return {
    sessionId,
    assessmentResultsJson: JSON.stringify(doc, null, 2) + "\n",
    narrativeMarkdown,
    evidenceStore: store,
    outcomes,
  };
}
