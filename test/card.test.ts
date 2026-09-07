import { describe, expect, test } from "bun:test";
import { loadDeclaration } from "../src/declare/load.ts";
import { buildCard, canonicalSha256Excluding } from "../src/card/build.ts";
import { verifyCard } from "../src/card/verify.ts";
import { lintCard } from "../src/card/lint.ts";
import { loadCard, loadCardSchema } from "../src/card/io.ts";
import { validateAgainst2020Schema } from "../src/util/schema.ts";

describe("Agent Card (F2)", () => {
  test("buildCard produces a Card whose canonical_sha256 matches on recompute", async () => {
    const decl = await loadDeclaration("inventory/agents/evidence-collector.yaml");
    const card = buildCard(decl.declaration!);
    const result = verifyCard(card);
    expect(result.ok).toBe(true);
  });

  test("the exported Card validates against the Card schema", async () => {
    const decl = await loadDeclaration("inventory/agents/notifier.yaml");
    const card = buildCard(decl.declaration!);
    const schema = await loadCardSchema();
    const result = validateAgainst2020Schema(schema, card);
    expect(result.valid).toBe(true);
  });

  test("tampering with canonical_sha256 is detected by verifyCard (C7)", async () => {
    const decl = await loadDeclaration("inventory/agents/evidence-collector.yaml");
    const card = buildCard(decl.declaration!);
    const tampered = { ...card, metadata: { ...card.metadata, canonical_sha256: "0".repeat(64) } };
    const result = verifyCard(tampered);
    expect(result.ok).toBe(false);
  });

  test("tampering with any other field changes the recomputed hash", async () => {
    const decl = await loadDeclaration("inventory/agents/evidence-collector.yaml");
    const card = buildCard(decl.declaration!);
    const original = canonicalSha256Excluding(card);
    const tampered = { ...card, classification: { ...card.classification, risk_tier: "low" as const } };
    const recomputed = canonicalSha256Excluding(tampered);
    expect(recomputed).not.toBe(original);
  });

  test("card lint denies a stale review and names the rule (C8)", async () => {
    const raw = JSON.parse(await Bun.file("fixtures/cards/stale.card.json").text());
    const decision = await lintCard(raw);
    expect(decision.allow).toBe(false);
    expect(decision.rule_ids).toContain("CARD-STALE-REVIEW");
  });

  test("card lint denies high risk without a kill switch (C8)", async () => {
    const raw = JSON.parse(await Bun.file("fixtures/cards/high-no-killswitch.card.json").text());
    const decision = await lintCard(raw);
    expect(decision.allow).toBe(false);
    expect(decision.rule_ids).toContain("CARD-NO-KILLSWITCH");
  });

  test("card lint allows the shipped example cards", async () => {
    const raw = JSON.parse(
      await Bun.file("cards/3f2a9e10-6b7a-4b1a-9c9e-2b6a7f4d1a01.card.json").text()
    );
    const decision = await lintCard(raw);
    expect(decision.allow).toBe(true);
  });

  test("card validate rejects an all-zero UUID (C9)", async () => {
    const result = await loadCard("fixtures/cards/zero-uuid.card.json");
    expect(result.valid).toBe(false);
  });

  test("card validate rejects a Card missing classification.next_review (C9)", async () => {
    const decl = await loadDeclaration("inventory/agents/evidence-collector.yaml");
    const card = buildCard(decl.declaration!);
    const broken = structuredClone(card) as unknown as Record<string, unknown>;
    delete (broken.classification as Record<string, unknown>).next_review;
    const schema = await loadCardSchema();
    const result = validateAgainst2020Schema(schema, broken);
    expect(result.valid).toBe(false);
  });
});
