# Colophon — Ideal State Specification v1.0

> A colophon is the statement at the back of a book that records who made it, where, and how. This product is that statement for AI agents: a signed, machine-readable record of what an agent was allowed to do, what it tried to do, what it was refused, and the evidence behind each of those facts.

This document defines **done**. It states outcomes and the contracts needed to verify them. It does not prescribe how to build. Read the whole document before writing any code. Every numbered claim (`C1`, `C2`, …) has a probe in the acceptance table at the end; a claim counts as met only when its probe passes from a fresh clone of the repository.

---

## 1. Problem

AI agents act through tools. Today the governance of those actions is documents: a policy PDF says what the agent may do, a vendor's dashboard says what it did, and nothing ties the two together in a form a pipeline can gate on or an auditor can verify after the fact. When an agent oversteps, the record of the overstep lives in the vendor's logs, in a format the customer does not control, with no proof it was not altered.

Three things are missing as one product: a declared, machine-readable statement of what each agent may do; a gate in the tool path that enforces that statement before each action executes; and a signed evidence trail that a third party can verify without trusting the vendor or the agent.

## 2. Vision

A GRC engineer declares an agent in a YAML file: its owner, its risk tier, the tools it may call, the data classes it may touch, the paths it may write. One command turns that declaration into an Agent Card. The agent's tool calls pass through a gate that consults the Card and a policy before anything executes; anything outside the Card is refused with a rule ID and a reason. Every decision lands in a hash-chained trace. One more command turns the trace plus collected evidence into an OSCAL Assessment Results document inside a bundle whose manifest is signed. Anyone with the public key and the bundle can prove the evidence is complete and unaltered, and can read exactly which control each finding satisfies or fails.

The demo scenario tells the story in under a minute: an agent is asked to produce a read-only evidence report about a set of repositories. Along the way it tries to request broader credential scopes, write a token to disk, read a repository outside its scope, and send an email. The gate refuses all four. The signed report shows the refusals as evidence that the least-agency control held.

## 3. Out of Scope

- No web UI, dashboard, or hosted service. CLI and library only.
- No multi-tenant or multi-user authorization. One operator, one machine.
- No live cloud calls in tests, demo, or CI. A live AWS collector exists behind an interface; it is never exercised without credentials the operator supplies explicitly, and none are supplied here.
- No LLM-driven agent in v1. The agent driver interface exists; the shipped driver replays a scripted scenario. No LLM API key is needed for anything in this specification.
- No authentication or transport security on the gate itself. It runs on a local stdio pipe.
- No policy hot-reload, no policy distribution, no bundle registry.
- No Model Card or System Card. Agent Card only.

## 4. Principles

- **Policy is data, not code.** Every allow, deny, or escalate decision comes from a Rego policy evaluated by OPA. Application code routes inputs and outputs; it never decides.
- **Fail closed.** A missing Card, an invalid Card, an unknown tool, an evaluation error, or an undefined policy result all mean deny. There is no default allow anywhere.
- **Evidence is content-addressed.** Every evidence item is identified by the SHA-256 of its payload. A report may cite only evidence retrieved in the same run.
- **Custody is provable, judgment is not.** The bundle proves who produced the bytes and that they are unaltered. It does not claim the assessment was correct. The narrative says so explicitly.
- **Say what is not done.** A `STATUS.md` in the repository lists every claim in this document as done, partial, or not done, with a pointer to the proof. An honest "not done" is worth more than a hidden gap.
- **One language for the control plane.** TypeScript on Bun for all application code. Rego for all policy. Nothing else.

## 5. Constraints

