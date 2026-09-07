import { SIGNATURE_FILENAME, MANIFEST_FILENAME } from "./types.ts";

/**
 * A Sigstore signing-config (SPEC.md C42) with every remote service list
 * emptied out. Cosign v3's default signing config points at the public
 * Sigstore instance (Fulcio, Rekor, a TSA) even for plain key-pair
 * sign-blob, which would upload a transparency-log entry over the network
 * on every `colophon bundle sign` — incompatible with `bun test`, the
 * demo, and CI all running with no network access beyond dependency
 * installs (SPEC.md §5). This file, passed via `--signing-config`, is how
 * `sign-blob`/`verify-blob` stay fully local for the key-pair flow; see
 * DECISIONS.md, F8. The CI workflow's separate *keyless* sign+verify step
 * (also required by C42) is exempted from that same offline constraint by
 * definition — keyless signing only exists via GitHub's OIDC token
 * exchange with Fulcio/Rekor, which needs the network, and that need is
 * exactly what SPEC.md C42 asks the CI step to exercise.
 */
const OFFLINE_SIGNING_CONFIG_PATH = new URL("../../fixtures/cosign/offline-signing-config.json", import.meta.url).pathname;

export interface CosignResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

async function runCosign(args: string[]): Promise<CosignResult> {
  let proc;
  try {
    // env: process.env — Bun.spawn does not inherit the parent's
    // environment unless told to, and cosign needs COSIGN_PASSWORD (or
    // similar) from it to read an encrypted key non-interactively.
    // stdin: "ignore" — otherwise, if this process's own stdin happens to
    // be a terminal, cosign tries to prompt for the password interactively
    // instead of falling back to the environment, which then fails
    // non-interactively ("inappropriate ioctl for device").
    proc = Bun.spawn({ cmd: ["cosign", ...args], stdout: "pipe", stderr: "pipe", stdin: "ignore", env: process.env });
  } catch (err) {
    return { ok: false, stdout: "", stderr: `failed to spawn cosign: ${(err as Error).message}` };
  }
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { ok: exitCode === 0, stdout, stderr };
}

/** Wraps `cosign sign-blob` over a bundle's manifest.json (SPEC.md C42). Requires COSIGN_PASSWORD (or an unencrypted key) in the environment, same as bare cosign. */
export async function signBundle(dir: string, keyPath: string): Promise<CosignResult> {
  const bundleDir = dir.replace(/\/+$/, "");
  return runCosign([
    "sign-blob",
    "--key",
    keyPath,
    "--signing-config",
    OFFLINE_SIGNING_CONFIG_PATH,
    "--bundle",
    `${bundleDir}/${SIGNATURE_FILENAME}`,
    "--yes",
    `${bundleDir}/${MANIFEST_FILENAME}`,
  ]);
}

/** Wraps `cosign verify-blob` over a bundle's manifest.json + its signature bundle (SPEC.md C42). */
export async function verifyBundleSignature(dir: string, pubKeyPath: string): Promise<CosignResult> {
  const bundleDir = dir.replace(/\/+$/, "");
  return runCosign([
    "verify-blob",
    "--key",
    pubKeyPath,
    "--bundle",
    `${bundleDir}/${SIGNATURE_FILENAME}`,
    "--insecure-ignore-tlog=true",
    `${bundleDir}/${MANIFEST_FILENAME}`,
  ]);
}
