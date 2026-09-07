import { mkdir } from "node:fs/promises";
import { loadDeclarationsFromDir, loadDeclaration } from "../declare/load.ts";
import { buildCard } from "../card/build.ts";
import { writeCard } from "../card/io.ts";
import { lintCard } from "../card/lint.ts";
import { runAgent } from "../agent/run.ts";
import { verifyTraceFile } from "../trace/verify.ts";
import { buildBundle } from "../bundle/build.ts";
import { verifyBundle } from "../bundle/verify.ts";
import { signBundle, verifyBundleSignature } from "../bundle/sign.ts";
import { newUuidV4 } from "../util/id.ts";
import type { DecisionEffect, TraceLine } from "../trace/types.ts";

const INVENTORY_DIR = "inventory/agents";
const BAD_DECLARATION = "fixtures/bad/missing-owner.yaml";

interface ScenarioSpec {
  name: string;
  scenarioPath: string;
  agentName: string;
  approvalsPath?: string;
}

const SCENARIOS: ScenarioSpec[] = [
  { name: "compliant-run", scenarioPath: "scenarios/compliant-run.yaml", agentName: "evidence-collector" },
  { name: "evidence-report", scenarioPath: "scenarios/evidence-report.yaml", agentName: "evidence-collector" },
  { name: "approval-flow", scenarioPath: "scenarios/approval-flow.yaml", agentName: "notifier", approvalsPath: "fixtures/approvals/one.json" },
];

export interface DemoScenarioResult {
  scenario: string;
  sessionId: string;
  bundleDir: string;
  counts: Record<DecisionEffect, number>;
  chainVerified: boolean;
  bundleVerified: boolean;
  signatureVerified: boolean;
}

export interface DemoResult {
  runId: string;
  runDir: string;
  elapsedMs: number;
  scenarios: DemoScenarioResult[];
}

async function readTraceEffects(sessionId: string): Promise<Record<DecisionEffect, number>> {
  const text = await Bun.file(`trace/${sessionId}.jsonl`).text();
  const counts: Record<DecisionEffect, number> = { allow: 0, deny: 0, escalate: 0 };
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line) as TraceLine;
    counts[parsed.effect]++;
  }
  return counts;
}

/**
 * Run the full pipeline end to end (SPEC.md C43): declare -> card -> gate
 * -> agent (all three scenarios) -> collect -> report -> bundle -> verify.
 * "Collect" and "report" happen inside `buildBundle` (see DECISIONS.md,
 * F8) rather than as separate steps here. Everything this function writes
 * lives under `out/demo/<runId>/` or `trace/` (SPEC.md A5); `runId`
 * defaults to a fresh value per call so two consecutive runs never
 * collide (C44).
 */
