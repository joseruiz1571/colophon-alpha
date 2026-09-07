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

(decisions added as this feature is built)

## F3 · Gate

(decisions added as this feature is built)

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
