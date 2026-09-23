# Architecture

Status as of Phase 12. Sections marked **planned** are not built; do not describe them as working
anywhere in the interface (see the honesty audit in `docs/upgrade/archive/REVIEW_GATE.md`).

## The shape of the thing

A question arrives in one of six languages. It is classified — regulatorily, before anything else,
because what a formulation *is* determines what intellectual property is available to it. It is
routed to exactly one jurisdiction namespace. Passages are retrieved from a versioned corpus of
published legal and regulatory sources, reranked, and packed with their metadata. An answer is
generated from those passages and nothing else, with every factual sentence mapped back to the
passage that supports it. Confidence is computed from the retrieval result, not asserted. If the
passages do not support an answer, the system abstains and says which of four reasons applies.

## Two layers of data, never mixed

| | Layer 1 — corpus | Layer 2 — records |
| --- | --- | --- |
| Answers | what is *required* | what has been *filed or granted* |
| Examples | Acts, Rules, treaties, pharmacopoeias | patent applications, GI registrations |
| Status | normative; citable as authority | evidential; never citable |
| Storage | chunk store + vector index | its own SQLite file, full-text only |
| Embedded? | yes | **no** |
| Effect on confidence | sets it | none |

The separation is enforced in the type system: `Record.citable_in_answers` is `Literal[False]`, so
a record cannot occupy a citation slot. See `docs/DECISIONS.md`.

## Two jurisdiction namespaces, never merged

India and International are separate indexes. A single retrieval call reads one of them. A
cross-border question runs two retrievals and returns two `Answer` objects — the UI shows them as
two surfaces, never one blended paragraph. `Answer.jurisdiction` is a single value by design; there
is no "both".

## Layout

    /backend     FastAPI app, services, retrieval pipeline, records store
      app/models domain model (Pydantic) — one half of the frontend contract
      app/core   settings, read from environment
      app/api    HTTP surface
      app/services   pipeline stages, one module each
      app/retrieval  indexes, channels, fusion, reranking — the stores the stages read
      app/corpus     ingestion: fetch, parse, segment, enrich, embed, version, validate
      app/llm        the generator behind an interface, with its prompt
      app/records    Layer 2: store, manifest, ingestion, portal links
    /corpus      source manifests and ingestion configs
      samples/   fictional instruments the pipeline is proved against
    /data        generated indexes, chunk stores, demo fixtures (gitignored)
    /evals       gold question set, scoring, reports
    /frontend    React app
      src/types  domain model (TypeScript) — the other half of the contract
    /schemas     domain.schema.json, generated; the contract both halves are checked against
    /scripts     schema generation, ingestion, corpus refresh
    /docs        this, plus decisions, corpus policy, copy, banned patterns, review gate

## Built as of Phase 12

- Domain model on both sides, with a drift test that was verified to fail on drift.
- FastAPI app with the full API surface: `/query` (streaming), `/classify`, `/abs-check`,
  `/sources`, `/sources/{id}`, `/feedback`, `/escalate`, `/health`, `/corpus-version`. The last
  reports the index actually being searched and whether what it serves is illustrative.
- The corpus pipeline: fetch, parse, section-aware segmentation, tagging, versioning with retention
  of superseded wording, validation gates, and a per-jurisdiction SQLite index — driven from a
  manifest, idempotent, resumable, and proved end to end against committed fixture documents.
- Vite + React + TypeScript strict + Tailwind + React Router.
- Settings from environment with a committed `.env.example` and no committed secrets.
- Design system: six palette tokens with their contrast measured by a test over the token file
  itself, type self-hosted and subset per script with per-`:lang()` families, and eighteen
  primitives on a development-only `/design` route. Zero axe violations in a real browser with the
  colour-contrast rule active.
- Shell: six routes, a header with no dropdowns and no second level, a full-screen mobile menu that
  traps focus, and the standing disclaimer on every page. The source line under it reads the corpus
  state from the API rather than from JSX.
- i18n across six languages and seven namespaces, with `<html lang>` driving the per-script font
  stacks. English is complete; the other five are seeded placeholders, flagged as such, and reported
  at 0% by `make i18n`. An ESLint rule fails the build on a user-facing string written into JSX.
