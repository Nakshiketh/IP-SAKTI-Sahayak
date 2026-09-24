# PROGRESS — upgrade state (the agent's memory)

Agent: read this first in every phase and update it last. Keep it under about 200 lines. Summarise; don't log.

## Status
- Current phase: 4 part one done (multi-part retrieval, jury demo entry, where guidance ends, conflict matrix). Part two not started: provenance drawer, Answer Receipt, IP Protection Map UI, Case Brief.
- Last green gate: phase 4a — backend 505, frontend 380, typecheck, eslint, ruff, evals (below_target []), build **149 kB of a 150 kB budget**. Locale and prettier checks still fail at baseline.
- **Bundle warning**: 1 kB of headroom left. Phase 4 part two adds four more surfaces; it must lazy-load them or reclaim space first, or the budget check will fail.
- Note on running the frontend suite: all 26 files pass, but running them in one parallel batch on a loaded machine produces route-render timeouts that look like failures. Run `src/routes`, then the rest, then `src/i18n` and `src/App.test.tsx`, if the machine is busy.
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
| C1 | Commercial product dataset removed from Check My Product | 3 | RESOLVED DIFFERENTLY | Owner decided 2026-09-24: keep the 14 products as an ingredient reference, remove the novelty verdict they fed. The three-state indicator is now match_in_public_sources / related_material_found / nothing_found_in_sources_searched, the requirement status says "match found in the sources searched" rather than "novelty at risk", and the overlap labels say how many ingredients are shared. A test forbids the old wording returning |
| C2 | Product and Formulation Intelligence (new Check My Product) | 3 | DONE | analyst/intelligence.py assembles the shared Phase 2 classification (analyst/facts_bridge.py), ABS support (analyst/abs.py), the prior-art search builder (analyst/searches.py), the IP protection map and the roadmap seed (analyst/protection.py), and carries them on every Analysis |
| C3 | Source registry with full metadata, authority levels, review states | 1 | DONE | backend/app/registry/{models,store,hosts,verify}.py over data/registry.sqlite3; 79 records with authority_level 1–5, ReviewState, sha256 and retrieved_at; built by scripts/registry_backfill.py, confirmed by scripts/registry_review.py. Human review of the text itself is still owed (Manual steps 4) |
| C4 | Citation verifier removes unsupported claims | 1 | DONE | services/citations.py `map_citations` drops unverifiable claims; DROP_LIMIT collapses the answer past a third. Phase 1 added the source side: the pipeline drops passages the registry marks uncitable, and an unallowlisted host can never be cited |
| C5 | Jurisdiction router + separate retrieval per jurisdiction | 2 | DONE | services/routing.py; retrieval/store.py `Namespaces` (one store per jurisdiction) |
| C6 | JurisdictionConflictEngine + Conflict objects | 2 | DONE | reasoning/conflicts.py: typed Conflict with all seven conflict_types and their resolution_status, decided from jurisdiction, supersession, effective dates, authority level and which rules fired — never from wording |
| C7 | Product classification engine (rules + evidence) | 2 | DONE | data/rules/classification_rules.yaml (7 rules with required_facts, evidence_source_ids, changes_if) + reasoning/{facts,classify}.py. A rule whose evidence is not citable and in the corpus is inactive. The older /classify decision graph still serves its own flow |
| C8 | Biodiversity / ABS decision support | 3 | DONE | analyst/abs.py asks seven material questions and no others, reports relevance as likely/possible/not_indicated (never "required"), names a source or a portal only when the registry holds it as citable, and sets requires_human_review wherever the answer turns on a definition in the Act |
| C9 | Confidence by issue, factor-based, with reasons | 2 | DONE | reasoning/confidence.py over data/rules/confidence.yaml: per issue, four step-down factors and three caps, reasons as keys. The answer-level rule in services/confidence.py is unchanged, so its TypeScript mirror and pinned cases still hold |
| C10 | Abstention taxonomy (9 codes) | 2 | DONE | AbstainCode in models/domain.py; reasoning/engine.py maps the 5 older reasons and the 7 refusal kinds onto it, so both surfaces agree without changing the pinned older rule |
| C11 | Guidance vs advice safety layer + notice + phrase filter | 2 | DONE | reasoning/phrases.py runs inside map_citations: a promise with a neutral form is rewritten, one without is dropped like an unsupported claim. Plus the existing guardrails and notices |
| C12 | Escalation levels + Case Brief (print, copy, export) | 2, 4 | PARTIAL | reasoning/escalation.py decides L0–L3; components/answer/GuidanceEnds.tsx renders it as a four-step stepper with what we can say, what we cannot conclude and who should review. Case Brief is part two |
| C13 | Flagship complex case + Jury Demo on the real pipeline | 4 | PARTIAL | data/demo/flagship_case.json seeded; GET /api/v1/demo/flagship-case serves the question only, behind `feature_jury_demo`; components/home/JuryDemo.tsx fetches it and asks it through the ordinary route. The case now answers with real sources (see below). Talk-track items beyond the matrix are part two |
| C14 | Conflict matrix + source comparison matrix UI | 4 | PARTIAL | components/answer/ConflictMatrix.tsx: table on wide screens, stacked cards on a phone, with the resolution stated rather than implied. The source comparison matrix is part two |
| C15 | Provenance explorer ("Why am I seeing this?") | 4 | PARTIAL | SourceCard (document, organisation, section, passage reveal, official link) inside a Drawer; no authority level, dates or verification result |
| C16 | Answer Receipt | 1, 4 | PARTIAL | Answer carries corpus_version, as_of_date, confidence, stage timings; each citation now carries review_state, reviewed_at and provenance_pending, and the source card shows the pending badge. Dropped claims still counted in the audit row but not shown; no single receipt view yet (Phase 4) |
| C17 | Real pipeline activity events in UI | 2, 4 | DONE | pipeline streams stage events; components/sahayak/RetrievalStatus.tsx renders real timings |
| C18 | "In short" summaries + Simple/Expert view | 5 | MISSING | — |
| C19 | Guided intake + glossary | 5 | PARTIAL | Analyst asks one question at a time; /assess/steps stepper exists; no glossary |
| C20 | i18n: Indian languages | 6 | PARTIAL | 6 locales; hi 69%, te/ta/bn/mr 49%, flagged `__untranslated` |
| C21 | i18n: international languages + RTL | 6 | MISSING | No RTL handling anywhere |
| C22 | Case Workspace (save, resume, update, re-run, archive, delete, change reasons) | 7 | PARTIAL | analyst conversations save/resume/delete per account (analyst/store.py, data/analyses.sqlite3); no archive, roadmap or change reasons |
| C23 | Compliance Roadmap | 7 | PARTIAL | analyst/protection.py `roadmap_seed` gives ordered tasks (now / before_filing / before_sale), each marked when it exists only because something is unknown, so the list shrinks as questions are answered. The workspace around it is Phase 7 |
| C24 | Ask Sahayak case-aware upgrade (evidence cards, badges) | 7 | MISSING | Ask has no case link |
| C25 | Feedback signal | 7 | PARTIAL | api/feedback.py exists; no UI |
| C26 | Voice Sahayak | 8 | MISSING | — |
| C27 | Helpline simulator + telephony adapter interface | 8 | MISSING | — |
| C28 | Admin Insight Dashboard + Knowledge Gap Monitor | 9 | MISSING | Dev-only /audit viewer (routes/AuditLog.tsx, api/privacy.py) |
| C29 | Source Health / Regulatory Change Monitor | 9 | PARTIAL | scripts/refresh.py re-fetches and reports drift; no states, queue or admin approval |
| C30 | Prior-Art Search Builder | 3 | DONE | analyst/searches.py builds the terms and the query string, offers a search page only when its source is citable, and validates botanical names against the stored vocabulary — an unknown name is offered as written and marked unvalidated. No IPC/CPC: the official IPC publication is not in this repo, and a guessed code searches the wrong branch. The banner is on every strategy |
| C31 | IP Protection Map | 3, 4 | PARTIAL | analyst/protection.py gives all six rights four states — the fourth, needs_more_information, is the one that matters — with why, the facts that would settle it, citable sources and one next step. Map UI is Phase 4 |
| C32 | Document Intelligence | 9 | MISSING | No upload path anywhere |
| C33 | Scan-badge off primary sign-in; public Ask without login | 5 | BLOCKED | Owner: the login page is not to be disturbed. Flag `scanBadgeLogin` ships **true**. Public Ask needs a separate decision |
| C34 | Patent timeline demoted to "Learn" | 5 | MISSING | 15-step timeline sits on Home (components/home/PatentTimeline.tsx) |
| C35 | Security review items | 10 | MISSING | docs/SECURITY.md has the threat model only |
| C36 | Eval set A–H + multilingual evals | 2, 6 | PARTIAL | A–H built as structural assertions over the real pipeline in backend/tests/test_reasoning_cases.py rather than as gold rows, because the gold harness scores metrics and these assert shape. The 170-case gold set is unchanged; multilingual evals are Phase 6 |
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

