import { describe, expect, test, afterEach } from "bun:test";
import { TraceWriter } from "../src/trace/writer.ts";
import { verifyTraceFile } from "../src/trace/verify.ts";

const TRACE_DIR = "test/tmp-trace";

async function cleanup() {
  await Bun.$`rm -rf ${TRACE_DIR}`.quiet().nothrow();
}

describe("Trace (F5)", () => {
  afterEach(cleanup);

  test("a fresh trace with several decisions verifies OK", async () => {
    const sessionId = `s-${Date.now()}`;
    const writer = new TraceWriter(sessionId, TRACE_DIR);
    await writer.append({
      call_index: 0,
      tool: "repo.list",
      arguments: { org: "example" },
      effect: "allow",
      rule_ids: ["GATE-ALLOWED"],
      reasons: ["ok"],
      card_sha256: "a".repeat(64),
    });
    await writer.append({
      call_index: 1,
      tool: "mail.send",
      arguments: { to: "x@example" },
      effect: "deny",
      rule_ids: ["GATE-UNKNOWN-TOOL"],
      reasons: ["not granted"],
      card_sha256: "a".repeat(64),
    });

    const result = await verifyTraceFile(`${TRACE_DIR}/${sessionId}.jsonl`);
    expect(result.ok).toBe(true);
    expect(result.lineCount).toBe(2);
  });

  test("chain links: each line's prev_hash equals the previous line's hash", async () => {
    const sessionId = `s-${Date.now()}-chain`;
    const writer = new TraceWriter(sessionId, TRACE_DIR);
    const l1 = await writer.append({
      call_index: 0,
      tool: "a",
      arguments: {},
      effect: "allow",
      rule_ids: [],
      reasons: [],
      card_sha256: "a".repeat(64),
    });
    const l2 = await writer.append({
      call_index: 1,
      tool: "b",
      arguments: {},
      effect: "allow",
      rule_ids: [],
      reasons: [],
      card_sha256: "a".repeat(64),
    });
    expect(l2.prev_hash).toBe(l1.hash);
  });

  test("credential-looking arguments are redacted but their hash still covers the true value (C29)", async () => {
    const sessionId = `s-${Date.now()}-redact`;
    const writer = new TraceWriter(sessionId, TRACE_DIR);
    const secretToken = "synthetic-token-should-never-appear-in-trace";
    const line = await writer.append({
      call_index: 0,
      tool: "fs.write",
      arguments: { path: "/tmp/gh-token.json", token: secretToken },
      effect: "deny",
      rule_ids: ["GATE-SANDBOX-VIOLATION"],
      reasons: ["outside sandbox"],
      card_sha256: "a".repeat(64),
    });

    const raw = await Bun.file(`${TRACE_DIR}/${sessionId}.jsonl`).text();
    expect(raw).not.toContain(secretToken);
    expect((line.args_redacted as { token: string }).token).toBe("[REDACTED]");
    expect(line.args_sha256).toHaveLength(64);
  });

  test("tampering with a byte in one line is detected and the line index is named (C28)", async () => {
    const sessionId = `s-${Date.now()}-tamper`;
    const writer = new TraceWriter(sessionId, TRACE_DIR);
    await writer.append({
      call_index: 0,
      tool: "a",
      arguments: {},
      effect: "allow",
      rule_ids: [],
      reasons: [],
      card_sha256: "a".repeat(64),
    });
    await writer.append({
      call_index: 1,
      tool: "b",
      arguments: {},
      effect: "deny",
      rule_ids: ["X"],
      reasons: ["y"],
      card_sha256: "a".repeat(64),
    });
    await writer.append({
      call_index: 2,
      tool: "c",
      arguments: {},
      effect: "allow",
      rule_ids: [],
      reasons: [],
      card_sha256: "a".repeat(64),
    });

    const path = `${TRACE_DIR}/${sessionId}.jsonl`;
    const text = await Bun.file(path).text();
    const tampered = text.replace('"effect":"deny"', '"effect":"allow"');
    await Bun.write(path, tampered);

    const result = await verifyTraceFile(path);
    expect(result.ok).toBe(false);
    expect(result.badLine).toBe(2);
  });

  test("an empty trace file verifies OK with zero lines", async () => {
    const sessionId = `s-${Date.now()}-empty`;
    await Bun.write(`${TRACE_DIR}/${sessionId}.jsonl`, "");
    const result = await verifyTraceFile(`${TRACE_DIR}/${sessionId}.jsonl`);
    expect(result.ok).toBe(true);
    expect(result.lineCount).toBe(0);
  });

  test("resuming a TraceWriter on an existing file continues the chain instead of restarting", async () => {
    const sessionId = `s-${Date.now()}-resume`;
    const w1 = new TraceWriter(sessionId, TRACE_DIR);
    const l1 = await w1.append({
      call_index: 0,
      tool: "a",
      arguments: {},
      effect: "allow",
      rule_ids: [],
      reasons: [],
      card_sha256: "a".repeat(64),
    });
    const w2 = new TraceWriter(sessionId, TRACE_DIR);
    const l2 = await w2.append({
      call_index: 1,
      tool: "b",
      arguments: {},
      effect: "allow",
      rule_ids: [],
      reasons: [],
      card_sha256: "a".repeat(64),
    });
    expect(l2.prev_hash).toBe(l1.hash);
    const result = await verifyTraceFile(`${TRACE_DIR}/${sessionId}.jsonl`);
    expect(result.ok).toBe(true);
  });
});
