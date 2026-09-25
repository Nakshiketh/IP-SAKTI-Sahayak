# Final report

Written 2026-09-25, at the end of the ten-phase upgrade. Every number here was
produced by running the thing it describes, on this machine, on the commit this
file lands in.

---

## 1. What I found

The product that existed at the start was well built and honest about most
things. Five findings mattered enough to change what it does.

**Two halves of the product contradicted each other.** Ask Sahayak refused to
give a novelty verdict — a guardrail, `RefusalKind.NOVELTY_VERDICT` — while
Check My Product printed *"Potentially novel"* and *"Close match found — novelty
at risk"*, derived from comparing a formulation against fourteen retail face
packs. A jury would have found that in a minute.

**Translation had never worked and could not have.** `_translate` replaced
`AnswerBlock.text` and left `AnswerBlock.claims` alone; the domain model
validates that the text is exactly its claims joined, so any translator that
actually translated would have raised a `ValidationError` and failed the
request. It was invisible because the only implementation in use reports
`translated=False` and returns before that line. Writing a fake translator for
the invariant tests was the first thing in this repository's life to translate
anything.

**Every non-English question blamed the corpus.** The corpus is English; a
question in Devanagari or Tamil shares no words with it, so retrieval found
nothing and the answer said *"nothing relevant"* — for a translation that never
happened. All twenty-five multilingual eval cases abstained.

**The hardest question in the product could not be answered.** The flagship
case retrieved nothing above the floor: its best passage scored 0.18 against a
threshold of 0.35, because the reranker scored every passage against all seven
of its sub-questions at once. The same corpus scored 0.75 when one part was
asked alone.

**Escalation fired on everything.** "How do I request examination of a patent
application?" came out at L3, *expert review needed*, because the classifier ran
on every question and reported five open categories for a question that
described no product. An L3 that fires on everything is worth nothing.

Three more were found only by opening the site in a browser, and are in §10.

---

## 2. What I removed

**The novelty verdict, not the dataset.** The owner decided to keep the fourteen
products as an ingredient reference and remove the conclusion drawn from them.
So the three-state indicator `potentially_novel` / `further_assessment` /
`high_similarity` became `nothing_found_in_sources_searched` /
`related_material_found` / `match_in_public_sources`; the requirement view's
*"novelty at risk"* became *"match found in the sources searched"*; and the
overlap labels say how many ingredients are shared rather than how "similar"
something is. A test forbids the old wording returning, permitting exactly one
documented occurrence: the map that reads analyses saved before the rename.

The dataset keeps the honesty that made it acceptable — `retrieved_not_reviewed`
and a scope note saying that finding nothing in it says nothing about what else
is sold. A test asserts both.

**Nothing else was removed.** No feature was deleted, no route dropped, no
component retired. Where a phase asked for a removal that conflicted with a
standing instruction, it was not done and is recorded in §15.

---

## 3. What I modified

| Area | Change |
|---|---|
| Pipeline | A `reason` stage between retrieval and composition; multi-part questions split and retrieved per part; an English pivot before retrieval; claim-level translation with invariant checks; `channel` recorded on the audit row only |
| Citations | `map_citations` runs the blocked-phrase filter; citations carry `review_state`, `reviewed_at`, `provenance_pending` |
| Confidence | A per-issue layer beside the answer-level rule, which is unchanged so its TypeScript mirror and pinned cases still hold |
| Check My Product | Classification now comes from the shared rules rather than a second implementation; the roadmap replaces the Phase 3 seed |
| i18n | English namespaces split so route copy loads with its route; the switcher states each language's real coverage |
| Home | The Jury Demo band asks the API whether a case exists instead of reading a flag that could disagree with the backend |
| Security | `corpus/fetch.py` now checks the host allowlist; citation links render only for `https` |

---

## 4. What I added

**Reasoning** (`app/reasoning/`) — deterministic fact extraction with negation
and hedging; rules-driven classification whose rules switch themselves off
without backed evidence; an issue classifier that says "not indicated" rather
than staying silent; a seven-type conflict engine typed from metadata and never
from wording; per-provision applicability; per-issue confidence; L0–L3
escalation; nine abstention codes; a blocked-phrase filter.

**Registry** (`app/registry/`) — `SourceRecord` with authority levels 1–5,
review states, sha256 provenance, a host allowlist, and a health monitor with
six states that queues changes for a person and never applies them.

**Product intelligence** (`app/analyst/`) — a bridge to the shared rules, ABS
decision support, a prior-art search builder, an IP protection map, and a
roadmap whose statuses stop at "completed by you".

**Elsewhere** — translation invariants; a feedback store with no identity in it;
insight aggregates with small-bucket suppression; a telephony seam with a
refusing null provider; voice input that never submits for the person.

**Rules as data** — `data/rules/{facts,classification_rules,confidence}.yaml`,
`data/glossary/en.json`, `data/demo/flagship_case.json`.

