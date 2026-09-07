import type { AutonomyLevel, DataAccess, RiskTier } from "../declare/types.ts";

export interface CardTool {
  name: string;
  data_access: DataAccess;
  data_classes: string[];
  requires_approval: boolean;
  max_scopes?: string[];
}

export type DecisionBoundaryType = "tool_scope" | "data_class" | "sandbox_path" | "credential_scope";

export interface DecisionBoundary {
  type: DecisionBoundaryType;
  description: string;
  detail?: string;
}

export interface ControlMapping {
  framework: string;
  ref: string;
}

export interface AgentCard {
  spec_version: "1.0.0";
  card_type: "agent";
  metadata: {
    id: string;
    name: string;
    owner: string;
    created_at: string;
    canonical_sha256: string;
  };
  classification: {
    risk_tier: RiskTier;
    next_review: string;
  };
  autonomy: {
    level: AutonomyLevel;
  };
  tools: CardTool[];
  sandbox: {
    write_paths: string[];
  };
  decision_boundaries: DecisionBoundary[];
  escalation: {
    kill_switch: {
      available: boolean;
      mechanism?: string;
    };
  };
  governance: {
    control_mappings: ControlMapping[];
  };
  evidence: string[];
}
