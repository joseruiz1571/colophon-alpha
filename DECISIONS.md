# Decisions

This document records every point where SPEC.md left room for a design choice, the choice made, and why. It also records every question asked of the operator (Jose) and the answer received, per SPEC.md §9.

Format: one entry per decision, newest at the bottom of its feature section.

## Operator questions and answers

- Q (2026-09-07, before starting): none asked. SPEC.md is exhaustive about outcomes and probes and explicitly assigns undecided points to the builder via this file, so no question blocked starting.
- The one non-spec blocker raised with the operator was infrastructure, not a spec ambiguity: this session's GitHub credential is repo-scoped and `colophon-alpha` was not yet enabled for it. That is tracked in STATUS.md, not here, since it is not a design decision.

## General

- **Runtime/tooling install**: OPA v1.4.2 (static linux/amd64 binary from openpolicyagent.org/downloads), Cosign v3.1.3 (github.com/sigstore/cosign release binary), GitHub CLI v2.63.2 (github.com release tarball) were downloaded directly as binaries into `/usr/local/bin` in the build environment since no package manager (apt/brew) with those packages was available/needed. `jq` and `git` were already present. None of this is vendored into the repository; CI installs the same way (documented in the workflow and in README prerequisites).
- **Package manager**: `bun install` only, per §5. `bun.lockb` is committed is *not* committed (binary lockfile is gitignored per repo convention of avoiding binary diffs)... see note below if this causes reproducibility concerns; `package.json` version ranges are pinned tightly enough (`^` on a fixed minor) that fresh installs are stable. (Revisit if this proves brittle.)

## F2 · Card — OSCAL/JSON-Schema draft mismatch discovered while vendoring

- **What was found**: NIST's actual published OSCAL 1.1.2 Assessment Results JSON Schema (`oscal_assessment-results_schema.json`, fetched from the `usnistgov/OSCAL` v1.1.2 GitHub release assets, since the schema is a *build artifact* attached to the release and is not committed to the repository source tree) declares `"$schema": "http://json-schema.org/draft-07/schema#"` and uses draft-07-only idioms (in particular, dozens of definitions use `"$id": "#plain-name-fragment"` as an anchor, which is invalid under JSON Schema 2020-12's stricter `$id` — 2020-12 requires `$anchor` for that purpose and forbids a fragment on `$id`). Relabeling the `$schema` URI to 2020-12 without further rewriting breaks compilation (confirmed empirically: `$id must match pattern "^[^#]*#?$"`).
- **Decision**: vendor NIST's schema byte-for-byte as published (no edits) at `schemas/vendor/oscal_assessment-results_schema-1.1.2.json`, and validate it as the draft-07 document it actually is: `new Ajv()` (draft-07 default) + `ajv-formats`, or equivalently `ajv-cli validate -c ajv-formats -s <schema> -d <doc>` with **no** `--spec` flag. This mirrors how the OSCAL project validates its own generated schemas in its build (`build/Makefile`: `npx ajv compile -c ajv-formats -s .../*_schema.json`).
- **Consequence for §10's probe table**: the literal probe text for C36 (`bunx ajv-cli validate -s schemas/vendor/... -d ... --spec=draft2020`) does not apply to the real NIST artifact — passing `--spec=draft2020` against a draft-07 schema with plain-name-fragment `$id`s fails to compile, regardless of whether the instance document is valid OSCAL. STATUS.md records C36 as done via the draft-07-correct invocation and calls out this discrepancy explicitly rather than silently matching the literal flag or silently failing.
- **Everything we author ourselves** (`schemas/declaration.schema.json`, `schemas/agent-card.schema.json`) is written and validated as JSON Schema 2020-12 per §5, with no such conflict — the mismatch is specific to the third-party NIST artifact.

## F1 · Declare

- **Fail-closed loading**: `loadDeclaration` never throws for a missing file, malformed YAML, or a schema violation — all three surface as `{ valid: false, errors }`. This mirrors the gate's own fail-closed rule (Principle 2) one layer up: nothing downstream should have to distinguish "the Declaration was invalid" from "the Declaration couldn't be read" or "the Declaration wasn't there".
- **`tools[].max_scopes`**: added as an optional field beyond C2's minimum, to give `auth.*` tool grants a place to declare the credential scopes they may request (consumed by the C15 gate rule and by Card `decision_boundaries`).

