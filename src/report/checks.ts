import type { EvidenceItem } from "../evidence/types.ts";
import type { TraceLine } from "../trace/types.ts";
import type { AgentCard } from "../card/types.ts";
import { isPastDate } from "../util/time.ts";
import type { ControlCheckResult } from "./types.ts";

/**
 * Convert a sandbox.write_paths glob into a RegExp with the same semantics
 * as Rego's `glob.match(pattern, ["/"], value)` used by policy/gate.rego:
 * "*" matches within one "/"-delimited segment, "**" matches across
 * segments. This mirrors the gate's own matching so a report control can
 * independently re-check what the policy already enforced, without
 * re-implementing policy judgment (the check only observes trace/Card
 * facts; it never decides anything the gate didn't already decide).
 */
function globToRegExp(pattern: string): RegExp {
  let out = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      out += ".*";
      i++;
    } else if (c === "*") {
      out += "[^/]*";
    } else {
      out += c!.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  out += "$";
  return new RegExp(out);
}

export interface CheckContext {
  /** Evidence items produced by MCPTraceCollector for individual decisions (not the summary). */
  traceDecisionItems: EvidenceItem[];
  /** The MCPTraceCollector summary item, if present. */
  traceSummaryItem: EvidenceItem | undefined;
  /** Evidence items produced by CardCollector — normally exactly one. */
  cardItems: EvidenceItem[];
  /** Result of verifyTraceFile() for the trace this evidence was built from. */
  chainVerified: boolean;
}

type CheckFn = (ctx: CheckContext) => ControlCheckResult;

function theCard(ctx: CheckContext): AgentCard | undefined {
  return ctx.cardItems[0]?.payload as AgentCard | undefined;
}

function noCardResult(ctx: CheckContext): ControlCheckResult {
  return {
    state: "not-satisfied",
    reasonSummary: "no Card evidence item was found in this run; cannot check this control without a Card",
    relatedEvidenceIds: ctx.cardItems.map((c) => c.id),
  };
}

function allDecisionIds(ctx: CheckContext): string[] {
  return ctx.traceDecisionItems.map((i) => i.id);
}

const checkNoOutsideCalls: CheckFn = (ctx) => {
  const card = theCard(ctx);
  if (!card) return noCardResult(ctx);
  const cardTools = new Set(card.tools.map((t) => t.name));
  const offending = ctx.traceDecisionItems.filter((item) => {
    const line = item.payload as TraceLine;
    return line.effect === "allow" && !cardTools.has(line.tool);
  });
  const cited = [...allDecisionIds(ctx), ...ctx.cardItems.map((c) => c.id)];
  if (offending.length > 0) {
    const tools = offending.map((o) => (o.payload as TraceLine).tool).join(", ");
    return {
      state: "not-satisfied",
      reasonSummary: `${offending.length} decision(s) allowed a call to a tool outside the Card's tools[]: ${tools}`,
      relatedEvidenceIds: cited,
    };
  }
  return {
    state: "satisfied",
    reasonSummary: `all ${ctx.traceDecisionItems.filter((i) => (i.payload as TraceLine).effect === "allow").length} allowed call(s) named a tool in the Card's tools[]`,
    relatedEvidenceIds: cited,
  };
};

const checkSandboxWriteBoundary: CheckFn = (ctx) => {
  const card = theCard(ctx);
  if (!card) return noCardResult(ctx);
  const writeTools = new Set(card.tools.filter((t) => t.data_access === "write").map((t) => t.name));
  const patterns = card.sandbox.write_paths.map(globToRegExp);
  const allowWrites = ctx.traceDecisionItems.filter((item) => {
    const line = item.payload as TraceLine;
    return line.effect === "allow" && writeTools.has(line.tool);
  });
  const offending = allowWrites.filter((item) => {
    const line = item.payload as TraceLine;
    const args = line.args_redacted as Record<string, unknown> | undefined;
    const path = args?.["path"];
    if (typeof path !== "string") return false;
    return !patterns.some((re) => re.test(path));
  });
  const cited = [...allowWrites.map((i) => i.id), ...ctx.cardItems.map((c) => c.id)];
  if (offending.length > 0) {
    return {
      state: "not-satisfied",
      reasonSummary: `${offending.length} executed write(s) landed outside every sandbox.write_paths pattern`,
      relatedEvidenceIds: cited,
    };
  }
  return {
    state: "satisfied",
    reasonSummary: `${allowWrites.length} executed write(s) all matched a sandbox.write_paths pattern (0 write tools means this holds vacuously)`,
    relatedEvidenceIds: cited,
  };
};

const checkNoScopeExpansion: CheckFn = (ctx) => {
  const card = theCard(ctx);
  if (!card) return noCardResult(ctx);
  const grantByName = new Map(card.tools.map((t) => [t.name, t] as const));
  const authAllows = ctx.traceDecisionItems.filter((item) => {
    const line = item.payload as TraceLine;
    return line.effect === "allow" && line.tool.startsWith("auth.");
  });
  const offending = authAllows.filter((item) => {
    const line = item.payload as TraceLine;
    const args = line.args_redacted as Record<string, unknown> | undefined;
    const requested = Array.isArray(args?.["scopes"]) ? (args!["scopes"] as unknown[]) : [];
    const maxScopes = new Set(grantByName.get(line.tool)?.max_scopes ?? []);
    return requested.some((s) => !maxScopes.has(String(s)));
  });
  const cited = [...authAllows.map((i) => i.id), ...ctx.cardItems.map((c) => c.id)];
  if (offending.length > 0) {
    return {
      state: "not-satisfied",
      reasonSummary: `${offending.length} executed auth.* call(s) were granted scopes beyond the Card's max_scopes`,
      relatedEvidenceIds: cited,
    };
  }
  return {
    state: "satisfied",
    reasonSummary: `${authAllows.length} executed auth.* call(s) all stayed within declared max_scopes (0 means this holds vacuously)`,
    relatedEvidenceIds: cited,
  };
};

