# IP-SAKTI Sahayak

Ancient knowledge. Protected innovation. Grounded guidance.

A multilingual, source-cited assistant for intellectual-property and regulatory questions about
Ayurvedic products. It answers from a versioned corpus of published legal and regulatory sources,
cites the passage behind each claim, keeps the Indian and international positions separate, and
declines to answer when the sources do not support one.

It provides information, not legal advice. It does not grant intellectual-property rights, approve
products, issue licences, or replace a regulatory authority.

## The insight it is built on

For an Ayurvedic product, intellectual property and drug regulation are inseparable. What a
formulation *is* regulatorily — a classical medicine, a patent or proprietary medicine, a new
non-classical drug, a phytopharmaceutical, an Ayurveda-Aahar, or a cosmetic — determines what
intellectual property is available to it and what access-and-benefit-sharing duties attach. So the
product classifies first, then routes to the intellectual-property and regulatory answers.

## Status

Phase 13 of a phased build, and the last of them. The interface is complete, the API behind it is
real, and so is the corpus pipeline: a question is refused or understood, routed to exactly one
jurisdiction, retrieved for, reranked, packed, answered under a schema-constrained prompt,
citation-checked, scored for confidence and audited — with the stages streamed to the browser as
they run. Ingestion fetches, parses, segments a document at its own sections, tags, versions,
validates and indexes it. A gold set of 170 questions runs against the whole of it and publishes
its numbers to the site.

No corpus has been ingested yet, and that is a different thing from the pipeline not existing. All
37 entries in `corpus/manifest.json` carry a null `source_url`, because those fields are filled only
from the document actually fetched and guessing one is the fabrication this product exists to
prevent. So `make ingest` reports 37 skips and builds nothing, both namespaces are served by a
committed demo fixture whose passage bodies are placeholders, and every answer is marked
"Illustrative example".

What proves the pipeline works is `make ingest-samples`: fictional instruments of a fictional
territory, built by the same code into a real index that the real retrieval reads.

`docs/ARCHITECTURE.md` lists what is built and what is planned; `docs/MASTER_BUILD.md` carries the
full phase sequence; `docs/DEMO.md` is the five-minute walkthrough with the exact questions.

## The architecture

A React interface, a FastAPI service, and two stores that are kept apart on purpose.

    frontend/          React 18 + TypeScript + Vite + Tailwind
      routes/            seven pages; six in the header, /privacy in the footer
      services/          one module per API surface, mock and live behind one switch
      locales/           six languages; English in the first chunk, the rest on request

    backend/app/
      api/               the endpoints, thin — validation and a call into a service
      services/          the pipeline, stage by stage
      retrieval/         one store per jurisdiction, never one store with a filter
      records/           Layer 2, its own database, no embeddings, no path into an answer
      corpus/            fetch, parse, segment, tag, version, validate, index
      llm/               the generator behind an interface; fixture by default
      evals/             the gold-set runner and the metrics

    corpus/            manifests: what the product intends to cover
    data/              built indexes, the records database, the audit log, demo fixtures
    evals/             the gold set, the scorer, the reports
    schemas/           domain.schema.json, generated from the Pydantic model

**A question becomes an answer** in eleven stages: detect the language, understand the question,
route to one jurisdiction, retrieve with BM25 and dense embeddings fused, rerank, pack the context
with per-document diversity, generate under a schema-constrained prompt, verify every citation
against the passages actually packed, score confidence, translate, audit. Each stage streams its
timing to the browser, which is why the status line under an answer is a report rather than an
animation.

**Three rules are enforced by structure rather than by prompt.** Jurisdictions are separate stores
and retrieval is handed one of them, so there is no filter to forget. Records are typed
`citable_in_answers: Literal[False]` and the context builder takes only corpus passages, so a
filing cannot occupy a citation slot. A claim whose citation does not verify is removed from the
answer, and past a third of them the answer is abandoned for an abstention.

`docs/ARCHITECTURE.md` has the full version, including what is planned and what is not.

## Running it

Requires Python 3.11+ and Node 20+.

```bash
# backend
py -3.11 -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -e "backend[dev]"
cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload   # http://127.0.0.1:8000

# frontend
cd frontend && npm install && npm run dev                             # http://localhost:5173
```

Building a corpus:

```bash
make ingest            # the real source set; today, 37 skips and nothing built
make ingest-samples    # the fixture documents, into data/index-samples
make refresh           # re-fetch and report what moved; writes nothing without --write
make ingest-records    # Layer 2; today, 17 sources and nothing loaded
```

No API key is needed. With none configured the generator writes only over the demo passages and
refuses to write over anything else, so an unconfigured install can be demonstrated but cannot
present a fixture answer as retrieval from a real document. To answer from a real corpus, install
the `llm` extra and set `SAHAYAK_LLM_PROVIDER=anthropic` with a key.

To run the interface with no backend at all, set `VITE_SAHAYAK_API=mock`: it answers from the same
fixture files. That is the one switch between the two, and nothing above `src/services/query.ts`
knows which it got.

Tests, lint and the schema contract:

```bash
make test          # or, on Windows without GNU make:  .\make.ps1 test
make lint          #                                   .\make.ps1 lint
make evals         # run the gold set, write the report, publish the numbers to the site
make bundle        # build the web app and check it against the size budget
make schema        # regenerate schemas/domain.schema.json after changing the Pydantic model
```