- Runtime: Bun ≥ 1.2. TypeScript with `strict: true`. No Python, no Go, no shell scripts as application code (shell in CI workflow steps is fine).
- Policy engine: OPA ≥ 1.0 with `import rego.v1`. Policy files live under `policy/`. Policy unit tests live beside them and run with `opa test policy/`.
- Package manager and runner: `bun` and `bunx` only.
- Schemas: JSON Schema draft 2020-12. Identifiers are UUID v4. Cards are canonicalized with RFC 8785 (JCS) before hashing or signing.
- Output standard: OSCAL 1.1.2 Assessment Results, valid against the official NIST JSON schema, which is vendored into the repository so validation runs offline.
- Signing: Sigstore Cosign `sign-blob` / `verify-blob` over the bundle manifest. Keyless in CI via GitHub OIDC; key-pair locally.
- Protocol: the gate and the demo upstream are Model Context Protocol servers over stdio, using the official TypeScript SDK.
- All fixtures, names, repositories, tokens, and people in scenarios are synthetic. Domains use `.example`.
- License: MIT. Repository is public.
- No credential value of any kind ever appears in a trace, an evidence item, a report, or a bundle. Arguments that carry credentials are stored as their SHA-256 only.
- `bun test`, `opa test`, the demo, and CI all complete with no network access other than fetching dependencies during install.

## 6. Goal

A public repository containing one Bun/TypeScript CLI named `colophon` that declares agents, exports and validates Agent Cards, gates MCP tool calls through Rego policy with fail-closed semantics, records hash-chained decision traces, collects evidence, emits schema-valid OSCAL Assessment Results with a fail-closed citation invariant, and writes a Cosign-signed, verifiable bundle; with a scripted end-to-end demo that refuses four out-of-scope actions and produces a signed bundle in under 60 seconds offline, and a CI workflow that proves all of it on every push.

## 7. Language

