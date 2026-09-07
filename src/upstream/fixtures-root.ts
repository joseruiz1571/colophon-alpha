import { resolve, relative, isAbsolute } from "node:path";

const REPO_ROOT = resolve(new URL("../../", import.meta.url).pathname);
const FIXTURES_ROOT = resolve(REPO_ROOT, "fixtures");

/**
 * Resolve `userPath` against the repository root and confirm it stays
 * inside fixtures/. Returns the resolved absolute path, or null if the
 * path would escape fixtures/ — callers must treat null as "refuse".
 *
 * This is defense in depth independent of the gate (SPEC.md C21: "None of
 * them touch the real network or filesystem outside fixtures/"): even if
 * the gate were somehow bypassed, the upstream itself will not read or
 * write outside this directory.
 */
export function resolveWithinFixtures(userPath: string): string | null {
  const candidate = isAbsolute(userPath) ? userPath : resolve(REPO_ROOT, userPath);
  const resolved = resolve(candidate);
  const rel = relative(FIXTURES_ROOT, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return null;
  }
  return resolved;
}

export { FIXTURES_ROOT, REPO_ROOT };