Copy `backend/.env.example` to `backend/.env` for local configuration. No secrets are committed.

## The contract between the halves

The domain model exists twice — `backend/app/models/domain.py` and
`frontend/src/types/domain.ts` — and `schemas/domain.schema.json` is generated from the Python
side. A test on each side fails if the two drift apart, so a field added in one place and forgotten
in the other is caught by `make test` rather than by a user.

## Source policy

Two layers, never mixed.

**Layer 1, the corpus** is normative: Acts, Rules, regulations, treaties, guidelines and
pharmacopoeial standards. It is versioned, carries effective dates, and is what answers cite.
Superseded text is retained but never retrieved for a current answer.

**Layer 2, records** is evidential: what has been filed, granted or registered. Records are shown
beside an answer, never inside it, never as a citation, and they never change an answer's
confidence or rescue an abstention. They live in their own database with no embeddings, and the four
rules that keep them there are enforced in code rather than in a prompt. Sources that are
interactive and session-based are linked out to, never scraped — and nothing in the codebase can
fetch one.

Neither layer has been ingested. The pipelines for both are built and proved against fictional
fixtures; what waits is a person verifying a URL, a licence and an effective date per source.

`docs/CORPUS_POLICY.md` lists the source set and the manifest formats.

## Evaluation

`make evals` runs a gold set of 170 questions — 60 Indian, 30 international, 15 cross-border, 15
deliberately unanswerable, 25 multilingual (five each in Hindi, Marathi, Bengali, Tamil and Telugu)
and a 25-case records regression set — against the live pipeline. It writes `evals/reports/report.md`
for a person, publishes a summary the `/how-it-works` page renders with its run date, and exits
non-zero when a metric with a target misses it.

The last run, against the demonstration corpus:

| Metric | Target | Result |
| --- | --- | --- |
| `jurisdiction_purity` | 100% | **100%** (54/54) |
| `authority_purity` | 100% | **100%** (54/54) |
| `citation_validity` | 100% | **100%** (54/54) |
| `citation_groundedness` | 100% | **100%** (54/54) |
| `forbidden_claim_avoidance` | 100% | **100%** (170/170) |
| `abstention_recall` | high | **100%** (39/39) |
| `abstention_reason_accuracy` | — | **100%** (39/39) |
| `language_detection_accuracy` | — | **100%** (25/25) |
| `records_offered` | — | **100%** (25/25) |
| `records_do_not_rescue` | 100% | **100%** (15/15) |
| `latency` p50 / p95 | — | 3 ms / 6 ms |
| `abstention_precision` | — | 33.6% |
| `citation_coverage` | — | 0% |
| `classification_accuracy` | — | 33.3% |
| `answer_accuracy` | — | not measured |
| `citation_correctness` | — | not measured |
| `multilingual_quality` | — | not measured |

**Read the last six rows carefully, because the first ten flatter the product.** These numbers come
from a demonstration corpus of nine illustrative documents, not from the real source set — no
document in `corpus/manifest.json` has been ingested, because none has a verified source URL. So
most questions abstain for want of anything to answer from, and the abstention, coverage and
classification figures measure the machinery rather than the product's coverage. The purity and
groundedness figures are meaningful now; the coverage figures only become meaningful once real
documents are in.

`answer_accuracy`, `citation_correctness` and `multilingual_quality` report *not measured*, with the
reason, rather than a number. Each needs a reference answer, and writing 170 reference answers
stating what Indian and international law requires — from memory, by somebody who has not read the
sources — would be exactly the fabrication this product exists to prevent. `evals/gold/README.md`
explains what a case does and does not assert.

## What it stores

No accounts, no sign-in, no user profiles. One append-only row per query holding the session id, a
one-way fingerprint of the question, the passage ids retrieved, the model and prompt and corpus
versions, the confidence and abstention outcome, and timings. It holds no question text, no answer
text, no note you type, no identity and no IP address — those are not empty fields, they are not
columns, and the development audit viewer prints the column list from the schema so that can be
checked rather than believed.

Nothing is shared with anyone. There is no analytics script, no advertising network and no
error-reporting service anywhere in the interface; the content policy forbids loading one. The one
exception is named on the page: a deployment configured with a hosted model sends the question and
the retrieved passages to that provider, and with no key configured — the default — no text leaves
the machine.

`/privacy` says all of this to a reader, with a button that discards the session, and
`docs/SECURITY.md` has the threat model.

## Limitations

No clinical or dosage advice. No drafting of applications. No opinion on whether an application
will succeed. No novelty conclusions — the prior-art feature is an orientation aid over ingested
records, not a search of every database an examiner would consult. No real-time registry status.
Only the jurisdictions listed in the corpus policy.

No authentication and no multi-tenancy, because there are no accounts. The rate limit is keyed on a
client-supplied session id and is trivially rotated; it exists to stop one open tab hammering a
model, not to stop a determined caller. A deployment exposed to the public internet needs a gateway
in front of this.

Five of the six languages are seeded with English placeholders rather than translated. The files
carry `__untranslated: true` and `make i18n` reports the coverage, so the gap is visible rather than
disguised — but a reader who switches to Tamil today is reading English in a Tamil-labelled
interface, and that should be said plainly.

## Licence

Not yet chosen. Source documents remain under the terms of their publishers; each ingested source
displays its licence and attribution text verbatim on the sources page.