## F2 · Card

- **OSCAL/JSON-Schema draft mismatch**: see the dedicated section above (added while vendoring the schema, before Card-proper was built).
- **`classification.next_review` default when the Declaration omits it**: the Declaration schema does not require `next_review` (C2's required list), but the Card schema does (C6). `card export` fills a default of today + 60/90/180/365 days for critical/high/medium/low risk tiers respectively when the Declaration doesn't specify one. Both shipped Declarations specify `next_review` explicitly, so this default only matters for future Declarations that omit it.
- **`metadata.id` pattern**: the Card schema requires a UUID *v4* pattern (matching the Declaration schema), not just "any UUID shape". This means C9's "all-zero UUID is invalid" requirement falls directly out of ordinary schema validation — no separate semantic check was needed in `card validate` beyond running the schema.
- **`decision_boundaries[]` derivation**: built deterministically from the Declaration: one `tool_scope` entry per tool grant, one `data_class` entry per unique data class across all tools, one `sandbox_path` entry per write path (or a single "no write paths granted" entry when the sandbox is empty), and one `credential_scope` entry per tool that declares `max_scopes`. This array is documentation for auditors; it is not itself read by the gate's policy, which reads `card.tools[]` directly (see F3).
- **`governance.control_mappings[]`**: populated with a small fixed baseline (NIST AI RMF GOVERN-1.1 / MANAGE-2.3, ISO/IEC 42001 §8.3) describing what having *any* Card with enforced tool/data/sandbox boundaries demonstrates. This is informative metadata on the Card itself, independent of the per-run control evaluation in F7 (`controls/agent-controls.yaml`), which is evaluated against evidence from a specific session, not against the Card in the abstract.
- **`escalation.kill_switch`**: every Card built by `card export` sets `kill_switch.available: true` with a fixed mechanism description (revoke by invalidating the Card file; the gate fails closed on an invalid/missing Card at startup — see F3). A Card with `kill_switch.available: false` only exists as a deliberately crafted lint fixture (`fixtures/cards/high-no-killswitch.card.json`), never as CLI output.
- **`cards/` at the repository root ships pre-exported, committed Cards** for both example Declarations (not just `fixtures/`). This is necessary for §10 probes that reference `cards/<id>.card.json` directly against a fresh clone without first running `card export` (e.g. C22's literal probe text). The demo pipeline (F9) additionally exports its own fresh copies under `out/demo/` on every run, so the committed `cards/` files are a stable, human-reviewable reference copy, not something the pipeline depends on being pre-existing.
- **Card lint (`policy/card.rego`) takes the Card directly as `input`**, not wrapped in an envelope — unlike the gate's `{card, call, context}` input shape (F3), because lint has only one document to reason about.

## F3 · Gate

- **Data classes carry resource scope, not just category**: `data_classes` on a tool grant are opaque, operator-chosen strings — nothing in the schema or policy requires them to be generic categories like `repo_metadata`. The demo Declarations use scoped strings like `branch_protection:colophon-demo-a` so that "may read branch protection for repo A and B" and "may not read it for repo C" are both expressible as ordinary data-class grants, without inventing a separate repo-allowlist construct alongside data_classes. `repo.read_settings` on an out-of-scope repository (C24's third refusal) and a generic data-class violation (C13) are therefore the same policy rule (`GATE-DATA-CLASS-VIOLATION`), which is simpler and, we think, more honest than pretending they're different mechanisms.
- **Where the `data_class` label on a call comes from**: each tool call's `arguments.data_class` names the sensitivity/scope of the specific resource that call targets. For this v1 scripted demo (no LLM driver exists — C23/A4), that label is authored into the scenario YAML by the operator at scenario-design time, not chosen at runtime by an autonomous agent deciding what to claim about itself. A future non-scripted driver would need this derived server-side (e.g. the upstream or gate consulting a resource→data-class registry) rather than trusting caller-supplied metadata; that registry is out of scope for v1. This is recorded here because it is a real simplification, not because it weakens the gate for what v1 actually claims to do: the *decision* of allow/deny given a data-class label is still 100% Rego (Principle 1); only the *labeling* of a specific call's target is input data, as any argument must be.
- **Approval fingerprints are computed once, in TypeScript, not duplicated in Rego**: `input.call.fingerprint` is precomputed by the gate as `sha256(RFC 8785 canonical form of {name, arguments}))` using the same `src/util/canonical.ts` used for Card hashing and the trace chain, and Rego simply reads `input.call.fingerprint` (`policy/gate.rego`, `approval_fingerprint := input.call.fingerprint`). We considered having Rego compute its own hash via `crypto.sha256(json.marshal(...))`, but that risks a silent mismatch against the fingerprint an operator computes when preparing an `--approvals` file (different JSON serialization conventions between Go's `json.marshal` and RFC 8785). Precomputing keeps exactly one canonicalization implementation in the whole system. This does not violate "policy is data, not code" (Principle 1): TypeScript still makes zero allow/deny/escalate decisions; it only computes a value that is, itself, part of the call's data.
- **Single-use approvals are enforced entirely via `context.prior_decisions`**, per C11's input shape — not by the gate mutating or removing entries from the `--approvals` file. Each policy evaluation receives the Card, the call, the full static approvals list, and every decision made earlier in the session; Rego alone decides whether a given approval fingerprint has already been consumed by scanning for an earlier `effect: "allow"` decision carrying that fingerprint. The gate's TypeScript layer only accumulates and forwards `prior_decisions` — it never decides "is this approval still good".
- **Multiple simultaneous violations are all reported together** (`deny_reasons`/`escalate_reasons` are Rego partial sets, unioned into the decision), mirroring `policy/card.rego`'s approach — an operator debugging a denied call should see every rule it broke, not just the first one evaluated.
- **Rule IDs**: `GATE-UNKNOWN-TOOL`, `GATE-DATA-CLASS-VIOLATION`, `GATE-SANDBOX-VIOLATION`, `GATE-SCOPE-EXPANSION`, `GATE-REQUIRES-APPROVAL` (escalate), `GATE-APPROVED` (allow via a consumed approval), `GATE-ALLOWED` (the plain default-allow path). All seven appear in `policy/gate_test.rego`'s 22 tests.
- **`policy/gate.rego` is not usable standalone with `default allow := true` anywhere** — `effect` has no default-allow branch; it is `"deny"` if any deny reason fired, else `"escalate"` if any escalate reason fired, else `"allow"`. Combined with `src/util/opa.ts` treating any OPA process error or undefined query as deny, this is the concrete mechanism behind C18's "never falls open".

## F5 · Trace

- **Credential redaction is key-name-based**, not a manual per-tool allowlist: any argument key matching `/token|secret|password|credential|api[_-]?key/i`, at any nesting depth, is replaced with the literal string `"[REDACTED]"` in `args_redacted` (`src/util/redact.ts`). The separate `args_sha256` field hashes the true, unredacted arguments — an auditor can prove two calls used identical arguments (matching hashes) without the trace ever holding the sensitive value itself (C29).
- **Hash chain genesis**: the first line of a fresh trace file has `prev_hash` equal to 64 zero characters (`GENESIS_HASH`), rather than being null/omitted, so every line — including the first — has a well-formed, fixed-width `prev_hash` to verify.
- **`TraceWriter` resumes an existing file's chain** (reads the last line's `hash` as the starting `prev_hash`) instead of always starting fresh at genesis, so a gate process that appends to the same session across multiple invocations still produces one continuous, verifiable chain.
- **`colophon trace verify` reports 1-indexed line numbers**, matching how a human (or `sed -i '3s/.../.../''`) counts lines, per C28's probe wording ("names the line index").

## F4 · Agent and demo upstream

(decisions added as this feature is built)

## F5 · Trace

(decisions added as this feature is built)

## F6 · Collect

(decisions added as this feature is built)

## F7 · Report

(decisions added as this feature is built)

## F8 · Bundle and sign

(decisions added as this feature is built)

## F9 · Demo, docs, CI

(decisions added as this feature is built)
