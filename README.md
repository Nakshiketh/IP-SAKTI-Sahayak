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

Phase 12 of a phased build. The interface is complete, the API behind it is real, and so is the
corpus pipeline: a question is refused or understood, routed to exactly one jurisdiction, retrieved
for, reranked, packed, answered under a schema-constrained prompt, citation-checked, scored for
confidence and audited — with the stages streamed to the browser as they run. Ingestion fetches,
parses, segments a document at its own sections, tags, versions, validates and indexes it.

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

## Limitations

No clinical or dosage advice. No drafting of applications. No opinion on whether an application
will succeed. No novelty conclusions — the prior-art feature is an orientation aid over ingested
records, not a search of every database an examiner would consult. No real-time registry status.
Only the jurisdictions listed in the corpus policy.

## Licence

Not yet chosen. Source documents remain under the terms of their publishers; each ingested source
displays its licence and attribution text verbatim on the sources page.