**Documents** — `COPY_STYLE.md`, `TELEPHONY.md`, this report, and a PROGRESS.md
that records every departure and its reason.

---

## 5. New routes

None. Every surface added — where guidance ends, the conflict and source
matrices, the provenance drawer, the answer receipt, the case brief, the
glossary, the roadmap, the protection map, feedback, voice — sits inside
`/sahayak` or `/assess`, which already existed. The landing page and the
navigation are untouched, as instructed.

---

## 6. New API endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/api/v1/demo/flagship-case` | The flagship question, behind `feature_jury_demo`. Reads three fields, so an answer added to the seed file could never reach the interface |

`/api/v1/corpus-version` gained `registry_version`, `citable_sources` and
`sources_by_review_state`. `/api/v1/feedback` gained `aspect`, `jurisdiction`,
`confidence` and `abstained`, and now writes to a store with no identity in it.

---

## 7. New data models

`AbstainCode` (9), `IssueType` (10), `IssueStatus`, `ConflictType` (7),
`ResolutionStatus`, `ApplicabilityStatus`, `EscalationLevel` — and `Fact`,
`MissingFact`, `IssueFinding`, `Conflict`, `ProvisionApplicability`,
`Escalation`, `Analysis`, carried on every `Answer`. All mirrored in
`frontend/src/types/domain.ts` and pinned by the generated schema.

Backend-only: `SourceRecord`, `ReviewState`, `Health`, `Task`, `Intelligence`,
`FeedbackRow`, `Insight`, `Gap`, `CallSession`, `Transcript`.

---

## 8. Authoritative sources

No new documents were added to the corpus. What changed is that its provenance
is now recorded rather than assumed.

| Review state | Count | Meaning |
|---|---|---|
| `verified_official` | 43 | Fetched from an allowlisted official host and hashed |
| `needs_review` | 8 | The TKDL pages — the host refuses connections from this machine |
| `unverified` | 28 | The `corpus/manifest.json` library: no URL, not citable |

51 citable, registry version `registry-0d9148eee8d1`. **No source has been
confirmed by a person yet** — `scripts/registry_review.py --pending` lists the
43 waiting.

---

## 9. Flagship demo

The exact question is in `data/demo/flagship_case.json`. Run through the real
pipeline, both jurisdictions, on this commit:

| | India | International |
|---|---|---|
| Citations | 30 across 8+ official documents | 5 |
| Confidence | moderate | high |
| Escalation | **L3** | **L3** |
| Classification | undetermined, 5 candidates | none (the rules are Indian) |
| Missing facts | 4 | 4 |
| Conflicts | jurisdictional → separate obligations; missing fact → unresolved | same |

**Issues raised**: patent, traditional knowledge, biodiversity/ABS.
**Not indicated**: trade mark, design, GI, copyright, trade secret, drug
regulation, food regulation — the over-reach check this case exists to make.

Everything the question hedges — *"may already be documented in classical
texts"*, *"know whether it is a classical drug … or an Ayurveda Aahara
product"* — is read as stating nothing, so it appears as a missing fact rather
than as a fact. The four that surface are exactly the four `FLAGSHIP_CASE.md`
says must.

Conflict examples 2, 5 and 6 from that file did not appear: the corpus records
no supersession pair for them, and this engine will not infer one from wording.

---

## 10. Safety and legal-guidance changes

- **No novelty verdict anywhere.** Both halves of the product now agree.
- **A translation that loses a section number, a year or an acronym is not
  shown.** The English is shown instead. "Section 3(p)" is not "Section 3"; 1970
  is not 1971. The blocked-phrase filter runs on translations too.
- **A promise about an outcome is dropped like an unsupported citation.** One
  with a neutral form is rewritten.
- **A roadmap task can never say "filed" or "approved".** This product cannot
  observe either; the furthest a task goes is "completed by you".
- **Escalation is proportionate.** A procedural question is L0; one that turns
  on unstated facts is L3.
- **Feedback carries nobody with it.** The query id is omitted specifically so
  no join through the audit log can put a name to an opinion.
- **Analytics cannot identify anyone.** A hash, never the words; buckets under
  five withheld and the suppression reported.
- **The channel cannot change the answer.** Voice, helpline and text produce
  identical abstention codes, escalation, sources and safety flags.

Three faults were found only in a browser: Check My Product was **completely
broken for anyone with saved work** (a rename left stored analyses failing
validation, and one bad row took the whole page down); a single inserted
adjective lost a fact and moved an answer from L3 to "no review needed"; and the
L0 copy claimed "nothing was left open" beside a list of things it could not
conclude. All three are fixed and pinned.

---

## 11. Test results

Run on this commit:

