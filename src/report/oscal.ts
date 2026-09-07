import { newUuidV4 } from "../util/id.ts";
import { nowIso } from "../util/time.ts";
import type { ControlDef, ControlCheckResult } from "./types.ts";
import type { CitingObservation } from "./citations.ts";

/**
 * A deliberately loose TypeScript shape for the one corner of OSCAL
 * Assessment Results this report actually populates — not a full port of
 * the NIST information model. Schema conformance is enforced at runtime by
 * validateAgainstDraft07Schema against the vendored schema (see
 * DECISIONS.md, F7 and the earlier OSCAL/JSON-Schema draft-mismatch note),
 * not by this type.
 */
export interface AssessmentResultsDoc {
  "assessment-results": {
    uuid: string;
    metadata: {
      title: string;
      "last-modified": string;
      version: string;
      "oscal-version": string;
    };
    "import-ap": { href: string; remarks?: string };
    results: Array<{
      uuid: string;
      title: string;
      description: string;
      start: string;
      "reviewed-controls": {
        "control-selections": Array<{
          "include-controls": Array<{ "control-id": string }>;
        }>;
      };
      observations: Array<{
        uuid: string;
        description: string;
        methods: string[];
        collected: string;
        "relevant-evidence"?: Array<{ description: string; href: string }>;
      }>;
      findings: Array<{
        uuid: string;
        title: string;
        description: string;
        target: {
          type: "objective-id";
          "target-id": string;
          status: { state: "satisfied" | "not-satisfied"; reason: "pass" | "fail" };
        };
        "related-observations": Array<{ "observation-uuid": string }>;
      }>;
    }>;
  };
}

export interface ControlOutcome {
  control: ControlDef;
  result: ControlCheckResult;
}

export interface BuildAssessmentResultsOptions {
  sessionId: string;
  outcomes: ControlOutcome[];
}

export interface BuildAssessmentResultsResult {
  doc: AssessmentResultsDoc;
  /** Every observation, for citation validation against the evidence store before writing. */
  observations: CitingObservation[];
}

/**
 * Build one Assessment Results document with one finding per control
 * (SPEC.md C36) and one observation per control citing the evidence ids
 * the check actually used (see DECISIONS.md, F7, on reading "evidence
 * UUID" as the content-addressed evidence id defined by C30, not a
 * separately-minted RFC 4122 UUID — minting a second identifier would
 * break evidence's content-addressing).
 */
export function buildAssessmentResults(opts: BuildAssessmentResultsOptions): BuildAssessmentResultsResult {
  const now = nowIso();
  const observations: AssessmentResultsDoc["assessment-results"]["results"][number]["observations"] = [];
  const findings: AssessmentResultsDoc["assessment-results"]["results"][number]["findings"] = [];
  const citingObservations: CitingObservation[] = [];

  for (const { control, result } of opts.outcomes) {
    const observationUuid = newUuidV4();
    const relevantEvidence =
      result.relatedEvidenceIds.length > 0
        ? result.relatedEvidenceIds.map((id) => ({
            description: `evidence item ${id}`,
            href: `urn:colophon:evidence:${id}`,
          }))
        : undefined;

    observations.push({
      uuid: observationUuid,
      description: `[${control.id}] ${result.reasonSummary}`,
      methods: ["TEST"],
      collected: now,
      ...(relevantEvidence ? { "relevant-evidence": relevantEvidence } : {}),
    });
    citingObservations.push({ uuid: observationUuid, relatedEvidenceIds: result.relatedEvidenceIds });

    findings.push({
      uuid: newUuidV4(),
      title: control.id,
      description: control.intent,
      target: {
        type: "objective-id",
        "target-id": control.id,
        status: {
          state: result.state,
          reason: result.state === "satisfied" ? "pass" : "fail",
        },
      },
      "related-observations": [{ "observation-uuid": observationUuid }],
    });
  }

  const doc: AssessmentResultsDoc = {
    "assessment-results": {
      uuid: newUuidV4(),
      metadata: {
        title: `Colophon Assessment Results — session ${opts.sessionId}`,
        "last-modified": now,
        version: "1.0.0",
        "oscal-version": "1.1.2",
      },
      "import-ap": {
        href: "urn:colophon:no-assessment-plan",
        remarks:
          "Colophon v1 does not author a separate OSCAL Assessment Plan; controls/agent-controls.yaml is " +
          "authored and evaluated directly by 'colophon report' (see DECISIONS.md, F7).",
      },
      results: [
        {
          uuid: newUuidV4(),
          title: `Gate decision review — session ${opts.sessionId}`,
          description:
            "Deterministic, policy-derived review of every MCP tool-call decision recorded in this " +
            "session's hash-chained trace, evaluated against the control set in controls/agent-controls.yaml.",
          start: now,
          "reviewed-controls": {
            "control-selections": [
              {
                "include-controls": opts.outcomes.map((o) => ({ "control-id": o.control.id })),
              },
            ],
          },
          observations,
          findings,
        },
      ],
    },
  };

  return { doc, observations: citingObservations };
}
