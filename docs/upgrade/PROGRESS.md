# PROGRESS — upgrade state (the agent's memory)

Agent: read this first in every phase and update it last. Keep it under about 200 lines. Summarise; don't log.

## Status
- Current phase: 1 done (trust foundation: source registry, provenance on citations)
- Last green gate: phase 1 — backend 415, frontend 357, typecheck, ruff, evals (below_target []), build 147.6 kB gzip. Locale and prettier checks fail at baseline, unchanged by this phase.
- Blockers / waiting on user: the three decisions in "Manual steps for the team", plus confirmation of the six hosts added to the allowlist (item 7)

## Repo map (filled in Phase 0)
| Area | Path(s) | Notes |
|---|---|---|
| Routing / pages | frontend/src/App.tsx; routes/{Home,Sahayak,Analyst,Assessment,WhatIsCovered,HowItWorks,Sources,About,Privacy,Login,NotFound}.tsx | /assess = Analyst (Check My Product); /assess/steps = older form; /design and /audit are dev-only |
| Result, citation, pipeline-status components | components/answer/{AnswerView,ClaimText,SourceCard}.tsx; components/sahayak/{AnswerPanel,RetrievalStatus,Abstention,ContextLine,EscalationForm,SearchElsewhere,StarterQuestions,Composer,QueryFailure}.tsx; components/sourcing/Sourced.tsx; components/analyst/{Findings,Journey,Visuals}.tsx | RetrievalStatus renders real streamed stage events |
| Design tokens | frontend/src/styles/{tokens,structures,fonts}.css; frontend/tailwind.config.ts; docs/BANNED.md | Palm-leaf identity; BANNED.md forbids gradients/glow/idle motion |
| i18n library and locale files | frontend/src/i18n/{index,resources,languages}.ts; frontend/src/locales/{en,hi,te,ta,bn,mr}/ (10 namespaces each); scripts/{i18n-seed,i18n-coverage,i18n-lib}.ts | react-i18next; en first chunk, rest lazy |
| Feature flags | frontend/src/config/features.ts (new); backend/app/core/settings.py `feature_*` (new) | Declared only; nothing reads them yet |
| Auth (including scan-badge login) | backend/app/api/auth.py; backend/app/core/{badge,tokens}.py; routes/Login.tsx; components/auth/{BadgeScanner,AuthField,HeroVideo,AudioControl}.tsx; hooks/{useAuth.tsx,authContext.ts} | Sign-in required for everything; badge compares the QR module pattern; tokens are in-memory (restart signs everyone out) |
| Background video | components/layout/Shell.tsx (app-wide); components/auth/HeroVideo.tsx (sign-in); hooks/useHeroAudio.ts; public/assets/{app-background.mp4,hero.mp4,hero-poster.jpg} | Muted by default with a mute control; no pause-on-hidden yet |
| API routers / endpoints | backend/app/main.py; backend/app/api/{auth,analyst,health,query,classify,sources,records,feedback,privacy}.py | /api/v1/*; query streams NDJSON stage events |
| Pipeline modules | services/{pipeline,routing,retrieval,context,citations,confidence,guardrails,language,translation,audit,records_service,procedures}.py; services/understanding/; retrieval/{store,bm25,rerank,fusion,channels,tokenize,types}.py; llm/{registry,composer,fixture,anthropic_client,prompt,types}.py | One pipeline; 11 stages; composer writes only from packed passages |
| DB models / migrations | SQLite, no migration framework: data/accounts.sqlite3 (api/auth.py), data/analyses.sqlite3 (analyst/store.py), data/audit.sqlite3 (services/audit.py), data/records-samples.sqlite3 (records/store.py); schemas/domain.schema.json via scripts/gen_schema.py | Schema-drift tests on both sides |
| Corpus ingestion | backend/app/corpus/*.py; scripts/{ingest,refresh,build_manifest,build_records_manifest}.py; corpus/{manifest.json,guidance/,products/,records-manifest.json,samples/} | corpus/guidance/ is the live verified corpus; corpus/manifest.json is the planned full-text library (not ingested) |
| Evals runner | backend/app/evals/{runner,cases,score,report}.py; evals/score.py; evals/gold/*.jsonl; evals/reports/report.md; frontend/public/evals-summary.json | 170 cases; publishes to /how-it-works |

## Gate commands and baseline (Phase 0)
| Check | Command | Baseline (pass / fail / skip) |
|---|---|---|
| Backend tests | `cd backend && .venv/Scripts/python.exe -m pytest` | PASS — 398 passed |
| Frontend tests | `cd frontend && npx vitest run` | PASS — 357 passed |
| Typecheck | `cd frontend && npx tsc --noEmit -p .` | PASS |
| Lint | `cd frontend && npx eslint src --quiet`; `cd backend && .venv/Scripts/python.exe -m ruff check . && ruff format --check .` | PASS |
| Locale check | `node scripts/i18n-seed.ts --check`; `node scripts/i18n-coverage.ts` | **FAIL** — seed wants `__untranslated` on hi/{common,home,sahayak} because some values legitimately equal English (brand name), while `i18n.test.ts` requires hi/common to carry no flag. Pre-existing at e5ff7e0. Coverage: en 100%, hi 69%, te/ta/bn/mr 49% |
| Evals | `SAHAYAK_AUDIT_ENABLED=false backend/.venv/Scripts/python.exe evals/score.py --publish` | PASS — 170 cases, below_target [] |
| Build + main JS bundle (gzip KB) | `cd frontend && npm run build && node scripts/check-bundle.ts` | PASS — 147.5 kB gzip initial load (budget 150 kB) |

## Capability coverage
Status: DONE, PARTIAL, MISSING or REMOVED. "Phase" is where it gets built or finished.
| ID | Capability | Phase | Status | Where / notes |
|---|---|---|---|---|
| C1 | Commercial product dataset removed from Check My Product | 3 | MISSING | Still used: corpus/products/products.json (14 fetched face packs) read by analyst/evidence.py, models.py, assess.py, service.py, dialogue.py; UI in analyst/Findings.tsx + services/analyst.ts. **Owner decision needed** — see Manual steps |
| C2 | Product and Formulation Intelligence (new Check My Product) | 3 | PARTIAL | analyst/ gives ingredients, product comparison, TK, prior art, IP options, next steps; no rules-with-evidence classification, no ABS intake, no roadmap seed |
| C3 | Source registry with full metadata, authority levels, review states | 1 | DONE | backend/app/registry/{models,store,hosts,verify}.py over data/registry.sqlite3; 79 records with authority_level 1–5, ReviewState, sha256 and retrieved_at; built by scripts/registry_backfill.py, confirmed by scripts/registry_review.py. Human review of the text itself is still owed (Manual steps 4) |
| C4 | Citation verifier removes unsupported claims | 1 | DONE | services/citations.py `map_citations` drops unverifiable claims; DROP_LIMIT collapses the answer past a third. Phase 1 added the source side: the pipeline drops passages the registry marks uncitable, and an unallowlisted host can never be cited |
| C5 | Jurisdiction router + separate retrieval per jurisdiction | 2 | DONE | services/routing.py; retrieval/store.py `Namespaces` (one store per jurisdiction) |
| C6 | JurisdictionConflictEngine + Conflict objects | 2 | PARTIAL | services/retrieval.py `find_contradictions` (conflicts_with / superseded_by pairs) + SOURCES_CONFLICT abstention; no Conflict object, conflict_type or resolution_status |
| C7 | Product classification engine (rules + evidence) | 2 | PARTIAL | services/classification/{__init__.py,graph.json} decision graph + api/classify.py; graph holds no evidence_source_ids/required_facts/changes_if |
| C8 | Biodiversity / ABS decision support | 3 | PARTIAL | api/classify.py `abs-check` + components/flows/AbsFlow.tsx + verified ABS passages in corpus/guidance |
| C9 | Confidence by issue, factor-based, with reasons | 2 | PARTIAL | services/confidence.py — per answer, not per issue; reasons as keys, no percentages (matches the rule) |
| C10 | Abstention taxonomy (9 codes) | 2 | PARTIAL | 5 AbstainReason values + 7 guardrail refusal kinds; not the 9 named codes |
| C11 | Guidance vs advice safety layer + notice + phrase filter | 2 | PARTIAL | guardrails.py refuses verdict/clinical/drafting/concealment; "Information, not legal advice" pill + source note; no post-generation blocked-phrase filter |
| C12 | Escalation levels + Case Brief (print, copy, export) | 2, 4 | PARTIAL | components/sahayak/EscalationForm.tsx + api/feedback.py `escalate`; no L0–L3 levels, no Case Brief |
| C13 | Flagship complex case + Jury Demo on the real pipeline | 4 | MISSING | — |
| C14 | Conflict matrix + source comparison matrix UI | 4 | MISSING | — |
| C15 | Provenance explorer ("Why am I seeing this?") | 4 | PARTIAL | SourceCard (document, organisation, section, passage reveal, official link) inside a Drawer; no authority level, dates or verification result |
| C16 | Answer Receipt | 1, 4 | PARTIAL | Answer carries corpus_version, as_of_date, confidence, stage timings; each citation now carries review_state, reviewed_at and provenance_pending, and the source card shows the pending badge. Dropped claims still counted in the audit row but not shown; no single receipt view yet (Phase 4) |
| C17 | Real pipeline activity events in UI | 2, 4 | DONE | pipeline streams stage events; components/sahayak/RetrievalStatus.tsx renders real timings |
| C18 | "In short" summaries + Simple/Expert view | 5 | MISSING | — |
| C19 | Guided intake + glossary | 5 | PARTIAL | Analyst asks one question at a time; /assess/steps stepper exists; no glossary |
| C20 | i18n: Indian languages | 6 | PARTIAL | 6 locales; hi 69%, te/ta/bn/mr 49%, flagged `__untranslated` |
| C21 | i18n: international languages + RTL | 6 | MISSING | No RTL handling anywhere |
| C22 | Case Workspace (save, resume, update, re-run, archive, delete, change reasons) | 7 | PARTIAL | analyst conversations save/resume/delete per account (analyst/store.py, data/analyses.sqlite3); no archive, roadmap or change reasons |
| C23 | Compliance Roadmap | 7 | MISSING | analyst `next_steps` are reason codes, not tasks |
| C24 | Ask Sahayak case-aware upgrade (evidence cards, badges) | 7 | MISSING | Ask has no case link |
| C25 | Feedback signal | 7 | PARTIAL | api/feedback.py exists; no UI |
| C26 | Voice Sahayak | 8 | MISSING | — |
| C27 | Helpline simulator + telephony adapter interface | 8 | MISSING | — |
| C28 | Admin Insight Dashboard + Knowledge Gap Monitor | 9 | MISSING | Dev-only /audit viewer (routes/AuditLog.tsx, api/privacy.py) |
| C29 | Source Health / Regulatory Change Monitor | 9 | PARTIAL | scripts/refresh.py re-fetches and reports drift; no states, queue or admin approval |
| C30 | Prior-Art Search Builder | 3 | PARTIAL | components/flows/PriorArtFlow.tsx builds terms + registry links; no IPC/CPC, no validated botanical list |
| C31 | IP Protection Map | 3, 4 | PARTIAL | analyst ip_options covers all six rights with relevance + reasons; no map UI |
| C32 | Document Intelligence | 9 | MISSING | No upload path anywhere |
| C33 | Scan-badge off primary sign-in; public Ask without login | 5 | BLOCKED | Owner: the login page is not to be disturbed. Flag `scanBadgeLogin` ships **true**. Public Ask needs a separate decision |
| C34 | Patent timeline demoted to "Learn" | 5 | MISSING | 15-step timeline sits on Home (components/home/PatentTimeline.tsx) |
| C35 | Security review items | 10 | MISSING | docs/SECURITY.md has the threat model only |
| C36 | Eval set A–H + multilingual evals | 2, 6 | PARTIAL | 170 cases grouped india/international/cross-border/multilingual/records/unanswerable; not the A–H classes |
| C37 | Background video accessibility and performance | 5 | PARTIAL | hooks/useReducedMotion.ts exists; no pause-on-hidden, no Save-Data skip |

## KEEP / MODIFY / REMOVE / ADD (Phase 0)
- KEEP: palm-leaf design system and tokens; the 11-stage pipeline and its streamed events; jurisdiction separation; citation verification; corpus/guidance (51 verified sources, 76 passages, TKDL public data); evals harness; sign-in exactly as it is, badge scanner included.
- MODIFY: source registry → authority levels, review states, hashes (C3); confidence → per issue (C9); abstention → 9 codes (C10); conflicts → Conflict objects (C6); classification graph → rules with evidence ids (C7); Home ordering and the patent timeline's placement (C34, owner to confirm).
- REMOVE (only after the owner decides): commercial product dataset and "closest product" comparison (C1). Nothing else is slated for removal; the demo account in api/auth.py is a separate decision.
- ADD: flagship case + jury demo (C13), conflict/source matrices (C14), provenance drawer fields (C15), Answer Receipt surface (C16), In short + Simple/Expert (C18), glossary (C19), RTL and more languages (C21), workspace + roadmap (C22, C23), voice + helpline (C26, C27), admin insight + source health states (C28, C29), document intelligence (C32).

## Registry summary (Phase 1+)
- Registry version `registry-0d9148eee8d1`, 79 records, 51 citable.
- By review_state: verified_official 43 (fetched from the official host and hashed), needs_review 8, unverified 28 (the corpus/manifest.json library, no URL, not citable).
- The 8 needing review are the TKDL pages (`in-tkdl*`). The host refuses connections from this machine, so they keep `legacy_allowed`: still citable, marked "provenance pending review" on the source card, and they hold that answer below high confidence. No human review has been recorded for any source yet.
- Missing official sources: everything in SOURCES_TO_VERIFY.md that is not one of the 51 — notably full statute text for trade marks, designs, GI and copyright; Drugs Rules Schedule T and First Schedule text; the currently notified NBA ABS regulations; WIPO GRATK party status with a checked date.

## Manual steps for the team
1. **Decide C1.** Phase 3 says delete the commercial product dataset. It is 14 real, source-dated product pages that Check My Product compares against, and the owner previously asked for Check My Product not to be changed. Keep, or remove?
2. **Decide on competition names.** AGENTS.md rule 8 forbids naming any competition anywhere in the repo; the upgrade pack names SIH 2026 / SIH26045 / TATTVA X in .agents/ and docs/upgrade/. Current reading: keep them out of the product (UI, README, metadata), allow them in internal upgrade docs. Confirm.
3. **Decide on the demo account** (`demo` / `demo1234`, backend/app/api/auth.py). It still works; only the hint that advertised it was removed.
4. Human-review the key legal sources: `python scripts/registry_review.py --pending` lists the 43 fetched sources; approve each after reading it against the official original (`--approve <id> --by "Your name"`). None approved so far.
5. Review the Hindi and Telugu interface text (Tier 1, Phase 6).
6. Put an LLM API key in backend/.env if the Phase 6 translation script should draft the other languages.
7. **Confirm six hosts added to the citation allowlist in Phase 1**: ipindiaonline.gov.in, nbaindia.in, nbaindia.nic.in, cdsco.gov.in, ayushportal.nic.in, s3waas.gov.in. Each serves an official portal already cited by the corpus; they are listed in SOURCES_TO_VERIFY.md.
8. Re-check the TKDL pages from a network that can reach tkdl.res.in, then re-run the backfill so those 8 records stop reporting pending provenance.

## Decisions log (one line each)
- 2026-09-23: Baseline committed as c36c79d before Phase 0, so every later phase can roll back.
- 2026-09-23: Login page is not to be disturbed (owner). `scanBadgeLogin` ships true, departing from Phase 5's suggested default; C33 is BLOCKED until the owner says otherwise.
- 2026-09-23: PROMPT.md was already removed in c36c79d as a byte-identical copy of AGENTS.md; a copy is archived at docs/upgrade/archive/PROMPT.md. docs/MASTER_BUILD.md and docs/REVIEW_GATE.md moved to the same archive and their two references repointed.
- 2026-09-23: AGENTS.md is kept as the repo's own brief. One clause is obsolete — its "Mock vs real" section requires *.mock.ts fixtures and "Illustrative example" chips, which c36c79d removed in favour of verified sources. Treat ip-sakti-core.md as controlling.
- 2026-09-23: Locale check fails at baseline (pre-existing conflict between scripts/i18n-seed.ts and i18n.test.ts). Not fixed in Phase 0, which changes no behaviour; fix it in Phase 6 or earlier if it blocks a gate.

- 2026-09-24: Verification means only "these bytes came from this official URL, hashed at this time". It is deliberately separate from human review of whether the passages report the document correctly, which only `registry_review.py --approve` records.
- 2026-09-24: A source on an unreachable but plainly official host stays citable with `legacy_allowed` rather than disappearing — it is marked pending and capped at moderate confidence. A source on a host nobody allowlisted is never citable, whatever it claims to be.
- 2026-09-24: The pipeline treats an empty registry as "not built here" and cites the corpus as before, so a machine without data/registry.sqlite3 still answers instead of silently abstaining.
- 2026-09-24: data/registry.sqlite3 is committed (96 KB), unlike the other sqlite files in data/, which are user or run data. It is a fact table about official documents, so a clone and the Render deploy show the same provenance rather than silently showing none.
- 2026-09-24: `prettier --check` fails on 77 files at baseline (proven by stashing the phase's own changes). Left alone rather than reformatting files this phase did not touch.

## Top 5 risks
1. **Auth coupling.** Sign-in guards every route and tokens live in memory, so any API restart signs everyone out — awkward mid-demo, and it makes "public Ask" (C33) a real change rather than a flag flip.
2. **Schema drift.** Analyst models (backend/app/analyst/models.py ↔ frontend/src/services/analyst.ts) are hand-mirrored and not covered by the generated schema check that protects the core domain model.
3. **Retrieval is lexical only.** The dense channel reports itself unavailable; recall depends on the topic tags in corpus/guidance, so new passages need tags or they will not be found.
4. **Locale debt.** Four locales sit at 49% and the locale gate already fails; adding 12+ languages (Phase 6) on top of that will make the gate noisy unless the seed/test conflict is fixed first.
5. **Corpus freshness.** The 51 verified sources are pinned to a review date; an amendment (or an IP India URL change) silently makes an answer stale until someone re-checks. Phase 9's source health monitor is the mitigation.

## Handoff to next phase
### Phase 1
- Done: source registry (SourceRecord, ReviewState, authority levels 1–5, sha256 provenance) in backend/app/registry/; backfill and review CLIs; 79 records registered and 43 fetched from official hosts; citations carry review_state/reviewed_at/provenance_pending; the source card shows a pending badge in all six languages; confidence caps at moderate with reason `moderateProvenancePending`; /api/v1/corpus-version reports registry_version, citable_sources and sources_by_review_state; 17 new tests (T2, T3, T4, T9, T15, injection) in backend/tests/test_registry.py.
- Not done / carried over: no source has been human-reviewed yet; the 8 TKDL records still report pending provenance; the corpus/manifest.json library stays unverified and uncitable; the locale and prettier gates still fail at baseline.
- Next phase should first: read PHASE_02, and note that authority levels now exist on every record — the jurisdiction/authority work can rank on `SourceRecord.outranks` rather than inventing a second ordering.

### Phase 0
- Done: pack installed (.agents/rules, .agents/workflows, docs/upgrade/*, 11 phase files); old specs archived; repo map, baseline and C1–C37 coverage filled; feature-flag module added on both sides with no behaviour change; risks and decisions recorded.
- Not done / carried over: the three owner decisions above; the failing locale gate; nothing else was touched (no feature code in Phase 0).
- Next phase should first: read this file, then PHASE_01_trust_foundation.md, and extend `corpus/guidance/sources.json` into the SourceRecord table rather than building a second registry — C4 (citation verifier) is already DONE, so Phase 1 is mostly registry fields, review states, hashes and the backfill/review scripts.
