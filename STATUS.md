# Status

Every claim from `SPEC.md` §8/§10, `done`/`partial`/`not done`, with a pointer to the proof. Every row below was checked by actually running its probe from `SPEC.md` §10 (or, where the probe is `git`/`bash`-shaped, the equivalent commands) against this repository — an unprobed claim is not marked `done`. See `DECISIONS.md` for the reasoning behind every partial or not-done item.

| Claim | Status | Pointer |
|---|---|---|
| C1 | done | `test/declare.test.ts`; `bun run colophon declare validate inventory/agents/*.yaml` exits 0, `... fixtures/bad/missing-owner.yaml` exits non-zero naming `owner`. |
| C2 | done | `schemas/declaration.schema.json` — `jq -r '.required[]'` lists `id, name, owner, risk_tier, autonomy_level, tools, sandbox`. |
| C3 | done | `test/declare.test.ts`; `colophon declare list` prints id/name/risk tier/tool count for both shipped agents, exit 0. |
| C4 | done | `inventory/agents/evidence-collector.yaml` (`risk_tier: high`, no write tool); `inventory/agents/notifier.yaml` (`requires_approval: true` on its one `fs.write` tool). |
| C5 | done | `test/card.test.ts`; `colophon card export <id> --out out/probe/ && colophon card validate out/probe/<id>.card.json` exits 0. |
| C6 | done | `schemas/agent-card.schema.json` — `jq -r '.required[]'` lists `spec_version, card_type, metadata, classification, autonomy, tools, decision_boundaries, escalation, governance, evidence`. |
| C7 | done | `test/card.test.ts`; a Card with `metadata.canonical_sha256` overwritten to `"0000"` fails `colophon card verify` with exit non-zero. |
| C8 | done | `policy/card.rego` + `policy/card_test.rego`; `colophon card lint fixtures/cards/stale.card.json` and `.../high-no-killswitch.card.json` exit non-zero, `colophon card lint cards/<good>.card.json` exits 0. |
| C9 | done | `fixtures/cards/zero-uuid.card.json`; `colophon card validate` on it exits non-zero. |
| C10 | done | `test/agent.test.ts` ("agent run --list-tools returns exactly the Card's granted tools"); `colophon agent run --card <evidence-collector card> --list-tools` prints exactly `fs.read`, `repo.list`, `repo.read_settings`. |
| C11 | done | `policy/gate_test.rego`; `opa eval -d policy/ -i fixtures/gate-input/in-scope.json 'data.colophon.gate.decision'` returns an object with `effect`, `rule_ids`, `reasons`. |
| C12 | done | `opa eval -d policy/ -i fixtures/gate-input/unknown-tool.json 'data.colophon.gate.decision.effect'` → `"deny"`. |
| C13 | done | Same with `fixtures/gate-input/data-class-violation.json` → `"deny"`. |
| C14 | done | Same with `fixtures/gate-input/write-outside-sandbox.json` → `"deny"`. |
| C15 | done | Same with `fixtures/gate-input/scope-expansion.json` → `"deny"`. |
| C16 | done | Same with `fixtures/gate-input/needs-approval.json` → `"escalate"`. |
| C17 | done | `test/agent.test.ts`; `colophon agent run --scenario scenarios/approval-flow.yaml --card <notifier card> --approvals fixtures/approvals/one.json` — first call `allow`, second identical call `escalate`, confirmed in the resulting trace. |
| C18 | done | `test/agent.test.ts` ("an invalid Card denies every call"); `colophon gate serve --card fixtures/cards/zero-uuid.card.json ...` denies every call with `GATE-INVALID-CARD` logged to stderr. |
| C19 | done | Manually reproduced against the real files: patched `policy/gate.rego`'s `unknown_tool` rule to exempt `fs.write`, reran `scenarios/evidence-report.yaml` against evidence-collector's Card — the trace's decision for the `/tmp/gh-token.json` write flips to `"effect":"allow"`; `git diff --stat -- src/` was empty throughout; the patch was reverted before committing. See DECISIONS.md, F9, for a nuance about the CLI's own denial-looking output on that call (the synthetic upstream's unrelated defense-in-depth path guard). |
| C20 | done | `opa test policy/ -v` → `PASS: 29/29`; `opa fmt --diff policy/` → no output, exit 0. |
| C21 | done | `test/agent.test.ts`; `colophon upstream demo --list-tools` includes all 7 named tools. |
| C22 | done | `test/agent.test.ts`; `colophon agent run --scenario scenarios/evidence-report.yaml --card cards/<id>.card.json` exits 0. |
| C23 | done | `test/agent.test.ts`; `grep -rn 'interface LlmDriver' src/` finds `src/agent/driver.ts`, no `class LlmDriver` anywhere; `package.json`'s dependency list contains no LLM provider SDK. |
| C24 | done | `test/agent.test.ts`; the denied tools in `trace/<session>.jsonl` are exactly `auth.request_scopes, fs.write, repo.read_settings, mail.send`; the two in-scope `repo.read_settings` calls plus `repo.list`/`fs.read` are allowed. |
| C25 | done | `test/agent.test.ts`; every decision in `scenarios/compliant-run.yaml`'s trace is `allow`. |
| C26 | done | `test/agent.test.ts`; `scenarios/approval-flow.yaml`'s trace contains both `escalate` and `allow`. |
| C27 | done | `head -1 trace/<s>.jsonl \| jq 'keys'` returns exactly the 12 named fields. |
| C28 | done | `sed -i '3s/allow/deny/' copy.jsonl; colophon trace verify copy.jsonl` exits non-zero, names line 3, reports the hash mismatch. |
| C29 | done | `grep -r "synthetic-gh-token-9f1c2e7a-not-a-real-credential" trace/ out/` → no matches, after running `scenarios/evidence-report.yaml` (which submits that literal string as a `token` argument); `src/util/redact.ts` redacts it in `args_redacted`, and only `args_sha256` (its hash) is stored. |
| C30 | done | `src/evidence/types.ts`'s `Collector` interface; `test/evidence.test.ts`. |
| C31 | done | `bun test --test-name-pattern 'MCPTraceCollector\|CardCollector'` passes. |
| C32 | partial | `src/collectors/aws-provider.ts`'s `LiveAwsProvider` genuinely refuses to construct without `AWS_ACCESS_KEY_ID`/`AWS_PROFILE` (real gating code, not a comment), and is never constructed in `test/`, the demo, or CI — but its three methods throw "not implemented" rather than making real AWS calls, since no AWS SDK dependency is installed and no operator credentials were ever supplied. See DECISIONS.md, F6. |
| C33 | done | `bun test --test-name-pattern 'EvidenceStore'` passes, including the duplicate-id and hash-mismatch cases. |
| C34 | done | `grep -c '^- id:' controls/agent-controls.yaml` → 8. |
| C35 | done | `grep -E 'outside\|sandbox\|scope\|rule_id\|chain\|stale\|approval\|manifest' controls/agent-controls.yaml` matches all eight themes. |
| C36 | partial | `colophon report` validates every document it writes against the vendored OSCAL schema with `validateAgainstDraft07Schema` (plain Ajv + ajv-formats, matching OSCAL's own build tooling) and fails closed if invalid; `ajv validate -s schemas/vendor/oscal_assessment-results_schema-1.1.2.json -d out/demo/*/evidence-report/report/assessment-results.json --spec=draft7 -c ajv-formats` passes. The literal probe (`--spec=draft2020`) cannot succeed against the real vendored schema — it fails to even compile it (`no schema with key or ref "http://json-schema.org/draft-07/schema#"`), a genuine, permanent draft-07/2020-12 tooling mismatch documented in DECISIONS.md (F2, F7), not a defect in the produced document. |
| C37 | done | `bun test --test-name-pattern 'citation'` passes, including a missing-id case that throws `MissingEvidenceCitationError` (`src/report/citations.ts`). |
| C38 | done | `grep -i 'does not prove' out/demo/*/*/report/narrative.md` matches. |
| C39 | done | `colophon report --trace fixtures/traces/breach.jsonl --out out/probe-breach/`; `jq '[.["assessment-results"].results[].findings[] \| select(.target.status.state=="not-satisfied")] \| length'` → 1 (`no-outside-calls`), all other 7 controls satisfied. |
| C40 | done | `out/demo/<run>/evidence-report/` contains `report/`, `evidence/`, `trace/`, `manifest.json`; `jq '.root_hash, (.files\|length)'` on it returns a hash and a nonzero count; running `colophon bundle` again into the same directory exits non-zero (`test/bundle.test.ts`). |
| C41 | done | `test/bundle.test.ts`; appending one byte to `report/narrative.md` in a copy of a bundle makes `colophon bundle verify` exit non-zero and name `report/narrative.md`; an added or removed file is likewise named. |
| C42 | done | `colophon bundle sign <dir> --key cosign.key && colophon bundle verify <dir> --pub cosign.pub` exits 0 (`test/bundle.test.ts`, and manually with a real `cosign generate-key-pair`), fully offline via `fixtures/cosign/offline-signing-config.json` (DECISIONS.md, F8). The CI workflow's separate keyless sign+verify step (`.github/workflows/ci.yml`, "keyless Cosign sign and verify") could not be exercised in this build environment — `cosign sign-blob` with no `--key` starts an interactive OAuth2 flow with no non-interactive fallback outside a real OIDC environment — but it has now been exercised for real: CI run for commit `91dff8ee8d92545c305eb7c48d7da5630353b959` on `main` is green, including that step, using GitHub's own ambient OIDC token. | |
| C43 | done | Verified from a genuinely fresh `git clone` (a separate checkout, not this working tree): `bun install && bun run demo` exits 0 in ~15–16 seconds, prints the summary table, writes only under `out/demo/`, and was also re-verified with `HTTPS_PROXY`/`HTTP_PROXY` pointed at an unreachable address to confirm no network call is made. |
| C44 | done | The same fresh clone: `bun run demo && bun run demo` — both exit 0, into two different `out/demo/<runId>/` directories (`test/demo.test.ts` also covers this in-process). |
| C45 | done | `bun test` → `60 pass, 0 fail`; `bun run typecheck` exits 0 — both re-confirmed from a fresh clone. |
| C46 | done | `.github/workflows/ci.yml` defines exactly the ten required steps (install, typecheck, bun test, opa test, opa fmt --diff, schema validation, bun run demo, colophon bundle verify, keyless Cosign sign and verify, secret scan), runs on push and pull request, and is green on `main`: commit `91dff8ee8d92545c305eb7c48d7da5630353b959`'s CI run succeeded in 1m55s with zero errors (one unrelated informational warning about GitHub's own Node.js 20 deprecation on `actions/checkout@v4`). Getting there surfaced and fixed three real, only-reproducible-in-CI issues along the way — a stale `cosign-installer` action pin that could never install any cosign v3.x release, and two rounds of the secret-scan step correctly flagging real (non-leaked, gitignored, password-protected) Cosign keys generated by the demo and by `test/bundle.test.ts` — all recorded in DECISIONS.md, F9. | |
| C47 | done | `README.md` — a 4-command quickstart (clone, cd, install, `bun run demo`), an "Architecture" section naming five stages, and a "What this proves — and what it does not" section. |
| C48 | done | This document — 50 `C`-numbered rows below the header row, each with a pointer; three spot-checked (C1, C27, C39) resolve to real, currently-passing probes. |
| C49 | done | `SPEC.md` at the repository root, byte-identical to the specification given; `shasum -a 256 SPEC.md` → `10e07085e0e56f210b8f152d7caa45b88a4dfd746bf4b1c027cd6fd812d34796`. |
| C50 | done | `DECISIONS.md` — a dedicated section per feature area (F1–F9), each with multiple recorded decisions, plus an "Operator questions and answers" section recording that no blocking spec ambiguity arose (only an infrastructure access question, itself resolved without operator input). |

## Anti-claims

| Claim | Status | Pointer |
|---|---|---|
| A1 | done | No file under `src/` branches on tool name or argument content to decide `allow`/`deny`; every decision in `src/gate/server.ts` comes from `opaEval(...)` against `policy/gate.rego`. Spot-checked via `grep -rnE '(allow\|deny)' src/` — matches are all type names, field names, or the fixed post-OPA-failure fallback (`GATE-INVALID-CARD`/`OPA-EVAL-ERROR`), never a tool-name/argument-keyed branch. |
| A2 | done | `gitleaks detect --no-git -v --source .`, run against the tree after both `bun test` and `bun run demo` (so it covers the same generated trace/evidence/report/bundle artifacts CI's own "secret scan" step does) → `no leaks found`. `.gitleaks.toml` allowlists exactly the two locations that legitimately hold real, gitignored, password-protected Cosign keys these two commands themselves generate (`out/demo/<run>/keys/`, `test/tmp-bundle/{signed-keys,signed-tampered-keys}/`) while extending, not weakening, gitleaks' default rule set — everything else, including the trace/evidence/report/bundle files, is still scanned. Confirmed green in the real CI run for commit `91dff8ee8d92545c305eb7c48d7da5630353b959` (see C46). |
| A3 | done | `grep -rn 'AWS_' src/ test/ .github/ scenarios/` → the only matches are in `src/collectors/aws-provider.ts`'s `LiveAwsProvider` constructor guard; nothing under `test/`, `.github/`, or `scenarios/` mentions `AWS_*` or constructs `LiveAwsProvider`. |
| A4 | done | `jq -r '(.dependencies + .devDependencies) \| keys[]' package.json` — no entry matches an LLM provider SDK (`openai`, `@anthropic-ai/*`, etc.). |
| A5 | done | `git status --porcelain` after `bun run demo` (from a fresh clone) lists only paths under `out/` and `trace/`. |
