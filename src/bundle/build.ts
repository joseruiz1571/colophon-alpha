import { mkdir } from "node:fs/promises";
import { buildReport } from "../report/build.ts";
import { sha256OfCanonical } from "../util/canonical.ts";
import { nowIso } from "../util/time.ts";
import { isEmptyOrMissingDir, listFilesRecursive, sha256OfFile } from "./fs-helpers.ts";
import { MANIFEST_FILENAME, type BundleManifest, type ManifestFileEntry } from "./types.ts";

export class BundleBuildError extends Error {}

export interface BuildBundleOptions {
  sessionId: string;
  outDir: string;
  /** Defaults to "trace/<sessionId>.jsonl". */
  tracePath?: string;
}

export interface BuildBundleResult {
  manifest: BundleManifest;
  manifestPath: string;
}

/**
 * Assemble one bundle: report/, evidence/<id>.json for every evidence item
 * this run collected (cited or not — SPEC.md C40), a copy of the raw
 * trace, and manifest.json written last with a root hash covering
 * everything else. Refuses to write into a non-empty directory (C40) —
 * writing into a bundle that already has content risks silently mixing
 * two runs' evidence under one manifest.
 */
export async function buildBundle(opts: BuildBundleOptions): Promise<BuildBundleResult> {
  const outDir = opts.outDir.replace(/\/+$/, "");
  if (!(await isEmptyOrMissingDir(outDir))) {
    throw new BundleBuildError(`refusing to write a bundle into non-empty directory '${outDir}'`);
  }
  await mkdir(outDir, { recursive: true });

  const tracePath = opts.tracePath ?? `trace/${opts.sessionId}.jsonl`;
  const report = await buildReport({ tracePath });

  await Bun.write(`${outDir}/report/assessment-results.json`, report.assessmentResultsJson);
  await Bun.write(`${outDir}/report/narrative.md`, report.narrativeMarkdown);

  for (const item of report.evidenceStore.all()) {
    await Bun.write(`${outDir}/evidence/${item.id}.json`, JSON.stringify(item, null, 2) + "\n");
  }

  const traceBytes = await Bun.file(tracePath).arrayBuffer();
  await Bun.write(`${outDir}/trace/${opts.sessionId}.jsonl`, traceBytes);

  // Manifest is computed from everything just written, then written last
  // (C40) — nothing describes the manifest before the manifest exists.
  const relativePaths = await listFilesRecursive(outDir);
  const files: ManifestFileEntry[] = [];
  for (const relPath of relativePaths) {
    const absPath = `${outDir}/${relPath}`;
    const sha256 = await sha256OfFile(absPath);
    const size = (await Bun.file(absPath).arrayBuffer()).byteLength;
    files.push({ path: relPath, sha256, size });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));

  const manifest: BundleManifest = {
    session_id: opts.sessionId,
    generated_at: nowIso(),
    files,
    root_hash: sha256OfCanonical(files),
  };

  const manifestPath = `${outDir}/${MANIFEST_FILENAME}`;
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  return { manifest, manifestPath };
}
