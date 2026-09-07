export interface ManifestFileEntry {
  /** Forward-slash path relative to the bundle root, e.g. "report/narrative.md". */
  path: string;
  sha256: string;
  size: number;
}

/** SPEC.md C40: per-file sha256 and byte size, plus a root hash written last. */
export interface BundleManifest {
  session_id: string;
  generated_at: string;
  files: ManifestFileEntry[];
  root_hash: string;
}

/** Filenames `colophon bundle verify` never treats as unexpected extras: the manifest itself, and the Cosign signature artifact `colophon bundle sign` writes beside it (both necessarily postdate the manifest, so neither can be *in* it). */
export const MANIFEST_FILENAME = "manifest.json";
export const SIGNATURE_FILENAME = "manifest.json.sig";