## Flagship case run (Phase 2)
Input: `data/demo/flagship_case.json`, through the real pipeline on 2026-09-24. Two answers, India and International, never merged.
- **Facts stated**: external_use false (oral), going_abroad true. Everything the question hedges — "may already be documented in classical texts", "know whether it is a classical drug ... or an Ayurveda Aahara product" — states nothing, so it surfaces as missing rather than as fact.
- **Missing facts**: classical_text_formulation, therapeutic_claim, purified_extract, food_form. Exactly the four FLAGSHIP_CASE.md says must appear.
- **Issues indicated**: patent (moderate), traditional knowledge (low in IN, moderate in INTL), biodiversity/ABS (moderate).
- **Not indicated**: trade mark, design, GI, copyright, trade secret, drug regulation, food regulation — the over-reach check this case exists to make.
- **Conflicts by type**: jurisdictional → separate_obligations; missing_fact → unresolved, requires_human_review.
- **Escalation**: L3 on both sides. Reasons escalationMissingFacts / escalationLowConfidenceIssue / escalationProfessionalRequired; specialists registered_patent_agent, traditional_knowledge_expert, plus biodiversity_abs_consultant internationally.
- **Sources used: none.** The answer-level rule abstains on this input — seven sub-questions in one, and nothing clears the rerank floor for it. The reasoning above is still produced and reported. Answering it section by section is Phase 4 work, and is the main open risk for the jury demo.
- Conflict examples 2, 5 and 6 from FLAGSHIP_CASE.md (BD Act before/after 2023, WIPO GRATK status, Rule 170) did not appear: the corpus records no supersession or `conflicts_with` pair for them, and this engine will not infer one from wording. They need ingestion to record the relationship first.