- **Declaration** — the operator-authored YAML describing one agent. The source of truth for what the agent may do. _Avoid:_ "config", "manifest" (manifest is the bundle's file list).
- **Agent Card** — the JSON export of a Declaration in the Card schema. Signed and hashed. What the gate reads. _Avoid:_ "profile", "A2A card" (that is a discovery document, not a permission record).
- **Gate** — the MCP server that sits between an agent and an upstream tool server and consults policy per call. _Avoid:_ "proxy" alone; it is a proxy that decides.
- **Decision** — the policy output for one call: `allow`, `deny`, or `escalate`, with `rule_ids` and `reasons`.
- **Trace** — the append-only, hash-chained record of Decisions for one session.
- **Evidence item** — one content-addressed payload retrieved by a collector in one run.
- **Bundle** — a directory holding the report, evidence, trace, and a manifest whose signature covers it all.
- **Scenario** — a scripted sequence of tool calls the agent driver replays.

## 8. Features and Claims

Claims are numbered globally. Each names its falsifier implicitly through the probe table in §10.

### F1 · Declare
Why: nothing downstream can be trusted if what the agent may do was never written down in a form a machine can check.

- [ ] C1: `colophon declare validate <file>` exits 0 for every file in `inventory/agents/` and exits non-zero, naming the field, for a declaration missing `owner`, `risk_tier`, or `tools`.
- [ ] C2: A Declaration carries at minimum: `id` (UUID v4), `name`, `owner`, `risk_tier` (`low|medium|high|critical`), `autonomy_level` (`assistive|supervised|delegated|autonomous_bounded|autonomous`), `tools[]` each with `name`, `data_access` (`read|write|none`), `data_classes[]`, `requires_approval`, and a `sandbox.write_paths[]` list. The schema lives at `schemas/declaration.schema.json`.
- [ ] C3: `colophon declare list` prints every declared agent with id, name, risk tier, and tool count, and exits 0.
- [ ] C4: The repository ships at least two Declarations: one `high` risk-tier agent whose tools are read-only, and one `low` risk-tier agent with a write-capable, approval-required tool.

### F2 · Card
Why: the Card is the portable, signable form other systems and the gate consume; the Declaration is for humans.

- [ ] C5: `colophon card export <agent-id> --out cards/` writes `cards/<agent-id>.card.json` that validates against `schemas/agent-card.schema.json` (draft 2020-12).
- [ ] C6: The Card schema requires `spec_version`, `card_type: "agent"`, `metadata`, `classification` (with `risk_tier` and `next_review` date), `autonomy`, `tools[]`, `decision_boundaries[]`, `escalation` (with `kill_switch`), `governance.control_mappings[]`, and `evidence[]`.
- [ ] C7: Each exported Card records `metadata.canonical_sha256`, the SHA-256 of its RFC 8785 canonical form excluding that field, and `colophon card verify <card>` recomputes and compares it, exiting non-zero on mismatch.
- [ ] C8: `colophon card lint <card>` evaluates `policy/card.rego` and denies a Card whose `next_review` is past, or whose `risk_tier` is `high` or `critical` without an available kill switch, and allows the shipped example Cards.
- [ ] C9: `colophon card validate <card>` exits non-zero for a Card with an all-zero UUID or a missing `classification.next_review`.

### F3 · Gate
Why: a permission record that nothing enforces is a document; the gate is where the Card becomes a control.

- [ ] C10: `colophon gate serve --card <card> --upstream "<command>"` starts an MCP stdio server that lists exactly the upstream tools whose names appear in the Card's `tools[]`, and no others.
- [ ] C11: Every `tools/call` is evaluated by `policy/gate.rego` with input `{card, call: {name, arguments}, context: {session_id, call_index, prior_decisions}}` producing `{effect, rule_ids, reasons}` at `data.colophon.gate.decision`.
- [ ] C12: A call to a tool not in the Card is denied with a rule ID, and the upstream is never invoked for it.
- [ ] C13: A call whose arguments touch a data class not in the tool's `data_classes` is denied with a rule ID.
- [ ] C14: A write to a path outside `sandbox.write_paths` is denied with a rule ID.
- [ ] C15: A call to any tool whose name matches the credential-scope family (`auth.*`) requesting scopes beyond those declared on the Card is denied with a rule ID.
- [ ] C16: A call to a tool with `requires_approval: true` returns `escalate`, is not executed, and the trace records the escalation with an approval fingerprint (SHA-256 of canonical `{name, arguments}`).
- [ ] C17: When an approvals file passed with `--approvals <file>` contains that fingerprint, the same call is allowed and executed once; a second identical call escalates again.
- [ ] C18: If the policy evaluation errors, returns undefined, or the Card fails schema validation at startup, the gate denies every call and logs the cause. It never falls open.
- [ ] C19: Changing a single rule in `policy/gate.rego` (for example, allowing `fs.write` anywhere) changes the demo's decisions with zero changes to any `.ts` file. No allow or deny logic exists in TypeScript.
- [ ] C20: `opa test policy/ -v` passes with at least 20 tests covering allow, deny, and escalate for every rule ID in `policy/gate.rego`, and `opa fmt --diff policy/` produces no output.

### F4 · Agent and demo upstream
Why: the gate needs something to guard and something to guard it from, and both have to run offline and deterministically.

- [ ] C21: `colophon upstream demo` is an MCP stdio server exposing at least these tools over a synthetic fixture tree: `fs.read`, `fs.write`, `repo.list`, `repo.read_settings`, `auth.request_scopes`, `net.fetch`, `mail.send`. None of them touch the real network or filesystem outside `fixtures/`.
- [ ] C22: `colophon agent run --scenario <file> --card <card>` connects an MCP client to the gate (which wraps the demo upstream), replays the scenario's ordered calls, and exits 0 when the scenario completes regardless of how many calls were denied.
- [ ] C23: The agent driver is an interface with a `ScriptDriver` implementation; an `LlmDriver` interface exists with no implementation and no provider dependency in `package.json`.
- [ ] C24: `scenarios/evidence-report.yaml` asks for branch-protection evidence on two in-scope repositories and includes, in order, at least these out-of-scope attempts: `auth.request_scopes` for `admin:org`, `fs.write` to `/tmp/gh-token.json` with a synthetic token argument, `repo.read_settings` on an out-of-scope repository, and `mail.send`. All four are denied; the in-scope reads are allowed.
- [ ] C25: `scenarios/compliant-run.yaml` contains only in-scope calls and every decision is `allow`.
- [ ] C26: `scenarios/approval-flow.yaml` exercises C16 and C17 end to end.

### F5 · Trace
Why: a decision nobody can later prove happened is not evidence.

- [ ] C27: The gate appends one JSON line per decision to `trace/<session_id>.jsonl` with fields: `ts`, `session_id`, `call_index`, `tool`, `args_sha256`, `args_redacted`, `effect`, `rule_ids`, `reasons`, `card_sha256`, `prev_hash`, `hash`, where `hash` is SHA-256 over the canonical line without `hash`.
- [ ] C28: `colophon trace verify <file>` exits 0 on an intact trace and exits non-zero naming the line index after any single byte in any line is altered.
- [ ] C29: The synthetic token argument from C24 appears nowhere in the trace, the evidence store, the report, or the bundle; its SHA-256 does.

### F6 · Collect
Why: the report must rest on retrieved facts, from the trace and from the environment, each retrievable again.

- [ ] C30: Collectors implement one interface returning evidence items `{id, source, retrieved_at, sha256, payload}` where `id` and `sha256` are the SHA-256 of the canonical payload.
- [ ] C31: `MCPTraceCollector` turns a verified trace into one evidence item per decision plus one summary item; `CardCollector` yields the Card as an evidence item.
- [ ] C32: An `AwsProvider` interface with at least `getCloudTrailEvents`, `getIamRolePolicy`, and `getBucketEncryption` has a `FixtureAwsProvider` implementation reading `fixtures/aws/`, and a `LiveAwsProvider` that is constructed only when `--live-aws` is passed and is never constructed in tests, demo, or CI.
- [ ] C33: The evidence store rejects a duplicate id and rejects an item whose `sha256` does not match its payload.

### F7 · Report
Why: findings only count when an auditor can read them in a standard form and trace each one to evidence that exists.

- [ ] C34: `controls/agent-controls.yaml` defines at least 8 controls, each with `id`, `framework_refs` (at least one of NIST AI RMF, ISO/IEC 42001, OWASP LLM Top 10, MITRE ATLAS), `intent`, and a deterministic `check` the report engine evaluates over evidence.
- [ ] C35: The control set includes at minimum: no executed call outside the Card; no executed write outside the sandbox; no executed credential-scope expansion; every deny carries a rule ID; trace chain intact; Card current and not stale; approval-required tools never executed without a matching approval; bundle manifest complete.
- [ ] C36: `colophon report --session <id> --out <dir>` writes `assessment-results.json` that validates against the vendored OSCAL 1.1.2 Assessment Results schema, with one finding per control and observations that cite evidence UUIDs.
- [ ] C37: Every evidence UUID cited in the report exists in that run's evidence store; a report that would cite a missing id fails before writing, with a named error.
- [ ] C38: `colophon report` also writes `narrative.md` containing a section that states what the bundle proves (integrity, completeness, authenticity) and what it does not prove (correctness of judgment).
- [ ] C39: For the `evidence-report` scenario, the report marks the least-agency controls satisfied and records the four refused attempts as observations; for a trace where an out-of-scope call was executed (a fixture trace shipped for this purpose), the report marks the corresponding control not satisfied.

### F8 · Bundle and sign
Why: the customer, not the vendor, should hold the proof.

- [ ] C40: `colophon bundle --session <id> --out <dir>` writes `report/`, `evidence/<id>.json` for every item retrieved (cited or not), `trace/`, and `manifest.json` with per-file sha256 and byte size and a root hash, written last; it refuses a non-empty output directory.
- [ ] C41: `colophon bundle verify <dir>` exits 0 on an intact bundle and exits non-zero naming the file after any single byte change or any added or removed file.
- [ ] C42: `colophon bundle sign <dir> --key <key>` and `colophon bundle verify <dir> --pub <pub>` wrap Cosign over `manifest.json`, and the CI workflow signs the demo bundle keyless and verifies it with a pinned certificate identity and OIDC issuer.

### F9 · Demo, docs, CI
Why: a product nobody can run in a minute from a clean clone is a claim, not a product.

- [ ] C43: `bun run demo` from a fresh clone (after `bun install`) runs declare → card → gate → agent (all three scenarios) → collect → report → bundle → verify, prints a summary table of decisions per scenario, writes everything under `out/demo/`, and exits 0 in under 60 seconds with no network access.
- [ ] C44: `bun run demo` twice in a row succeeds (the second run does not collide with the first).
- [ ] C45: `bun test` passes with at least 60 tests spanning every feature F1–F8; `bun run typecheck` exits 0.
- [ ] C46: `.github/workflows/ci.yml` runs on push and pull request: install, typecheck, `bun test`, `opa test`, `opa fmt --diff`, schema validation of all shipped Declarations and Cards, `bun run demo`, `colophon bundle verify`, keyless Cosign sign and verify, and a secret scan; the workflow is green on the default branch.
- [ ] C47: `README.md` has a quickstart that gets from clone to signed demo bundle in five commands or fewer, an architecture section naming the five stages, and a "what this proves / what it does not" section.
- [ ] C48: `STATUS.md` lists every claim C1–C50 as `done`, `partial`, or `not done`, each with a pointer (test name, file path, or command) and, for anything short of done, one sentence on why.
- [ ] C49: `SPEC.md` at the repository root is byte-identical to the specification the builder was given.
- [ ] C50: `DECISIONS.md` records every design decision the builder made where this document left room, including any question asked of the operator and the answer received.

### Anti-claims (must remain false)

- [ ] A1: No file under `src/` contains a tool allowlist, a path allowlist, or any `allow`/`deny` branch keyed on tool name or argument content.
- [ ] A2: No credential value, synthetic or real, appears in any committed file, trace, evidence item, report, or bundle. The secret scan in CI is the probe.
- [ ] A3: No test, demo, or CI step constructs `LiveAwsProvider` or reads `AWS_*` environment variables.
- [ ] A4: No dependency on any LLM provider SDK appears in `package.json`.
- [ ] A5: `bun run demo` writes nothing outside `out/` and `trace/` within the repository.

## 9. Deliverable contract

- A public GitHub repository, name supplied by the operator, default branch `main`, MIT license.
- CI green on `main` at hand-off.
- `SPEC.md`, `STATUS.md`, `DECISIONS.md`, `README.md` at the root.
- Conventional, readable commit history. No force-pushes to `main`.
- The builder asks the operator when this document is genuinely ambiguous, records each question and answer in `DECISIONS.md`, and otherwise decides and records.
- The builder requests no credentials, accounts, or access beyond write access to its own repository. If a step needs something it does not have, it records the gap in `STATUS.md` and moves on.

## 10. Acceptance probes

Each probe runs from the repository root of a fresh clone after `bun install`. `pass` is the exit status or output named. `$CLI` is `bun run colophon --`.

| claim | probe | pass |
|---|---|---|
| C1 | `for f in inventory/agents/*.yaml; do $CLI declare validate "$f" || exit 1; done` then `$CLI declare validate fixtures/bad/missing-owner.yaml` | first exits 0; second exits non-zero and stdout/stderr contains `owner` |
| C2 | `jq -r '.required[]' schemas/declaration.schema.json` | includes id, name, owner, risk_tier, autonomy_level, tools, sandbox |
| C3 | `$CLI declare list` | exit 0; ≥2 rows with id, name, risk tier, tool count |
| C4 | `grep -l 'risk_tier: high' inventory/agents/*.yaml` and `grep -l 'requires_approval: true' inventory/agents/*.yaml` | both non-empty |
| C5 | `$CLI card export <id> --out out/probe/ && $CLI card validate out/probe/<id>.card.json` | exit 0 |
| C6 | `jq -r '.required[]' schemas/agent-card.schema.json` | includes spec_version, card_type, metadata, classification, autonomy, tools, decision_boundaries, escalation, governance |
| C7 | export a card; `jq '.metadata.canonical_sha256="0000"' card > tampered.json; $CLI card verify tampered.json` | exit non-zero |
| C8 | `$CLI card lint fixtures/cards/stale.card.json; $CLI card lint fixtures/cards/high-no-killswitch.card.json; $CLI card lint cards/<good>.card.json` | non-zero, non-zero, zero |
| C9 | `$CLI card validate fixtures/cards/zero-uuid.card.json` | exit non-zero |
| C10 | run the gate against the demo upstream with a card declaring 3 tools; MCP `tools/list` via the agent's `--list-tools` flag | exactly the 3 names |
| C11 | `opa eval -d policy/ -i fixtures/gate-input/in-scope.json 'data.colophon.gate.decision'` | JSON with `effect`, `rule_ids`, `reasons` |
| C12 | `opa eval -d policy/ -i fixtures/gate-input/unknown-tool.json 'data.colophon.gate.decision.effect'` | `"deny"` |
| C13 | same with `fixtures/gate-input/data-class-violation.json` | `"deny"` |
| C14 | same with `fixtures/gate-input/write-outside-sandbox.json` | `"deny"` |
| C15 | same with `fixtures/gate-input/scope-expansion.json` | `"deny"` |
| C16 | same with `fixtures/gate-input/needs-approval.json` | `"escalate"` |
| C17 | `$CLI agent run --scenario scenarios/approval-flow.yaml --card <card> --approvals fixtures/approvals/one.json`; inspect trace | first matching call `allow`, second identical call `escalate` |
| C18 | `$CLI gate serve --card fixtures/cards/zero-uuid.card.json --upstream "$CLI upstream demo"` then any call | every decision `deny`; stderr names the cause |
| C19 | `git stash; sed` a copy of `policy/gate.rego` allowing all `fs.write`; rerun `scenarios/evidence-report.yaml`; `git diff --stat -- src/` | decision for the `/tmp/gh-token.json` write flips to `allow`; diff on `src/` is empty |
| C20 | `opa test policy/ -v && opa fmt --diff policy/` | exit 0; ≥20 PASS lines; no fmt output |
| C21 | `$CLI upstream demo --list-tools` | includes the 7 named tools |
| C22 | `$CLI agent run --scenario scenarios/evidence-report.yaml --card cards/<id>.card.json` | exit 0 |
| C23 | `grep -rn 'interface LlmDriver' src/` and `jq -r '(.dependencies + .devDependencies) \| keys[]' package.json` | interface present; the dependency list contains no LLM provider SDK (grader reads the list) |
| C24 | after C22, `jq -r 'select(.effect=="deny") | .tool' trace/<session>.jsonl` | contains auth.request_scopes, fs.write, repo.read_settings, mail.send |
| C25 | run compliant scenario; `jq -r '.effect' trace/<s>.jsonl | sort -u` | exactly `allow` |
| C26 | run approval scenario; `jq -r '.effect' trace/<s>.jsonl` | contains both `escalate` and `allow` |
| C27 | `head -1 trace/<s>.jsonl | jq 'keys'` | the 12 named fields |
| C28 | `sed -i.bak '3s/allow/deny/' copy.jsonl; $CLI trace verify copy.jsonl` | exit non-zero; output names line 3 |
| C29 | `grep -r "<synthetic token literal from scenario>" trace/ out/ ` | no matches |
| C30 | `grep -n 'interface Collector' src/` and evidence test names in `bun test` output | present |
| C31 | `bun test --test-name-pattern 'MCPTraceCollector\|CardCollector'` | pass |
| C32 | `grep -rn 'LiveAwsProvider' src/ test/ tests/ .github/` | constructed only behind `--live-aws` in `src/`; zero matches under tests and `.github/` |
| C33 | `bun test --test-name-pattern 'EvidenceStore'` | pass, includes duplicate-id and hash-mismatch cases |
| C34 | `bun -e "…count controls…"` or `grep -c '^- id:' controls/agent-controls.yaml` | ≥8 |
| C35 | `grep -E 'outside|sandbox|scope|rule_id|chain|stale|approval|manifest' controls/agent-controls.yaml` | all eight themes present |
| C36 | `bunx ajv-cli validate -s schemas/vendor/oscal_assessment-results_schema-1.1.2.json -d out/demo/*/report/assessment-results.json --spec=draft2020` | valid |
| C37 | `bun test --test-name-pattern 'citation'` | pass, includes a missing-id case that throws |
| C38 | `grep -i 'does not prove' out/demo/*/report/narrative.md` | match |
| C39 | `$CLI report --trace fixtures/traces/breach.jsonl --out out/probe-breach/`; `jq '[.["assessment-results"].results[].findings[] | select(.target.status.state=="not-satisfied")] | length' out/probe-breach/assessment-results.json` | ≥1 |
| C40 | `ls out/demo/*/` and `jq '.root_hash, (.files|length)' out/demo/*/manifest.json` | report/, evidence/, trace/, manifest.json present; root hash present; running bundle again into the same dir exits non-zero |
| C41 | `cp -r bundle b2; printf x >> b2/report/narrative.md; $CLI bundle verify b2` | exit non-zero naming `narrative.md` |
| C42 | `cosign generate-key-pair` (COSIGN_PASSWORD set); `$CLI bundle sign <dir> --key cosign.key && $CLI bundle verify <dir> --pub cosign.pub` | exit 0; CI log shows `verify-blob` success |
| C43 | `time bun run demo` on a fresh clone with network disabled after install | exit 0; wall clock < 60s; summary table printed |
| C44 | `bun run demo && bun run demo` | both exit 0 |
| C45 | `bun test 2>&1 | tail -3; bun run typecheck` | ≥60 pass, 0 fail; typecheck exit 0 |
| C46 | `gh run list --branch main --limit 1 --json conclusion -q '.[0].conclusion'` and read `.github/workflows/ci.yml` | `success`; all ten steps present |
| C47 | read README.md | quickstart ≤5 commands; five stages named; "does not prove" section present |
| C48 | `grep -cE '^\| ?C[0-9]+' STATUS.md` and spot-check three `done` rows | 50 rows; pointers resolve |
| C49 | `shasum -a 256 SPEC.md` | equals the hash the operator recorded |
| C50 | read DECISIONS.md | at least one decision per feature area that had room; every operator Q&A present |
| A1 | `grep -rnE '(allow|deny)' src/ \| grep -vE 'effect|Decision|trace|test|type|import'` | no branch keyed on tool name or path |
| A2 | `gitleaks detect --no-git -v` or the CI secret scan step | zero findings |
| A3 | `grep -rn 'AWS_' src/ test/ tests/ .github/ scenarios/` | matches only inside the live provider guarded by `--live-aws` |
| A4 | `jq -r '(.dependencies + .devDependencies) \| keys[]' package.json` | no LLM provider SDK in the list (grader reads) |
| A5 | `git status --porcelain` after `bun run demo` | only paths under `out/` or `trace/` |

## 11. What good looks like beyond the probes

The probes are the floor. Two things separate a good build from a passing one:

- The refusal messages read like an auditor wrote them. Rule ID, the Card field that bound it, the value that violated it.
- The narrative for the evidence-report scenario could be pasted into a third-party risk review as-is: what the agent was asked to do, what it tried, what was refused, what that proves, and what it does not.
