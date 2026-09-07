import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { sha256Hex } from "../util/canonical.ts";

/** True if `dir` does not exist, or exists and is empty. */
export async function isEmptyOrMissingDir(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir);
    return entries.length === 0;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw err;
  }
}

/** Recursively list every regular file under `dir`, as paths relative to `dir` using "/" separators. */
export async function listFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(sub: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(join(dir, sub), { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    for (const entry of entries) {
      const relPath = sub ? `${sub}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(relPath);
      } else if (entry.isFile()) {
        out.push(relPath);
      }
    }
  }
  await walk("");
  return out.sort();
}

/** SHA-256 of a file's raw bytes (not its canonical JSON form — most bundle files aren't JSON at all). */
export async function sha256OfFile(path: string): Promise<string> {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  return sha256Hex(bytes);
}
