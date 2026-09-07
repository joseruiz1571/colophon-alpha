import { describe, expect, test } from "bun:test";
import { opaEval } from "../src/util/opa.ts";
import { sha256OfCanonical } from "../src/util/canonical.ts";

/**
 * SPEC.md C19: "Changing a single rule in policy/gate.rego (for example,
 * allowing fs.write anywhere) changes the demo's decisions with zero
 * changes to any .ts file. No allow or deny logic exists in TypeScript."
 *
 * This test proves the mechanism directly: it copies policy/ to a temp
 * directory, patches exactly one condition in the copy (neutralizing the
 * sandbox-path check), and shows the same call/card input that the real
 * policy denies is allowed by the patched copy — without touching any
 * .ts file (this test file reads policy/gate.rego and writes only to a
 * temp directory).
 */
describe("Policy-only control (C19)", () => {
  test("neutralizing the sandbox rule in a patched copy of gate.rego flips a real denial to allow", async () => {
    const notifierCard = JSON.parse(
      await Bun.file("cards/8c1d4f22-0a3e-4c77-b6a1-5e9f2d7c3b02.card.json").text(),
    );
    // notifier's fs.write also requires_approval: true. To isolate the
    // sandbox rule as the *only* variable, supply a matching, unused
    // approval up front — so once the sandbox denial is neutralized,
    // nothing else stands between this call and a plain "allow".
    const callArgs = { path: "/tmp/gh-token.json", data_class: "local_fixture" };
    const fingerprint = sha256OfCanonical({ name: "fs.write", arguments: callArgs });
    const input = {
      card: notifierCard,
      call: { name: "fs.write", arguments: callArgs, fingerprint },
      context: { session_id: "test", call_index: 0, prior_decisions: [], approvals: [fingerprint] },
    };

    // 1. The real, unmodified policy denies this write (outside notifier's sandbox).
    const before = await opaEval("policy", input, "data.colophon.gate.decision");
    expect(before.ok).toBe(true);
    const beforeDecision = before.value as { effect: string; rule_ids: string[] };
    expect(beforeDecision.effect).toBe("deny");
    expect(beforeDecision.rule_ids).toContain("GATE-SANDBOX-VIOLATION");

    // 2. Patch *only* the sandbox rule in a temp copy of the policy — one
    //    line, no TypeScript involved — and rerun the identical input.
    const original = await Bun.file("policy/gate.rego").text();
    expect(original).toContain("not path_allowed");
    const patched = original.replace("not path_allowed", "false # C19 test patch: sandbox check neutralized");
    expect(patched).not.toBe(original);

    const tmpDir = `test/tmp-policy-c19-${Date.now()}`;
    await Bun.write(`${tmpDir}/gate.rego`, patched);
    await Bun.write(`${tmpDir}/card.rego`, await Bun.file("policy/card.rego").text());

    try {
      const after = await opaEval(tmpDir, input, "data.colophon.gate.decision");
      expect(after.ok).toBe(true);
      const afterDecision = after.value as { effect: string; rule_ids: string[] };
      expect(afterDecision.effect).toBe("allow");
    } finally {
      await Bun.$`rm -rf ${tmpDir}`.quiet().nothrow();
    }
  });
});
