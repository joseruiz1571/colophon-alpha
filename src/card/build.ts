import type { Declaration } from "../declare/types.ts";
import type { AgentCard, ControlMapping, DecisionBoundary } from "./types.ts";
import { canonicalize, sha256Hex } from "../util/canonical.ts";
import { nowIso } from "../util/time.ts";

/**
 * Default review horizon (days from export time) when a Declaration does
 * not specify `next_review`. Shorter for higher risk tiers. Recorded in
 * DECISIONS.md (F2): the Declaration schema does not require next_review
 * (C2), but the Card schema does (C6), so export must fill a default.
 */
const DEFAULT_REVIEW_DAYS: Record<Declaration["risk_tier"], number> = {
  critical: 60,
  high: 90,
  medium: 180,
  low: 365,
};

function defaultNextReview(riskTier: Declaration["risk_tier"], fromIso: string): string {
  const days = DEFAULT_REVIEW_DAYS[riskTier];
  const from = new Date(fromIso);
  const due = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  return due.toISOString().slice(0, 10);
}

const BASELINE_CONTROL_MAPPINGS: ControlMapping[] = [
  { framework: "NIST-AI-RMF", ref: "GOVERN-1.1" },
  { framework: "NIST-AI-RMF", ref: "MANAGE-2.3" },
  { framework: "ISO/IEC-42001", ref: "8.3" },
];

function buildDecisionBoundaries(declaration: Declaration): DecisionBoundary[] {
  const boundaries: DecisionBoundary[] = [];

  for (const tool of declaration.tools) {
    boundaries.push({
      type: "tool_scope",
      description: `may call '${tool.name}' with '${tool.data_access}' data access`,
      detail: tool.requires_approval ? "requires_approval" : undefined,
    });
  }

  const dataClasses = new Set<string>();
  for (const tool of declaration.tools) {
    for (const dc of tool.data_classes) dataClasses.add(dc);
  }
  for (const dc of [...dataClasses].sort()) {
    boundaries.push({ type: "data_class", description: `may touch data class '${dc}'` });
  }

  if (declaration.sandbox.write_paths.length === 0) {
    boundaries.push({ type: "sandbox_path", description: "no filesystem write paths granted" });
  } else {
    for (const p of declaration.sandbox.write_paths) {
      boundaries.push({ type: "sandbox_path", description: `may write only under '${p}'` });
    }
  }

  for (const tool of declaration.tools) {
    if (tool.max_scopes && tool.max_scopes.length > 0) {
      boundaries.push({
        type: "credential_scope",
        description: `'${tool.name}' limited to scopes: ${tool.max_scopes.join(", ")}`,
      });
    }
  }

  return boundaries;
}

/**
 * Build an Agent Card from a Declaration and compute its canonical_sha256.
 * The hash covers the RFC 8785 canonical form of the whole Card with
 * `metadata.canonical_sha256` itself removed (SPEC.md C7).
 */
export function buildCard(declaration: Declaration): AgentCard {
  const createdAt = nowIso();
  const nextReview = declaration.next_review ?? defaultNextReview(declaration.risk_tier, createdAt);
  const isHighRisk = declaration.risk_tier === "high" || declaration.risk_tier === "critical";

  const cardWithoutHash: Omit<AgentCard, "metadata"> & { metadata: Omit<AgentCard["metadata"], "canonical_sha256"> } = {
    spec_version: "1.0.0",
    card_type: "agent",
    metadata: {
      id: declaration.id,
      name: declaration.name,
      owner: declaration.owner,
      created_at: createdAt,
    },
    classification: {
      risk_tier: declaration.risk_tier,
      next_review: nextReview,
    },
    autonomy: {
      level: declaration.autonomy_level,
    },
    tools: declaration.tools.map((t) => ({
      name: t.name,
      data_access: t.data_access,
      data_classes: t.data_classes,
      requires_approval: t.requires_approval,
      ...(t.max_scopes ? { max_scopes: t.max_scopes } : {}),
    })),
    sandbox: {
      write_paths: declaration.sandbox.write_paths,
    },
    decision_boundaries: buildDecisionBoundaries(declaration),
    escalation: {
      kill_switch: {
        available: true,
        mechanism:
          "operator revokes by deleting or invalidating the Card file passed to --card; " +
          "the gate re-validates the Card at every startup and fails every call closed if it is missing or invalid",
      },
    },
    governance: {
      control_mappings: BASELINE_CONTROL_MAPPINGS,
    },
    evidence: [],
  };

  // Card lint (C8) requires a kill switch to be available for high/critical
  // risk tiers. Newly exported cards always declare one available; the
  // "no kill switch" state only exists in the crafted lint fixture.
  void isHighRisk;

  const hash = canonicalSha256Excluding(cardWithoutHash as unknown as AgentCard);
  return {
    ...cardWithoutHash,
    metadata: { ...cardWithoutHash.metadata, canonical_sha256: hash },
  } as AgentCard;
}

/** SHA-256 of the RFC 8785 canonical form of `card`, with metadata.canonical_sha256 removed first. */
export function canonicalSha256Excluding(card: AgentCard): string {
  const clone = structuredClone(card) as Partial<AgentCard>;
  if (clone.metadata) {
    const { canonical_sha256, ...rest } = clone.metadata;
    void canonical_sha256;
    clone.metadata = rest as AgentCard["metadata"];
  }
  return sha256Hex(canonicalize(clone));
}
