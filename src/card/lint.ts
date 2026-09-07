import { opaEval } from "../util/opa.ts";

const POLICY_DIR = new URL("../../policy", import.meta.url).pathname;

export interface CardLintDecision {
  allow: boolean;
  rule_ids: string[];
  reasons: string[];
}

/**
 * Evaluate policy/card.rego against a Card. Fail closed: any OPA error or
 * an undefined query result is treated as `allow: false` (SPEC.md
 * Principle 2), never as a pass.
 */
export async function lintCard(card: unknown): Promise<CardLintDecision> {
  const result = await opaEval(POLICY_DIR, card, "data.colophon.card.decision");
  if (!result.ok) {
    return { allow: false, rule_ids: ["OPA-EVAL-ERROR"], reasons: [result.stderr || "opa evaluation failed"] };
  }
  return result.value as CardLintDecision;
}
