export interface FrameworkRef {
  framework: string;
  ref: string;
}

/** One row of controls/agent-controls.yaml (SPEC.md C34). */
export interface ControlDef {
  id: string;
  framework_refs: FrameworkRef[];
  intent: string;
  /** Key into src/report/checks.ts's CHECKS registry. */
  check: string;
}

export type ControlState = "satisfied" | "not-satisfied";

/** What one control's deterministic check produced (SPEC.md C35/C36). */
export interface ControlCheckResult {
  state: ControlState;
  /** Human-readable explanation of why the control passed or failed. */
  reasonSummary: string;
  /** Evidence item ids (SHA-256s) this determination rests on. */
  relatedEvidenceIds: string[];
}
