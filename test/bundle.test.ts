import { describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { runAgent } from "../src/agent/run.ts";
import { buildBundle, BundleBuildError } from "../src/bundle/build.ts";
import { verifyBundle } from "../src/bundle/verify.ts";
import { signBundle, verifyBundleSignature } from "../src/bundle/sign.ts";

const EVIDENCE_CARD_PATH = "cards/3f2a9e10-6b7a-4b1a-9c9e-2b6a7f4d1a01.card.json";
const BUNDLE_ROOT = "test/tmp-bundle";

async function freshBundleDir(name: string): Promise<string> {
  const dir = `${BUNDLE_ROOT}/${name}`;
  await rm(dir, { recursive: true, force: true });
  return dir;
}

async function spawnOk(cmd: string[], env?: Record<string, string>): Promise<boolean> {
  const proc = Bun.spawn({ cmd, stdout: "pipe", stderr: "pipe", stdin: "ignore", env: { ...process.env, ...env } });
  await proc.exited;
  return proc.exitCode === 0;
}

describe("colophon bundle (F8, C40)", () => {
  test(
    "writes report/, evidence/<id>.json (cited or not), trace/, and manifest.json with a root hash",
    async () => {
      const outcome = await runAgent({ scenarioPath: "scenarios/compliant-run.yaml", cardPath: EVIDENCE_CARD_PATH });
      const dir = await freshBundleDir("compliant");

      const result = await buildBundle({ sessionId: outcome.sessionId, outDir: dir });
      expect(result.manifest.files.length).toBeGreaterThan(0);
      expect(result.manifest.root_hash).toHaveLength(64);

      const paths = result.manifest.files.map((f) => f.path);
      expect(paths).toContain("report/assessment-results.json");
      expect(paths).toContain("report/narrative.md");
      expect(paths).toContain(`trace/${outcome.sessionId}.jsonl`);
      expect(paths.filter((p) => p.startsWith("evidence/")).length).toBeGreaterThan(0);

      const verification = await verifyBundle(dir);
      expect(verification.ok).toBe(true);
    },
    20000,
  );

  test(
    "refuses to write into a non-empty output directory",
    async () => {
      const outcome = await runAgent({ scenarioPath: "scenarios/compliant-run.yaml", cardPath: EVIDENCE_CARD_PATH });
      const dir = await freshBundleDir("nonempty");
      await buildBundle({ sessionId: outcome.sessionId, outDir: dir });
      await expect(buildBundle({ sessionId: outcome.sessionId, outDir: dir })).rejects.toThrow(BundleBuildError);
    },
    20000,
  );
});

describe("colophon bundle verify (C41)", () => {
  test(
    "names the altered file after a single-byte change",
    async () => {
      const outcome = await runAgent({ scenarioPath: "scenarios/compliant-run.yaml", cardPath: EVIDENCE_CARD_PATH });
      const dir = await freshBundleDir("tamper");
      await buildBundle({ sessionId: outcome.sessionId, outDir: dir });

      const narrativePath = `${dir}/report/narrative.md`;
      const original = await Bun.file(narrativePath).text();
      await Bun.write(narrativePath, original + "x");

      const result = await verifyBundle(dir);
      expect(result.ok).toBe(false);
      expect(result.badPath).toBe("report/narrative.md");
    },
    20000,
  );

  test(
    "names an added file not listed in manifest.json",
    async () => {
      const outcome = await runAgent({ scenarioPath: "scenarios/compliant-run.yaml", cardPath: EVIDENCE_CARD_PATH });
      const dir = await freshBundleDir("extra-file");
      await buildBundle({ sessionId: outcome.sessionId, outDir: dir });

      await mkdir(`${dir}/evidence`, { recursive: true });
      await Bun.write(`${dir}/evidence/not-in-manifest.json`, "{}");

      const result = await verifyBundle(dir);
      expect(result.ok).toBe(false);
      expect(result.badPath).toBe("evidence/not-in-manifest.json");
    },
    20000,
  );

  test(
    "names a removed file",
    async () => {
      const outcome = await runAgent({ scenarioPath: "scenarios/compliant-run.yaml", cardPath: EVIDENCE_CARD_PATH });
      const dir = await freshBundleDir("removed-file");
      await buildBundle({ sessionId: outcome.sessionId, outDir: dir });

      await rm(`${dir}/report/narrative.md`);

      const result = await verifyBundle(dir);
      expect(result.ok).toBe(false);
      expect(result.badPath).toBe("report/narrative.md");
    },
    20000,
  );

  test("exits ok on an untouched bundle", async () => {
    const outcome = await runAgent({ scenarioPath: "scenarios/compliant-run.yaml", cardPath: EVIDENCE_CARD_PATH });
    const dir = await freshBundleDir("clean");
    await buildBundle({ sessionId: outcome.sessionId, outDir: dir });
    expect((await verifyBundle(dir)).ok).toBe(true);
  }, 20000);
});

describe("colophon bundle sign/verify (C42)", () => {
  test(
    "wraps cosign sign-blob / verify-blob over manifest.json, fully offline",
    async () => {
      const outcome = await runAgent({ scenarioPath: "scenarios/compliant-run.yaml", cardPath: EVIDENCE_CARD_PATH });
      const dir = await freshBundleDir("signed");
      await buildBundle({ sessionId: outcome.sessionId, outDir: dir });

      const keyDir = `${BUNDLE_ROOT}/signed-keys`;
      await rm(keyDir, { recursive: true, force: true });
      await mkdir(keyDir, { recursive: true });
      const previousPassword = process.env["COSIGN_PASSWORD"];
      process.env["COSIGN_PASSWORD"] = "test-passphrase-not-a-real-secret";
      const generated = await spawnOk(["cosign", "generate-key-pair", "--output-key-prefix", `${keyDir}/cosign`]);
      expect(generated).toBe(true);

      const signResult = await signBundle(dir, `${keyDir}/cosign.key`);
      process.env["COSIGN_PASSWORD"] = previousPassword;
      expect(signResult.ok).toBe(true);
      expect(await Bun.file(`${dir}/manifest.json.sig`).exists()).toBe(true);

      const verifyResult = await verifyBundleSignature(dir, `${keyDir}/cosign.pub`);
      expect(verifyResult.ok).toBe(true);

      // The signature artifact must not make `bundle verify`'s integrity
      // check think a file was added that isn't in the manifest.
      const integrity = await verifyBundle(dir);
      expect(integrity.ok).toBe(true);
    },
    30000,
  );

  test(
    "verify-blob fails against a bundle whose manifest was tampered after signing",
    async () => {
      const outcome = await runAgent({ scenarioPath: "scenarios/compliant-run.yaml", cardPath: EVIDENCE_CARD_PATH });
      const dir = await freshBundleDir("signed-tampered");
      await buildBundle({ sessionId: outcome.sessionId, outDir: dir });

      const keyDir = `${BUNDLE_ROOT}/signed-tampered-keys`;
      await rm(keyDir, { recursive: true, force: true });
      await mkdir(keyDir, { recursive: true });
      const previousPassword = process.env["COSIGN_PASSWORD"];
      process.env["COSIGN_PASSWORD"] = "test-passphrase-not-a-real-secret";
      await spawnOk(["cosign", "generate-key-pair", "--output-key-prefix", `${keyDir}/cosign`]);
      await signBundle(dir, `${keyDir}/cosign.key`);
      process.env["COSIGN_PASSWORD"] = previousPassword;

      const manifestPath = `${dir}/manifest.json`;
      await Bun.write(manifestPath, (await Bun.file(manifestPath).text()) + " ");

      const verifyResult = await verifyBundleSignature(dir, `${keyDir}/cosign.pub`);
      expect(verifyResult.ok).toBe(false);
    },
    30000,
  );
});
