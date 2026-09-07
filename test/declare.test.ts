import { describe, expect, test } from "bun:test";
import { loadDeclaration, loadDeclarationsFromDir } from "../src/declare/load.ts";

describe("Declaration loading and validation (F1)", () => {
  test("a well-formed Declaration validates", async () => {
    const result = await loadDeclaration("inventory/agents/evidence-collector.yaml");
    expect(result.valid).toBe(true);
    expect(result.declaration?.name).toBe("evidence-collector");
    expect(result.declaration?.risk_tier).toBe("high");
  });

  test("a Declaration missing 'owner' is invalid and names the field", async () => {
    const result = await loadDeclaration("fixtures/bad/missing-owner.yaml");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("owner");
  });

  test("a nonexistent file is invalid, not throwing", async () => {
    const result = await loadDeclaration("fixtures/bad/does-not-exist.yaml");
    expect(result.valid).toBe(false);
  });

  test("malformed YAML is invalid, not throwing", async () => {
    const path = "test/tmp-malformed.yaml";
    await Bun.write(path, "id: [unterminated\nname: broken");
    try {
      const result = await loadDeclaration(path);
      expect(result.valid).toBe(false);
    } finally {
      await Bun.file(path).delete();
    }
  });

  test("the repository ships at least one high-risk read-only agent and one low-risk write+approval agent (C4)", async () => {
    const results = await loadDeclarationsFromDir("inventory/agents");
    expect(results.every((r) => r.valid)).toBe(true);
    const declarations = results.map((r) => r.declaration!);

    const highRiskReadOnly = declarations.find(
      (d) => d.risk_tier === "high" && d.tools.every((t) => t.data_access !== "write")
    );
    expect(highRiskReadOnly).toBeDefined();

    const lowRiskWriteApproval = declarations.find(
      (d) =>
        d.risk_tier === "low" &&
        d.tools.some((t) => t.data_access === "write" && t.requires_approval === true)
    );
    expect(lowRiskWriteApproval).toBeDefined();
  });

  test("loadDeclarationsFromDir returns results sorted by path", async () => {
    const results = await loadDeclarationsFromDir("inventory/agents");
    const paths = results.map((r) => r.path);
    expect(paths).toEqual([...paths].sort());
  });
});