| Suite | Result |
|---|---|
| Backend (`pytest`) | **613 passed**, 0 failed |
| Frontend — components, services, lib, types, hooks, styles | **245 passed** (19 files) |
| Frontend — routes, i18n, App | **194 passed** (13 files) |
| Typecheck (`tsc --noEmit`) | clean |
| Lint (`eslint --max-warnings 0`, `ruff check`, `ruff format --check`) | clean |
| Schema drift (`gen_schema.py --check`) | current |
| Locale check (`scripts/i18n/check_locales.py`) | clean |
| Evals (170 cases) | `below_target []`, 0 errors |

Eval detail: jurisdiction purity, authority purity, citation validity, citation
groundedness, abstention recall, abstention reason accuracy, forbidden-claim
avoidance and language detection all **100%**. Classification accuracy 50% (up
from 0%). Abstention precision 39.4% — analysed in §13.

**T1–T18 all exist and pass**, indexed in `tests/test_hardening.py` so the
catalogue cannot rot into a list of numbers nobody implements.

---

## 12. Performance

| | Phase 0 baseline | Now |
|---|---|---|
| Initial load | 147.5 kB gzip | **117.1 kB gzip** (budget 150) |
| All chunks | ~517 kB | 569 kB |
| Eval latency p50 / p95 | 12 / 25 ms | ~20 / ~40 ms |

The initial load fell while the product grew, because the English locale
namespaces were split so route copy loads with its route. Voice is in its own
chunk: zero matches for `webkitSpeechRecognition` in the main bundle.

The latency rise is the reasoning stage and per-part retrieval — the flagship
case now runs seven retrievals instead of one. Both figures are the harness's,
not a browser's.

---

## 13. Known limitations

- **Abstention precision is 39.4%.** Traced case by case rather than tuned. Of
  60 answerable cases that declined: 25 were the multilingual set (no translator
  configured), 11 were UK/EU/US national law the corpus does not hold, and the
  rest were India topics outside the 51 documents. **None is the system refusing
  something it has sources for.** Lowering the retrieval floor would raise the
  number by answering from passages that do not bear on the question.
- **No source has been human-reviewed.** 43 are fetched and hashed; nobody has
  read one against the original.
- **Hindi is 61% translated, the other four 44%**, and the switcher says so.
  Nothing is machine-drafted: the script exists and needs a key.
- **Fact extraction is English only**, so two multilingual gold cases cannot
  classify.
- **`frontend/src/components/layout/backdrop.test.tsx` is flaky** under memory
  pressure. Pre-existing — proven by reverting all of `frontend/src` and seeing
  the same failure.
- **The corpus holds no EU, UK or US national law**, and says so by abstaining.

---

## 14. Third-party keys and providers

| Needs | For | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | `scripts/i18n/translate_locales.py` | Exits cleanly, changes nothing, languages stay labelled |
| A translation service | The English pivot, and answers in the reader's language | Non-English questions abstain with `language_unsupported`, saying the sources were never searched |
| An approved SIP/telephony provider | A real helpline | `NullProvider` refuses; there is no phone service and nothing claims otherwise |
| Network access to `tkdl.res.in` | Provenance for the 8 TKDL pages | They stay `needs_review` and read as provenance-pending |

---

## 15. Manual steps

These genuinely cannot be done from the repository.

1. **Human-review the sources.** `python scripts/registry_review.py --pending`,
   then `--approve <id> --by "Your name"` after reading each against the
   official original. None is approved yet.
2. **Confirm six allowlisted hosts** added in Phase 1: `ipindiaonline.gov.in`,
   `nbaindia.in`, `nbaindia.nic.in`, `cdsco.gov.in`, `ayushportal.nic.in`,
   `s3waas.gov.in`.
3. **Decide on the demo account** (`demo` / `demo1234`, published in the README
   and on the sign-in page).
4. **Decide on competition names** in `.agents/` and `docs/upgrade/`, which
   AGENTS.md rule 8 forbids in the product.
5. **Re-check the TKDL pages** from a network that can reach `tkdl.res.in`.
6. **Review the Hindi and Telugu interface text** once translations land.

### Instructions I chose not to override

Four phase items conflicted with standing instructions, and the instruction won
each time. All are recorded in PROGRESS.md with their reasons.

- **The badge scanner stays on the sign-in page** (Phase 5 asked for
  `scanBadgeLogin=false`). The instruction was that the login page is not to be
  disturbed.
- **Ask still requires an account** (Phase 5 asked for public Ask).
- **The patent timeline keeps its place on Home** (Phase 5 asked to demote it).
  The instruction was to preserve the existing landing page.
- **Home's copy, ordering and proof chips are unchanged**, for the same reason.

### Work left undone, and why

The helpline simulator, Document Intelligence, the twelve-panel workspace with
`CaseRun` snapshots, Ask's case-aware follow-ups, and the admin route that
renders the insight aggregates. Each is recorded in PROGRESS.md as remaining
work rather than as blocked — the logic behind several of them exists and is
tested; what is missing is a surface.

The browser screenshot sets for Phases 4, 5, 6 and 10 are also owed. The dev
servers were stopped repeatedly by the operating system for low memory during
this work, and I did not restart them unprompted.