- Homepage: six sections, each a different shape — a hero with a working question box beside one
  drawn composition, a comparison table, two panels and a band, a real answer on demo fixtures, a
  specimen list, a closing paragraph. The question box carries what a reader typed into `/sahayak`.
- The answer surface: claim-level citation with numbered markers, unsourced sentences marked and
  keyboard-reachable, confidence with its reason, and source cards whose demo state is a different
  edge rather than a smaller badge.
- `corpus/manifest.json`: the 37 planned Layer 1 documents, all unverified with null URLs and dates.
  Nothing is fetched, and a backend test asserts nothing claims to be.
- `/what-is-covered`: the coupling matrix, eight rights as ledger entries, ten regulatory topics, and
  access and benefit sharing. Every statement carries a marker naming the instrument it will rest on,
  in a pending state until that document is ingested. Sticky contents, working deep links, a print
  stylesheet.
- `/how-it-works`: the thirteen-stage pipeline as a keyboard-navigable diagram, why retrieval and
  what it does not fix, the five abstention states in the surface they will use, the two
  jurisdictions side by side, the architecture layers, and the evaluation axes. Every stage and layer
  carries its build state; twelve of thirteen stages are `designed, not built`, and no evaluation
  numbers are shown because none have been produced.
- `corpus/records-manifest.json`: 17 Layer 2 sources, 4 bulk and 13 portal-only. No licence has been
  read, so none is ingested; portal-only entries carry no parser, field map or link template, and a
  test greps the repo to keep it that way.
- `/sources`: both manifests rendered with search and five facets, the records section visually
  distinct and never citable, the honesty commitments each marked with whether their mechanism
  exists, and what the product does not cover. No list on the page is hard-coded.
- `/sahayak`: the workspace. One centred column until an answer exists, three at desktop width once
  it does, sources in a drawer at tablet width and a bottom sheet on a phone. Jurisdiction toggle,
  context line, script-based language detection with a correction control, three starter questions
  with the rest behind a disclosure, and the Ctrl+K / Ctrl+Enter / Esc / "/" shortcuts.
- The answer experience: confidence computed by `scoreConfidence` from retrieval evidence and checked
  against a shared case set in `/evals`; all five abstention states, each with what the reader is
  offered next; retrieval status as two lines collapsing to one that expands to stage timings and
  passage scores; sources and related records as separate tabs; follow-ups derived from the answer;
  copy-as-text with citations intact; and an escalation handoff that packages the question and every
  source without pretending a queue exists.
- Three guided flows, offered by answers rather than from navigation: product classification walking
  a decision graph that is a data file read by both halves; access and benefit-sharing orientation;
  and prior-art orientation defined by what it refuses to do. Consequence panels carry pending
  markers, because the graph decides the class and the corpus supplies what follows from it.

### The pipeline

Eleven stages, each its own module under `app/services`, orchestrated by `pipeline.py` and streamed
to the client as they finish. The timings the interface shows are the ones the stages took.

| Stage | What it does | Real today? |
| --- | --- | --- |
| `language` | script detection with confidence and shared-script ambiguity | yes |
| `guardrails` | refuses clinical, predictive, individual-opinion, drafting and concealment questions, before retrieval | yes |
| `understanding` | rights, regulatory areas, product hints, entities, query expansion, and whether a fact is missing | yes, from a lexicon data file |
| `routing` | one namespace per route; a cross-border question produces two | yes |
| `retrieval` | metadata pre-filters, then channels, then reciprocal rank fusion | lexical channel yes; dense channel declares itself absent |
| `rerank` | calibrated [0, 1] coverage score — the number the confidence rule reads | lexical reranker yes; cross-encoder is the slot it fills |
| `context` | neutralises instruction-like text, packs under labelled headers, enforces a per-document share of the budget | yes |
| `generate` | schema-constrained structured output, four blocks, claim-to-passage map | fixture generator offline; Claude client with a key |
| `citations` | verifies every passage id against what was packed; drops what does not verify; abstains if too much drops | yes |
| `confidence` | the Phase 8 rule, ported, checked against the same shared case set | yes |
| `translate` | Translator interface; passthrough reports that it did not translate | passthrough yes; Bhashini shape written, not wired |
| `audit` | append-only row: session, passages, model, prompt and corpus version, latency, confidence | yes |

Retrieval reads exactly one namespace because it is handed one store, not one store and a filter.
Confidence is scored from the retrieval evidence and can abstain over a generator that was willing
to answer; the generator gets no vote on its own confidence.

