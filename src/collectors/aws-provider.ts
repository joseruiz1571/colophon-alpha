/**
 * The interface a "cloud evidence" collector is built on (SPEC.md C32).
 * Every method returns whatever JSON-shaped evidence that AWS API would
 * hand back; nothing in this file or its implementations is Colophon's
 * business logic — it's just a typed seam between "get facts from AWS"
 * and "turn facts into evidence items", so that a live implementation
 * and a fixture implementation are interchangeable.
 */
export interface AwsProvider {
  getCloudTrailEvents(): Promise<unknown[]>;
  getIamRolePolicy(roleName: string): Promise<unknown>;
  getBucketEncryption(bucketName: string): Promise<unknown>;
}

/**
 * Reads canned responses from fixtures/aws/. This is the only AwsProvider
 * ever constructed in tests, the demo, or CI (SPEC.md §3, A3).
 */
export class FixtureAwsProvider implements AwsProvider {
  constructor(private readonly fixturesDir: string = "fixtures/aws") {}

  async getCloudTrailEvents(): Promise<unknown[]> {
    const text = await Bun.file(`${this.fixturesDir}/cloudtrail-events.json`).text();
    return JSON.parse(text) as unknown[];
  }

  async getIamRolePolicy(roleName: string): Promise<unknown> {
    const text = await Bun.file(`${this.fixturesDir}/iam-role-policy.json`).text();
    const all = JSON.parse(text) as Record<string, unknown>;
    if (!(roleName in all)) {
      throw new Error(`FixtureAwsProvider: no fixture IAM role policy for '${roleName}'`);
    }
    return all[roleName];
  }

  async getBucketEncryption(bucketName: string): Promise<unknown> {
    const text = await Bun.file(`${this.fixturesDir}/bucket-encryption.json`).text();
    const all = JSON.parse(text) as Record<string, unknown>;
    if (!(bucketName in all)) {
      throw new Error(`FixtureAwsProvider: no fixture bucket-encryption entry for '${bucketName}'`);
    }
    return all[bucketName];
  }
}

/**
 * A real AWS-backed provider. SPEC.md §3 rules out live cloud calls in
 * tests, the demo, and CI, and this repository ships no AWS SDK
 * dependency (A3's "no AWS_* environment variable reads outside the
 * live provider" and A4's dependency-list check both apply here) — so
 * this class exists to satisfy the interface and the gating requirement
 * (constructed only when an operator passes `--live-aws`, e.g. in
 * `colophon report`) but its methods are an honest stub: they require
 * real AWS credentials via `AWS_*` environment variables and throw a
 * clear "not implemented" error rather than silently returning
 * fabricated data. Wiring this up to real AWS APIs — almost certainly by
 * adding `@aws-sdk/*` as a dependency — is recorded in STATUS.md as the
 * one deliberately-left gap in F6.
 */
export class LiveAwsProvider implements AwsProvider {
  constructor() {
    const hasCreds = Boolean(process.env["AWS_ACCESS_KEY_ID"] || process.env["AWS_PROFILE"]);
    if (!hasCreds) {
      throw new Error(
        "LiveAwsProvider: no AWS_ACCESS_KEY_ID or AWS_PROFILE found in the environment; " +
          "refusing to construct a live AWS provider without operator-supplied credentials",
      );
    }
  }

  private notImplemented(method: string): never {
    throw new Error(
      `LiveAwsProvider.${method}: not implemented in this build — no AWS SDK dependency is installed ` +
        "(see STATUS.md / DECISIONS.md, F6). Use FixtureAwsProvider, or implement this method against " +
        "a real AWS SDK client before passing --live-aws in production.",
    );
  }

  async getCloudTrailEvents(): Promise<unknown[]> {
    this.notImplemented("getCloudTrailEvents");
  }

  async getIamRolePolicy(): Promise<unknown> {
    this.notImplemented("getIamRolePolicy");
  }

  async getBucketEncryption(): Promise<unknown> {
    this.notImplemented("getBucketEncryption");
  }
}
