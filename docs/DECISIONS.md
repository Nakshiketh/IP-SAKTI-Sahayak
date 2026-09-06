# Decisions

Append an entry every phase. Each records what was chosen, what it was chosen over, and why —
so the reasoning survives past the moment it was obvious.

Format: `## [phase] title` · **Decision** · **Alternatives** · **Why** · **Revisit when**.

---

## [0] The domain model is defined twice, and a test enforces that

**Decision.** The model lives in `backend/app/models/domain.py` (Pydantic) and
`frontend/src/types/domain.ts` (TypeScript). Neither generates the other. Both are checked
against `schemas/domain.schema.json`, which *is* generated, from the Pydantic side, by
`scripts/gen_schema.py`. Two tests close the loop: `backend/tests/test_schema_drift.py` fails if
the checked-in schema is stale, and `frontend/src/types/domain.test.ts` fails if the TypeScript
constants no longer match it.

**Alternatives.** Generate TypeScript from the schema at build time
(`json-schema-to-typescript`); or use a codegen tool over the OpenAPI document.

**Why.** Generated types are read-only artefacts — you cannot attach the domain comments that
carry the product rules ("registry data is evidence, never authority"), and a build step that
must run before typecheck is a step that gets skipped. Hand-written types with a failing test are
as safe and stay readable. The test was verified by injecting a drift into the Python enum and
confirming both suites go red.

**Revisit when.** The model grows past roughly thirty types, or a third consumer appears.

---

## [0] `Record.citable_in_answers` is typed `Literal[False]`, not `bool`

**Decision.** The field cannot hold `True`. Constructing a `Record` with `citable_in_answers=True`
is a validation error; the generated schema carries `"const": false`; the TypeScript field is
typed `false`, so a record cannot be passed where a `Citation` is expected.

**Alternatives.** A `bool` defaulting to `False`, with the rule enforced in the orchestrator.

**Why.** Product rule 7 says registry data is never authority. A rule enforced only in
orchestration code is one refactor away from being lost. Typing it out of existence means the rule
holds even in code nobody has written yet. This is the same reasoning Phase 12 applies when it
says "enforce in code, not in a prompt".

**Revisit when.** Never, unless the two-layer distinction itself changes.

---

## [0] `abstain_reason` is an enum; the four abstention states are typed

**Decision.** `AbstainReason` enumerates `nothing_relevant`, `out_of_scope`, `sources_conflict`,
`sources_out_of_date`, `needs_more_facts`. The build document lists `abstain_reason` untyped;
Phase 8 specifies four distinct abstention states with different UI and different user offers.

**Alternatives.** A free-text string.

**Why.** Phase 13 measures abstention precision and recall. You cannot score a free-text field,
and the four states each need a different surface. `sources_conflict` and `sources_out_of_date`
are split because Phase 8 state 3 covers both and they read differently to a user.

**Revisit when.** Phase 8, if a fifth state appears in practice.

---

## [0] Python 3.11 in a committed-recipe virtualenv; no lockfile yet

**Decision.** `backend/.venv` built with Python 3.11.9. Dependency ranges live in
`backend/pyproject.toml`; frontend versions in `frontend/package.json` with `package-lock.json`
committed.

**Alternatives.** Poetry or uv with a Python lockfile; Docker from Phase 0.

**Why.** The build document names Python 3.11 and the retrieval stack (FAISS, sentence
transformers) has the fewest surprises there. A Python lockfile is worth adding at Phase 11 when
the dependency set stops being four packages and starts including native wheels.

**Revisit when.** Phase 11, when the ingestion dependencies land.

---

## [0] `make` targets for unbuilt phases fail loudly rather than no-op

**Decision.** `make ingest`, `make ingest-records` and `make evals` print which phase builds them
and exit non-zero.

**Alternatives.** Omit the targets until the phase; or have them succeed silently.

**Why.** A target that exits 0 having done nothing is indistinguishable from a working pipeline in
CI, and eventually someone demos on the strength of it. The same principle as abstention: say
plainly that there is nothing here.

**Revisit when.** Phases 11, 12 and 13 respectively.

---

## [0] GNU make is not installed on the development machine

**Decision.** The `Makefile` is authoritative. `make.ps1` mirrors every target for Windows
machines without make, and is what was actually used to verify Phase 0.

**Alternatives.** Require make via winget/chocolatey; use npm scripts as the top-level runner.

**Why.** The build document specifies a Makefile and CI will have make. Requiring a toolchain
install before the first test run is friction for no gain when a fifty-line script does the job.
Both files must be updated together — if they drift, the Makefile wins.

**Revisit when.** CI is set up, or the target list grows enough that keeping two runners in sync
becomes the larger cost.