## The flagship case, after Phase 4 part one
Run on 2026-09-24 through the real pipeline, both jurisdictions.

**What changed.** The case used to abstain with no sources at all. Retrieval scored every passage against all seven of its sub-questions at once, so the best passage in the corpus came out at 0.18 against a floor of 0.35 — while the same corpus scored 0.75 when one part was asked alone. `app/services/parts.py` now splits an explicitly enumerated question and retrieves for each part, merging on best score. Nothing else about the answer changed: same passages, same citation verification, same confidence rule.

| Acceptance (FLAGSHIP_CASE.md §5) | Result |
|---|---|
| Real call, no stored answer | PASS — the endpoint returns id, language, question and nothing else; a test asserts it |
| ≥2 classification candidates | PASS (India) — five categories still open, with the four facts that would choose between them. The international analysis offers none, correctly: the classification rules are Indian and its corpus holds none of them |
| India and international separate | PASS — two analyses, each citing only its own jurisdiction |
| ≥1 conflict, separate_obligations | PASS — both sides |
| Conflict source IDs exist in the registry | PASS — `in-patents-act-1970` ↔ `intl-nagoya-protocol` (India), `intl-absch` ↔ `in-patents-act-1970` (international). The other jurisdiction is searched only for the identity of its leading document; its passages never enter this answer |
| No blocked verdict phrases | PASS |
| Escalation ≥ L2 | PASS — L3 both sides |
| Answer Receipt with corpus version and review dates | NOT BUILT — part two |

**Output**: India, moderate confidence, 30 citations across 8+ official documents; international, high confidence, 5 citations. Conflicts: jurisdictional → separate obligations, missing_fact → unresolved and needing a person. Escalation L3, specialists: registered patent agent, traditional-knowledge specialist, and the ABS consultant internationally.

**Screenshots owed.** The gate asks for a manual browser run at 1280px and 360px saved to docs/upgrade/screens/phase4/. Not done: the dev servers were stopped by the OS under memory pressure earlier in the session and the owner asked that they not be restarted unprompted.

