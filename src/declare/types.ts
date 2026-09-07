export type RiskTier = "low" | "medium" | "high" | "critical";
export type AutonomyLevel =
  | "assistive"
  | "supervised"
  | "delegated"
  | "autonomous_bounded"
  | "autonomous";
export type DataAccess = "read" | "write" | "none";

export interface ToolGrant {
  name: string;
  data_access: DataAccess;
  data_classes: string[];
  requires_approval: boolean;
  max_scopes?: string[];
}

export interface Declaration {
  id: string;
  name: string;
  owner: string;
  description?: string;
  risk_tier: RiskTier;
  autonomy_level: AutonomyLevel;
  next_review?: string;
  tools: ToolGrant[];
  sandbox: {
    write_paths: string[];
  };
}
