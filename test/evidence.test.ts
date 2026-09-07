import { describe, expect, test } from "bun:test";
import { EvidenceStore, DuplicateEvidenceIdError, EvidenceHashMismatchError } from "../src/evidence/store.ts";
import { MCPTraceCollector } from "../src/collectors/mcp-trace-collector.ts";
import { CardCollector } from "../src/collectors/card-collector.ts";
import { FixtureAwsProvider } from "../src/collectors/aws-provider.ts";
import { TraceWriter } from "../src/trace/writer.ts";
import { sha256OfCanonical } from "../src/util/canonical.ts";

const TRACE_DIR = "test/tmp-evidence-trace";

describe("EvidenceStore (C33)", () => {
  test("accepts an item whose sha256 matches its payload", () => {
    const store = new EvidenceStore();
    const payload = { a: 1 };
    store.add({ id: sha256OfCanonical(payload), source: "x", retrieved_at: "t", sha256: sha256OfCanonical(payload), payload });
    expect(store.size).toBe(1);
  });

  test("rejects a duplicate id", () => {
    const store = new EvidenceStore();
    const payload = { a: 1 };
    const sha = sha256OfCanonical(payload);
    store.add({ id: sha, source: "x", retrieved_at: "t", sha256: sha, payload });
    expect(() => store.add({ id: sha, source: "y", retrieved_at: "t2", sha256: sha, payload })).toThrow(
      DuplicateEvidenceIdError,
    );
  });

  test("rejects an item whose sha256 does not match its payload", () => {
    const store = new EvidenceStore();
    const payload = { a: 1 };
    expect(() =>
      store.add({ id: "bad", source: "x", retrieved_at: "t", sha256: "0".repeat(64), payload }),
    ).toThrow(EvidenceHashMismatchError);
  });
});

describe("MCPTraceCollector (C31)", () => {
  test("produces one evidence item per decision plus one summary item", async () => {
    const sessionId = `evc-${Date.now()}`;
    const writer = new TraceWriter(sessionId, TRACE_DIR);
    await writer.append({ call_index: 0, tool: "a", arguments: {}, effect: "allow", rule_ids: [], reasons: [], card_sha256: "x" });
    await writer.append({ call_index: 1, tool: "b", arguments: {}, effect: "deny", rule_ids: ["R"], reasons: ["r"], card_sha256: "x" });

    const collector = new MCPTraceCollector(`${TRACE_DIR}/${sessionId}.jsonl`);
    const items = await collector.collect();
    expect(items).toHaveLength(3); // 2 decisions + 1 summary

    const store = new EvidenceStore();
    store.addAll(items);
    expect(store.size).toBe(3);

    const summary = items.find((i) => i.source.endsWith(":summary"));
    expect(summary).toBeDefined();
    expect((summary!.payload as { total_decisions: number }).total_decisions).toBe(2);

    await Bun.$`rm -rf ${TRACE_DIR}`.quiet().nothrow();
  });

  test("refuses to collect from a tampered trace", async () => {
    const sessionId = `evc-tamper-${Date.now()}`;
    const writer = new TraceWriter(sessionId, TRACE_DIR);
    await writer.append({ call_index: 0, tool: "a", arguments: {}, effect: "allow", rule_ids: [], reasons: [], card_sha256: "x" });
    const path = `${TRACE_DIR}/${sessionId}.jsonl`;
    const tampered = (await Bun.file(path).text()).replace('"tool":"a"', '"tool":"z"');
    await Bun.write(path, tampered);

    const collector = new MCPTraceCollector(path);
    await expect(collector.collect()).rejects.toThrow();
    await Bun.$`rm -rf ${TRACE_DIR}`.quiet().nothrow();
  });
});

describe("CardCollector (C31)", () => {
  test("yields the Card as one evidence item", async () => {
    const card = JSON.parse(await Bun.file("cards/3f2a9e10-6b7a-4b1a-9c9e-2b6a7f4d1a01.card.json").text());
    const collector = new CardCollector(card);
    const items = await collector.collect();
    expect(items).toHaveLength(1);
    expect(items[0]!.sha256).toBe(sha256OfCanonical(card));
  });
});

describe("AwsProvider (C32)", () => {
  test("FixtureAwsProvider reads all three fixture files", async () => {
    const provider = new FixtureAwsProvider();
    const events = await provider.getCloudTrailEvents();
    expect(Array.isArray(events)).toBe(true);
    expect((events as unknown[]).length).toBeGreaterThan(0);

    const policy = await provider.getIamRolePolicy("colophon-demo-role");
    expect(policy).toBeDefined();

    const enc = await provider.getBucketEncryption("colophon-demo-bucket");
    expect(enc).toBeDefined();
  });

  // A second, live-cloud-backed provider also exists alongside this one
  // (src/collectors/aws-provider.ts) but is deliberately never referenced
  // from this test suite or read from here — see SPEC.md anti-claim A3
  // and DECISIONS.md, F6. Its credential-gating is reviewed by hand.
});
