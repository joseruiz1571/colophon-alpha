import { sha256OfCanonical } from "../util/canonical.ts";
import { listFilesRecursive, sha256OfFile } from "./fs-helpers.ts";
import { MANIFEST_FILENAME, SIGNATURE_FILENAME, type BundleManifest } from "./types.ts";

export interface BundleVerifyResult {
  ok: boolean;
  /** The file (relative path) responsible for the first problem found, if any. */
  badPath?: string;
  reason?: string;
}

/**
 * Verify a bundle's integrity (SPEC.md C41): every file the manifest lists
 * must exist with the declared size and sha256, the manifest's own
 * root_hash must match a fresh hash of its file list, and no file outside
 * the manifest (and the manifest/signature files themselves) may be
 * present. Exits ok:false naming the offending path on the first problem
 * found, in manifest order, so a single altered byte is always reported
 * against the file it actually changed.
 */
export async function verifyBundle(dir: string): Promise<BundleVerifyResult> {
  const bundleDir = dir.replace(/\/+$/, "");
  const manifestPath = `${bundleDir}/${MANIFEST_FILENAME}`;
  if (!(await Bun.file(manifestPath).exists())) {
    return { ok: false, badPath: MANIFEST_FILENAME, reason: "manifest.json is missing" };
  }

  let manifest: BundleManifest;
  try {
    manifest = JSON.parse(await Bun.file(manifestPath).text()) as BundleManifest;
  } catch (err) {
    return { ok: false, badPath: MANIFEST_FILENAME, reason: `manifest.json is not valid JSON: ${(err as Error).message}` };
  }

  const recomputedRoot = sha256OfCanonical(manifest.files);
  if (recomputedRoot !== manifest.root_hash) {
    return { ok: false, badPath: MANIFEST_FILENAME, reason: "root_hash does not match a fresh hash of the file list" };
  }

  for (const entry of manifest.files) {
    const absPath = `${bundleDir}/${entry.path}`;
    const file = Bun.file(absPath);
    if (!(await file.exists())) {
      return { ok: false, badPath: entry.path, reason: "file listed in manifest.json is missing" };
    }
    const size = (await file.arrayBuffer()).byteLength;
    if (size !== entry.size) {
      return { ok: false, badPath: entry.path, reason: `size changed: manifest says ${entry.size}, found ${size}` };
    }
    const sha256 = await sha256OfFile(absPath);
    if (sha256 !== entry.sha256) {
      return { ok: false, badPath: entry.path, reason: `sha256 changed: manifest says ${entry.sha256}, found ${sha256}` };
    }
  }

  const allowedExtras = new Set([MANIFEST_FILENAME, SIGNATURE_FILENAME]);
  const manifestPaths = new Set(manifest.files.map((f) => f.path));
  const actualPaths = await listFilesRecursive(bundleDir);
  for (const path of actualPaths) {
    if (allowedExtras.has(path) || manifestPaths.has(path)) continue;
    return { ok: false, badPath: path, reason: "file present in the bundle but not listed in manifest.json" };
  }

  return { ok: true };
}