export async function runDemo(opts?: { runId?: string }): Promise<DemoResult> {
  const start = Date.now();
  const runId = opts?.runId ?? `${Date.now()}-${newUuidV4().slice(0, 8)}`;
  const runDir = `out/demo/${runId}`;
  await mkdir(runDir, { recursive: true });

  // ---- declare (C1, C3) ----
  const declarations = await loadDeclarationsFromDir(INVENTORY_DIR);
  for (const d of declarations) {
    if (!d.valid) throw new Error(`demo: Declaration ${d.path} failed validation: ${d.errors.join("; ")}`);
  }
  const badDeclaration = await loadDeclaration(BAD_DECLARATION);
  if (badDeclaration.valid) {
    throw new Error(`demo: ${BAD_DECLARATION} unexpectedly validated (C1's negative fixture should fail)`);
  }

  // ---- card (C5, C8) ----
  const cardPathByAgentName = new Map<string, string>();
  for (const d of declarations) {
    const declaration = d.declaration!;
    const card = buildCard(declaration);
    const cardPath = `${runDir}/cards/${declaration.id}.card.json`;
    await writeCard(cardPath, card);
    const lint = await lintCard(card);
    if (!lint.allow) {
      throw new Error(`demo: card lint denied newly-exported card for '${declaration.name}': ${lint.reasons.join("; ")}`);
    }
    cardPathByAgentName.set(declaration.name, cardPath);
  }

  // ---- gate smoke check (C10): list-tools returns exactly the Card's tools ----
  const evidenceCardPath = cardPathByAgentName.get("evidence-collector");
  if (!evidenceCardPath) throw new Error("demo: no Declaration named 'evidence-collector' found under inventory/agents/");
  const listToolsOutcome = await runAgent({ cardPath: evidenceCardPath, listToolsOnly: true });
  if (!listToolsOutcome.toolNames || listToolsOutcome.toolNames.length === 0) {
    throw new Error("demo: gate --list-tools returned no tools for evidence-collector's Card");
  }

  // ---- agent + collect + report + bundle + verify, per scenario (C22-C26, C40-C42) ----
  const keyDir = `${runDir}/keys`;
  await mkdir(keyDir, { recursive: true });
  const previousPassword = process.env["COSIGN_PASSWORD"];
  process.env["COSIGN_PASSWORD"] = `colophon-demo-${runId}`;
  const keygen = Bun.spawn({
    cmd: ["cosign", "generate-key-pair", "--output-key-prefix", `${keyDir}/cosign`],
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: process.env,
  });
  const keygenExit = await keygen.exited;
  if (keygenExit !== 0) {
    const stderr = await new Response(keygen.stderr).text();
    throw new Error(`demo: cosign generate-key-pair failed: ${stderr}`);
  }

  const scenarioResults: DemoScenarioResult[] = [];
  for (const spec of SCENARIOS) {
    const cardPath = cardPathByAgentName.get(spec.agentName);
    if (!cardPath) throw new Error(`demo: no Declaration named '${spec.agentName}' found under inventory/agents/`);

    const outcome = await runAgent({
      scenarioPath: spec.scenarioPath,
      cardPath,
      approvalsPath: spec.approvalsPath,
    });

    const chain = await verifyTraceFile(`trace/${outcome.sessionId}.jsonl`);
    if (!chain.ok) {
      throw new Error(`demo: trace for scenario '${spec.name}' failed chain verification: ${chain.reason}`);
    }
    const counts = await readTraceEffects(outcome.sessionId);

    const bundleDir = `${runDir}/${spec.name}`;
    await buildBundle({ sessionId: outcome.sessionId, outDir: bundleDir });

    const integrity = await verifyBundle(bundleDir);
    if (!integrity.ok) {
      throw new Error(`demo: freshly-built bundle for '${spec.name}' failed verify: ${integrity.badPath}: ${integrity.reason}`);
    }

    const signResult = await signBundle(bundleDir, `${keyDir}/cosign.key`);
    if (!signResult.ok) {
      throw new Error(`demo: cosign sign failed for '${spec.name}': ${signResult.stderr}`);
    }
    const sigVerify = await verifyBundleSignature(bundleDir, `${keyDir}/cosign.pub`);
    if (!sigVerify.ok) {
      throw new Error(`demo: cosign verify failed for '${spec.name}': ${sigVerify.stderr}`);
    }

    scenarioResults.push({
      scenario: spec.name,
      sessionId: outcome.sessionId,
      bundleDir,
      counts,
      chainVerified: chain.ok,
      bundleVerified: integrity.ok,
      signatureVerified: sigVerify.ok,
    });
  }

  process.env["COSIGN_PASSWORD"] = previousPassword;

  return { runId, runDir, elapsedMs: Date.now() - start, scenarios: scenarioResults };
}

export function formatSummaryTable(result: DemoResult): string {
  const header = ["scenario", "session", "allow", "deny", "escalate", "chain", "bundle", "signature"];
  const rows = result.scenarios.map((s) => [
    s.scenario,
    s.sessionId.slice(0, 8),
    String(s.counts.allow),
    String(s.counts.deny),
    String(s.counts.escalate),
    s.chainVerified ? "OK" : "FAIL",
    s.bundleVerified ? "OK" : "FAIL",
    s.signatureVerified ? "OK" : "FAIL",
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const formatRow = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join("  ");
  return [formatRow(header), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(formatRow)].join("\n");
}