### What is real and what is fixture

The boundary sits at the index, which is the honest place for it. Everything above it — refusal,
routing, understanding, fusion, reranking, citation verification, confidence, the audit row — runs
for real on every question. Below it, no document has been ingested, so the two namespaces are
served by `data/fixtures/demo-corpus.json`: real document titles, organizations and section
headings, with placeholder passage bodies, every chunk marked `demo`.

Retrieval genuinely scores a question against that metadata, so which passages come back, how many
clear the floor, and therefore what confidence is reached, all fall out of the question asked. A
question the fixture cannot speak to abstains because nothing scored, not because a keyword said so.

The generator matches: `FixtureLLMClient` refuses to run unless every packed passage is marked demo,
so a checked-in answer can never sit on top of a real retrieved document. With `SAHAYAK_LLM_PROVIDER`
set to `anthropic` and a key present, a hosted model answers instead, under the system prompt in
`app/llm/prompt.py` and constrained to the `GenerationResult` schema.

Phase 11 built the pipeline that will replace the fixture store. Nothing above the index changed to
accommodate it: `Namespaces` already preferred a built index per jurisdiction, so an ingest that
produces one takes over on the next restart. What has not happened is the ingestion of the real
source set, which waits on a person verifying a URL, a licence and an effective date per document.

### The corpus pipeline

`scripts/ingest.py` is a thin CLI over `app/corpus`, where the machinery lives so it can be tested.
The stages, in order:

| Stage | What it does |
| --- | --- |
| `fetch` | Refuses a credentialed or portal-only source on `access_mode` before looking at anything else. Skips a row with no verified `source_url`. Stores the bytes with a checksum under a gitignored `raw/`. |
| `parse` | `text` and `html` on the standard library; `pdf_layout` (PyMuPDF) and `ocr` (Tesseract) optional and reporting their own absence. Keeps page numbers, because a citation carries one. |
| `segment` | Section-aware chunking against the document's own structure. Five profiles: statute, rules, treaty, guideline headings, pharmacopoeia monographs. |
| `enrich` | Tags each chunk from the *same lexicon the query-understanding stage reads a question with*, so a pre-filter means the same thing on both sides of a retrieval. Document tags are a floor. |
| `embed` | No model, no vectors, and it says so. The dense channel stays off. |
| `version` | Diffs against the built index, keeps unchanged chunk ids, retains superseded wording with an `effective_to`, writes `CHANGELOG.md`. |
| `validate` | The gates. Anything that fails one does not enter the index. |
| `index` | One SQLite file per jurisdiction, written atomically into place. |

Chunking is the step everything else rests on. A fixed token window produces passages that begin
mid-sub-clause and belong to no section anyone can name, and the citation then says "page 14" —
which is not an answer to "where does it say that". So the boundaries are the document's own, a
section shorter than the target is *never* merged into its neighbour, and the 15% overlap applies
only between parts of one over-long section. Every one of those rules exists because breaking it
would put one section's words inside another section's citation.

A chunk id is a section key plus a content hash. Identical wording produces an identical id without
anything being compared, so a re-ingest of an unamended act changes nothing; amended wording gets a
new id and the old chunk stays in the index with its `effective_to` set. That is what lets the
product say "what I found on this has been superseded" rather than "I found nothing".

### What is ingested

Nothing, yet. All 37 entries in `corpus/manifest.json` carry a null `source_url`, because per
`docs/CORPUS_POLICY.md` those fields are filled only from the document actually fetched, and
guessing a URL is the fabrication this product exists to prevent. `make ingest` reports 37 skips
and builds nothing.

What *is* built is `corpus/samples/` — fictional instruments of a fictional territory, whose only
job is to prove the pipeline works end to end while the real manifest has nothing to fetch.
`make ingest-samples` fetches, parses, segments, tags, versions and indexes them, and the result is
readable by the real `Namespaces` and `Retriever`; a test asserts exactly that, because it is the
contract between this phase and the last one.

### The records layer

Layer 2, in `app/records`, and separate from the corpus in every way that can be made structural:
its own database file, its own manifest, its own CLI, its own API router, and no embedding column
anywhere in its schema — a test asserts the absence. Records are tabular, far larger than the corpus
and semantically thin; embedding them would pollute retrieval and produce citations that look
authoritative and are not law.

