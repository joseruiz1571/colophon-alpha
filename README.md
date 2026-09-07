# Colophon

> A colophon is the statement at the back of a book that records who made it, where, and how. This is that statement for AI agents: a signed, machine-readable record of what an agent was allowed to do, what it tried to do, what it was refused, and the evidence behind each of those facts.

Colophon is a Bun/TypeScript CLI. It declares AI agents in YAML, exports signable Agent Cards, gates their Model Context Protocol (MCP) tool calls through an OPA/Rego policy with fail-closed semantics, records every decision in a hash-chained trace, collects evidence, emits a schema-valid OSCAL 1.1.2 Assessment Results document, and assembles a Cosign-signed, independently verifiable bundle.

The full specification this repository was built against is [`SPEC.md`](./SPEC.md). [`STATUS.md`](./STATUS.md) lists every claim in it as done, partial, or not done. [`DECISIONS.md`](./DECISIONS.md) records every design decision made where the spec left room.

## Quickstart

```
git clone https://github.com/joseruiz1571/colophon-alpha.git
cd colophon-alpha
bun install
bun run demo
```

`bun run demo` runs the entire pipeline — declare, card, gate, agent (all three scenarios), collect, report, bundle, sign, and verify — offline, in about 15 seconds, and prints a summary table. It writes everything under `out/demo/<run-id>/`, one signed, independently-verifiable bundle per scenario.

To poke at one piece by hand instead of the whole pipeline:

```
bun run colophon declare list
bun run colophon card export <agent-id> --out cards/
bun run colophon agent run --scenario scenarios/evidence-report.yaml --card cards/<agent-id>.card.json
bun run colophon bundle --session <session-id> --out out/my-bundle/
bun run colophon bundle verify out/my-bundle/
```

Run `bun run colophon --help` for the full command list, and `bun test` / `bun run typecheck` / `opa test policy/ -v` to run the test suite.

## Architecture

Colophon's pipeline is five stages, each a thin layer over the last:

1. **Declare & Card** (`inventory/agents/*.yaml` → `colophon card export`) — an operator writes a Declaration: an agent's owner, risk tier, autonomy level, the tools it may call, the data classes and filesystem paths it may touch. `colophon card export` turns it into an Agent Card: the same information canonicalized (RFC 8785), hashed, and schema-validated — the portable, signable artifact everything downstream actually reads. `colophon card lint`/`validate` catch a stale review date, a missing kill switch, or a malformed Card before it ever reaches a gate.

2. **Gate** (`colophon gate serve`) — an MCP server that sits between an agent and a real (or, in the demo, synthetic) upstream tool server. Every `tools/call` is evaluated by `policy/gate.rego` under OPA, with the Card and the call as input, before anything executes. The policy — never application code — decides `allow`, `deny`, or `escalate`; an unknown tool, an out-of-scope data class, a write outside the sandbox, a credential-scope expansion, and a missing or already-consumed approval are each their own rule with its own rule ID. Any Card or policy failure denies every call; there is no default allow anywhere.

3. **Trace** (`trace/<session-id>.jsonl`) — the gate appends one JSON line per decision, each hash-linked to the one before it. `colophon trace verify` recomputes the chain and names the exact line a single altered byte would land on.

4. **Collect & Report** (`colophon report`) — collectors turn a verified trace and its Card into content-addressed evidence items (each identified by the SHA-256 of its own payload). `colophon report` evaluates a control set (`controls/agent-controls.yaml`) over that evidence and emits an OSCAL 1.1.2 Assessment Results document — one finding per control, each backed by observations that cite the evidence behind it — plus a narrative. It refuses to write anything if a finding would cite evidence that was never actually collected.

5. **Bundle & Sign** (`colophon bundle`) — assembles the report, every evidence item, the raw trace, and a manifest (per-file SHA-256 and size, plus a root hash written last) into one directory, and refuses to write into a non-empty one. `colophon bundle verify` re-checks every file and names exactly what changed if anything did; `colophon bundle sign`/`verify --pub` wrap Sigstore Cosign over the manifest so a third party can check the bundle's authenticity without trusting Colophon or the agent that produced it.

## What this proves — and what it does not

**Proves:**
- **Integrity** — a session's trace is a hash chain; a single altered byte anywhere in it is detectable and named by line, and the same is true of every file in a signed bundle.
- **Completeness** — every fact a report cites was actually collected in that run and is content-addressed by its own hash; nothing is cited that doesn't exist.
- **Authenticity** — every allow, deny, and escalate decision came from `policy/gate.rego` evaluated by OPA, never from a branch in application code, and a signed bundle's manifest is verifiable against a public key (or, in CI, a keyless GitHub OIDC identity) without trusting whoever produced it.

**Does not prove:**
- **Correctness of judgment.** Colophon proves the gate enforced whatever the policy said, and that the record of it is unaltered. It does not certify that the Card's declared scope, or the policy's rules, were the *right* scope or rules for that agent — that's a judgment call for the operator and any reviewer, not something a hash chain can make for them.
- **Anything outside one session.** A trace, its evidence, and its report cover exactly the decisions made under one Card in one session. They say nothing about a different Card, a different session, or any action taken outside Colophon's gate entirely.

## Scope

No web UI, no multi-tenant authorization, no live cloud calls in tests or the demo, no LLM-driven agent (the shipped driver replays a scripted scenario; an `LlmDriver` interface exists with no implementation and no provider dependency), and no authentication on the gate itself, which runs on a local stdio pipe. See `SPEC.md` §3 for the full list.

## License

MIT — see [`LICENSE`](./LICENSE).
