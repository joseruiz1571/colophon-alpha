import { buildBundle, BundleBuildError } from "../../bundle/build.ts";
import { verifyBundle } from "../../bundle/verify.ts";
import { signBundle, verifyBundleSignature } from "../../bundle/sign.ts";
import { ReportBuildError } from "../../report/build.ts";
import { MissingEvidenceCitationError } from "../../report/citations.ts";

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

export async function runBundleCommand(args: string[]): Promise<number> {
  const [first, ...rest] = args;
  if (first === "verify") return verify(rest);
  if (first === "sign") return sign(rest);
  return build(args);
}

async function build(args: string[]): Promise<number> {
  const { flags } = parseFlags(args);
  const sessionId = flags["session"];
  const outDir = flags["out"];
  if (!sessionId || !outDir) {
    console.error("usage: colophon bundle --session <id> --out <dir>");
    return 1;
  }
  try {
    const result = await buildBundle({ sessionId, outDir });
    console.log(
      `colophon bundle: wrote ${result.manifestPath} covering ${result.manifest.files.length} file(s), ` +
        `root_hash ${result.manifest.root_hash}`,
    );
    return 0;
  } catch (err) {
    if (err instanceof BundleBuildError || err instanceof ReportBuildError || err instanceof MissingEvidenceCitationError) {
      console.error(`colophon bundle: FAIL CLOSED: ${err.message}`);
      return 1;
    }
    console.error(`colophon bundle: ${(err as Error).message}`);
    return 1;
  }
}

async function verify(args: string[]): Promise<number> {
  const { positional, flags } = parseFlags(args);
  const dir = positional[0];
  if (!dir) {
    console.error("usage: colophon bundle verify <dir> [--pub <pub>]");
    return 1;
  }
  const result = await verifyBundle(dir);
  if (!result.ok) {
    console.error(`colophon bundle verify: ${dir}: TAMPERED at ${result.badPath}`);
    console.error(`  - ${result.reason}`);
    return 1;
  }
  console.log(`colophon bundle verify: ${dir}: OK (integrity)`);

  const pub = flags["pub"];
  if (pub) {
    const sig = await verifyBundleSignature(dir, pub);
    if (!sig.ok) {
      console.error(`colophon bundle verify: ${dir}: signature verification FAILED`);
      console.error(sig.stderr || sig.stdout);
      return 1;
    }
    console.log(`colophon bundle verify: ${dir}: OK (signature)`);
  }
  return 0;
}

async function sign(args: string[]): Promise<number> {
  const { positional, flags } = parseFlags(args);
  const dir = positional[0];
  const key = flags["key"];
  if (!dir || !key) {
    console.error("usage: colophon bundle sign <dir> --key <key>");
    return 1;
  }
  const result = await signBundle(dir, key);
  if (!result.ok) {
    console.error(`colophon bundle sign: ${dir}: FAILED`);
    console.error(result.stderr || result.stdout);
    return 1;
  }
  console.log(`colophon bundle sign: ${dir}: wrote ${dir.replace(/\/+$/, "")}/manifest.json.sig`);
  return 0;
}