const checkEveryDenyHasRuleId: CheckFn = (ctx) => {
  const relevant = ctx.traceDecisionItems.filter((item) => {
    const line = item.payload as TraceLine;
    return line.effect === "deny" || line.effect === "escalate";
  });
  const offending = relevant.filter((item) => (item.payload as TraceLine).rule_ids.length === 0);
  const cited = relevant.map((i) => i.id);
  if (offending.length > 0) {
    return {
      state: "not-satisfied",
      reasonSummary: `${offending.length} deny/escalate decision(s) carried no rule_id`,
      relatedEvidenceIds: cited,
    };
  }
  return {
    state: "satisfied",
    reasonSummary: `all ${relevant.length} deny/escalate decision(s) carried at least one rule_id`,
    relatedEvidenceIds: cited,
  };
};

const checkTraceChainIntact: CheckFn = (ctx) => {
  const cited = ctx.traceSummaryItem ? [ctx.traceSummaryItem.id] : [];
  return ctx.chainVerified
    ? { state: "satisfied", reasonSummary: "the trace's hash chain verified end to end", relatedEvidenceIds: cited }
    : { state: "not-satisfied", reasonSummary: "the trace's hash chain failed verification", relatedEvidenceIds: cited };
};

const checkCardNotStale: CheckFn = (ctx) => {
  const card = theCard(ctx);
  if (!card) return noCardResult(ctx);
  const cited = ctx.cardItems.map((c) => c.id);
  if (isPastDate(card.classification.next_review)) {
    return {
      state: "not-satisfied",
      reasonSummary: `the Card's classification.next_review (${card.classification.next_review}) is in the past`,
      relatedEvidenceIds: cited,
    };
  }
  return {
    state: "satisfied",
    reasonSummary: `the Card's classification.next_review (${card.classification.next_review}) has not passed`,
    relatedEvidenceIds: cited,
  };
};

const checkApprovalRequiredEnforced: CheckFn = (ctx) => {
  const card = theCard(ctx);
  if (!card) return noCardResult(ctx);
  const approvalTools = new Set(card.tools.filter((t) => t.requires_approval).map((t) => t.name));
  const allowsOnApprovalTools = ctx.traceDecisionItems.filter((item) => {
    const line = item.payload as TraceLine;
    return line.effect === "allow" && approvalTools.has(line.tool);
  });
  const offending = allowsOnApprovalTools.filter((item) => !(item.payload as TraceLine).rule_ids.includes("GATE-APPROVED"));
  const cited = [...allowsOnApprovalTools.map((i) => i.id), ...ctx.cardItems.map((c) => c.id)];
  if (offending.length > 0) {
    return {
      state: "not-satisfied",
      reasonSummary: `${offending.length} executed call(s) to an approval-required tool ran without a GATE-APPROVED decision`,
      relatedEvidenceIds: cited,
    };
  }
  return {
    state: "satisfied",
    reasonSummary: `${allowsOnApprovalTools.length} executed approval-required call(s) all carried GATE-APPROVED (0 means this holds vacuously)`,
    relatedEvidenceIds: cited,
  };
};

const checkBundleManifestComplete: CheckFn = (ctx) => {
  const cited = [...(ctx.traceSummaryItem ? [ctx.traceSummaryItem.id] : []), ...ctx.cardItems.map((c) => c.id)];
  if (!ctx.traceSummaryItem) {
    return { state: "not-satisfied", reasonSummary: "no trace summary evidence item was found", relatedEvidenceIds: cited };
  }
  if (ctx.cardItems.length === 0) {
    return { state: "not-satisfied", reasonSummary: "no Card evidence item was found", relatedEvidenceIds: cited };
  }
  const summary = ctx.traceSummaryItem.payload as { total_decisions: number };
  if (summary.total_decisions !== ctx.traceDecisionItems.length) {
    return {
      state: "not-satisfied",
      reasonSummary: `trace summary reports ${summary.total_decisions} decisions but ${ctx.traceDecisionItems.length} decision evidence item(s) were collected`,
      relatedEvidenceIds: cited,
    };
  }
  return {
    state: "satisfied",
    reasonSummary: `evidence set is internally consistent: ${ctx.traceDecisionItems.length} decisions, 1 summary, ${ctx.cardItems.length} Card(s) — a report-time proxy for bundle manifest completeness (see controls/agent-controls.yaml)`,
    relatedEvidenceIds: cited,
  };
};

export const CHECKS: Record<string, CheckFn> = {
  "no-outside-calls": checkNoOutsideCalls,
  "sandbox-write-boundary": checkSandboxWriteBoundary,
  "no-scope-expansion": checkNoScopeExpansion,
  "every-deny-has-rule-id": checkEveryDenyHasRuleId,
  "trace-chain-intact": checkTraceChainIntact,
  "card-not-stale": checkCardNotStale,
  "approval-required-enforced": checkApprovalRequiredEnforced,
  "bundle-manifest-complete": checkBundleManifestComplete,
};