Five tables: `record_sources`, `records` (with each row's original JSON and a hash of it),
`record_snapshots` (append-only), `aggregate_statistics`, and an FTS5 index over title, abstract and
applicant.

The four orchestration rules are held in code rather than in a prompt:

1. A record is never packed as authority. `build_context` takes `ScoredChunk`; there is no overload
   that takes a `Record`, so this is a type error rather than a policy. `EVIDENCE_LABEL` is written
   and unused, waiting for the day record text does reach a model.
2. Confidence is computed only from corpus passages. `score_confidence` is not given records.
3. A corpus abstention is not rescued. `related_records` runs for an abstention exactly as for an
   answer, and a test drives that through the API.
4. An aggregate never attaches to a claim about a specific product. It lives in a different table,
   is reachable only from `/records/landscape`, and the pipeline module contains neither the word
   `landscape` nor the word `aggregate` — also a test.

Portals get no fetcher. `ingest_source` refuses on `access_mode` before it reads anything, the
manifest reader rejects a portal that carries a parser or field map, `app/records/portal.py`
contains no HTTP client, and a test greps the repository for a file that names a portal source
beside fetch code. Every real portal's `link_template` is null, because nobody has verified those
URL structures — a deep link written from memory would land on the wrong page and read like a search
that found nothing.

### What is ingested, Layer 2

Nothing. Thirteen of the seventeen sources are portals this pipeline never fetches; the other four
have licences nobody has read, and an unread licence means no ingestion. `make ingest-records`
reports that per source. `corpus/samples/records-manifest.json` is a fictional registry that does
load, which is what proves the loader, the snapshots, the diff and the search work.

### Guardrails

- Refusals are matched on the question and short-circuit before retrieval, so whether a dosage
  question is declined never depends on what happened to be in the corpus.
- Retrieved text is data. Instruction-like spans are neutralised before packing, the count is
  recorded on the audit row, and every passage is packed inside a delimiter under a system prompt
  that says so. Neither measure is presented as sufficient alone.
- Per-session rate limiting keyed on a client-supplied session id, never an address; a request-size
  cap enforced before the body is read; and an audit log holding no question text, no answer text
  and no user identity.

## Planned

| Component | Phase |
| --- | --- |
| Real API: language detection, query understanding, routing, hybrid retrieval, rerank, context assembly, constrained generation, citation mapping, confidence scoring, translation, audit | 10 |
| Corpus ingestion, section-aware chunking, versioning, refresh diff | 11 |
| Records store, snapshots, portal link-out | 12 |
| Evaluation harness, privacy and consent surfaces, hardening | 13 |
| An embedding model and the dense retrieval channel | not scheduled |
| Reading the licences and terms for the 17 records sources | not scheduled — it is reading, not code |
| Fetching the real source set: verifying a URL, a licence and an effective date per document | not scheduled — it is reading and checking, not code |
| Knowledge graph, agentic multi-source orchestration, subscription connectors | not scheduled |

## The mock boundary

The frontend talks to the API by default. One environment variable, `VITE_SAHAYAK_API`, switches it
to a mock service that answers from the same fixture files with no backend running — used by the
test suite, and by anyone who wants the interface without a Python process. Both implementations
satisfy the interface in `src/services/query.ts`, and no component above that file knows which one
it got.

Mock modules are named `*.mock.ts`, carry the header `// DEMO DATA — not a legal source`, and every
answer they produce sets `is_demo: true`, which the UI renders as a visible "Illustrative example"
chip. The API sets the same flag whenever the passages behind an answer are marked demo — which
covers both the committed fixture store and a real index built from illustrative documents. Demo
content must never look verified.

Two questions are kept apart in `app/retrieval/store.py`, because conflating them hid a real defect:
`is_fixture` asks whether a namespace is still the committed JSON stand-in, and decides which corpus
version an answer carries; `is_demo` asks whether what it serves is marked demo, and decides whether
the interface tells the reader so. A built index of illustrative documents is not a fixture — it has
a real version and a changelog — but everything it serves is still illustrative.

Failing and abstaining are separate states everywhere. An abstention is the system working and
saying the evidence is too thin; a failure is the system not working. They have different types,
different components and different copy, and nothing collapses them into one.