## Check My Product, after Phase 3
- The 14-product dataset stays, by the owner's decision, and keeps its own honesty: `verification: retrieved_not_reviewed` and a scope note saying finding nothing there says nothing about what else is sold. A test asserts both.
- What was removed is the verdict it fed. Ask Sahayak refuses novelty verdicts (`RefusalKind.NOVELTY_VERDICT`) while Check My Product was printing "Potentially novel" and "Close match found — novelty at risk", from a comparison against face packs. The two halves now agree.
- Classification comes from the same `data/rules/classification_rules.yaml` as Ask, through `analyst/facts_bridge.py`: structured fields are authoritative, and the free-text fields fill only the gaps they leave. With no backed evidence in the corpus, nothing is classified.
- A declined question ("I don't know", "skip") becomes a missing fact carrying the question, distinct from a fact nobody asked about.
- The input form in the pack (§2) was not built as a new form. The analyst is conversational and asks one question at a time, and the owner asked that the Check My Product UI not be changed without cause; the substance — every field optional, "I don't know" on each, a decline becoming a missing fact — is in the conversation already.

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
- 2026-09-24: A question is split only on explicit enumeration — "(1)…(2)…", "1.…2.…", or several sentences each ending in a question mark. Guessing that prose contains two questions would split one question on an "and" and score both halves against the wrong thing.
- 2026-09-24: The stem of an enumerated question is kept as context but never searched on. Prefixing sixty words of background to each part would reintroduce exactly the dilution the split removes.
- 2026-09-24: The classifier reports candidates — categories no stated fact has ruled out — when no rule fires. "You are one of these, and this is what decides it" is more useful and no less honest than "undetermined".
- 2026-09-24: The demo endpoint returns the question only, and reads just three fields from the seed file, so a stored answer added to that file could never reach the interface.
- 2026-09-24: `src/components/layout/backdrop.test.tsx` fails on a loaded machine and passes otherwise. Proven pre-existing by reverting all of frontend/src to the previous commit and seeing the same failure. It waits on a lazily loaded route.
- 2026-09-24: C1 resolved by the owner as "drop the verdict, keep the data". The dataset is real and honestly labelled; the indicator built on it was a novelty view the rest of the product refuses to give.
- 2026-09-24: Check My Product calls `app.reasoning.analyse` with `known_facts` rather than growing a second classifier, so the product half and the question half cannot disagree about what a product is.
- 2026-09-24: No IPC or CPC hints are produced. The official IPC publication is not in this repo, and a guessed classification code sends someone searching a branch their invention is not in.
- 2026-09-24: Phase 2 extends the existing streaming pipeline instead of adding the pack's second `run_pipeline` and `POST /api/analyze`. One pipeline, one set of stage events, nothing to drift; the reasoning is a stage inside it. Owner approved.
- 2026-09-24: Per-issue confidence sits beside the answer-level rule rather than replacing it, so the TypeScript mirror and evals/confidence-cases.json keep holding. Owner approved.
- 2026-09-24: Facts are extracted deterministically, with no model. A model would read more from free prose and could also read in a fact nobody stated, and a fabricated fact decides the regulatory category the whole answer rests on.
- 2026-09-24: A hedged clause states nothing. The flagship run caught the extractor reading "know whether it is ... an Ayurveda Aahara product" as a fact and raising food regulation off the reader's own list of options; hedge markers now suppress the clause and the fact is reported missing.
- 2026-09-24: `phytopharmaceutical` had been made to require a therapeutic claim. Rule 2(eb) defines it by what the substance is, not by a claim made for it, so that requirement was removed as an invention on top of the passage.
- 2026-09-24: The Answer's product_class now prefers what the reader stated, then what the rules decided, then the composer's reading. classification_accuracy in the evals moved 0% → 50%; the rest are questions stating no facts about the asker's own product, and two Marathi/Tamil cases the English-only fact lexicon cannot read.
- 2026-09-24: data/registry.sqlite3 is committed (96 KB), unlike the other sqlite files in data/, which are user or run data. It is a fact table about official documents, so a clone and the Render deploy show the same provenance rather than silently showing none.
- 2026-09-24: `prettier --check` fails on 77 files at baseline (proven by stashing the phase's own changes). Left alone rather than reformatting files this phase did not touch.

## Top 5 risks
1. **Auth coupling.** Sign-in guards every route and tokens live in memory, so any API restart signs everyone out — awkward mid-demo, and it makes "public Ask" (C33) a real change rather than a flag flip.
2. **Schema drift.** Analyst models (backend/app/analyst/models.py ↔ frontend/src/services/analyst.ts) are hand-mirrored and not covered by the generated schema check that protects the core domain model.
3. **Retrieval is lexical only.** The dense channel reports itself unavailable; recall depends on the topic tags in corpus/guidance, so new passages need tags or they will not be found.
4. **Locale debt.** Four locales sit at 49% and the locale gate already fails; adding 12+ languages (Phase 6) on top of that will make the gate noisy unless the seed/test conflict is fixed first.
5. **Corpus freshness.** The 51 verified sources are pinned to a review date; an amendment (or an IP India URL change) silently makes an answer stale until someone re-checks. Phase 9's source health monitor is the mitigation.

## Handoff to next phase
### Phase 4, part one
- Done: multi-part question splitting and per-part retrieval (`app/services/parts.py`), which is what makes the flagship case answerable at all; classification candidates; jurisdictional conflicts naming real registry documents on both sides; `GET /api/v1/demo/flagship-case` behind the `juryDemo` flag; the Jury Demo entry on Home; "Where guidance ends" with the L0–L3 stepper; the conflict and overlap matrix. 25 new tests (16 backend including T11, 9 frontend).
- Not done / carried over: provenance drawer, Answer Receipt, IP Protection Map UI, Case Brief page and its print stylesheet; the source comparison matrix; the browser screenshots. The five non-English locales carry the new strings in English behind `__untranslated`, as the repo already does elsewhere — Phase 6 owes the translations.
- Next phase should first: check the bundle. There is 1 kB of headroom and four surfaces still to add, so part two starts by lazy-loading the new answer sections or reclaiming space, not by writing more components.

### Phase 3
- Done: the novelty verdict removed from Check My Product across backend, UI and six locales; `analyst/intelligence.py` assembling shared classification, ABS support, prior-art search builder, IP protection map and roadmap seed onto every Analysis; 25 new tests.
- Not done / carried over: no UI reads `Analysis.intelligence` yet — the reason keys and section labels it produces have no locale strings, and the map, matrix and roadmap surfaces are Phase 4 and Phase 7. The pack's separate product input form was deliberately not built (see above).
- Next phase should first: read PHASE_04, and note that both halves now produce reason keys with no translations — Phase 4 is the first phase where that debt is visible to a reader, so budget for the locale work rather than discovering it late.

### Phase 2
- Done: the reasoning stage (`backend/app/reasoning/`) runs inside the pipeline as the `reason` stage — deterministic fact extraction with negation and hedging, rules-driven classification whose rules switch themselves off without backed evidence, an issue classifier that says "not indicated" rather than staying silent, the seven-type conflict engine, per-provision applicability, per-issue confidence from YAML, L0–L3 escalation with specialist types, the nine abstention codes, and the blocked-phrase filter inside claim mapping. Contract extended by 8 enums and 7 models, mirrored in TypeScript. 42 new tests (T1, T5–T8, T12–T14, cases A–H, stage contract).
- Not done / carried over: no UI reads the Analysis yet, so its reason keys have no locale strings — that is Phase 4's conflict matrix, provenance explorer and Case Brief. The flagship question still abstains at the answer level (see the run above). Fact extraction is English only, so two multilingual gold cases cannot classify; Phase 6. The conflict examples that need recorded supersession pairs wait on ingestion.
- Next phase should first: read PHASE_03, and note that Check My Product can now call `app.reasoning.analyse` rather than growing a second classifier — the analyst package already runs its own fact-gathering conversation, and the two must not disagree about what a product is.

### Phase 1
- Done: source registry (SourceRecord, ReviewState, authority levels 1–5, sha256 provenance) in backend/app/registry/; backfill and review CLIs; 79 records registered and 43 fetched from official hosts; citations carry review_state/reviewed_at/provenance_pending; the source card shows a pending badge in all six languages; confidence caps at moderate with reason `moderateProvenancePending`; /api/v1/corpus-version reports registry_version, citable_sources and sources_by_review_state; 17 new tests (T2, T3, T4, T9, T15, injection) in backend/tests/test_registry.py.
- Not done / carried over: no source has been human-reviewed yet; the 8 TKDL records still report pending provenance; the corpus/manifest.json library stays unverified and uncitable; the locale and prettier gates still fail at baseline.
- Next phase should first: read PHASE_02, and note that authority levels now exist on every record — the jurisdiction/authority work can rank on `SourceRecord.outranks` rather than inventing a second ordering.

### Phase 0
- Done: pack installed (.agents/rules, .agents/workflows, docs/upgrade/*, 11 phase files); old specs archived; repo map, baseline and C1–C37 coverage filled; feature-flag module added on both sides with no behaviour change; risks and decisions recorded.
- Not done / carried over: the three owner decisions above; the failing locale gate; nothing else was touched (no feature code in Phase 0).
- Next phase should first: read this file, then PHASE_01_trust_foundation.md, and extend `corpus/guidance/sources.json` into the SourceRecord table rather than building a second registry — C4 (citation verifier) is already DONE, so Phase 1 is mostly registry fields, review states, hashes and the backfill/review scripts.
