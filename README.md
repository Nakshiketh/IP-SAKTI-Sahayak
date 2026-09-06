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

Phase 0 of a phased build: scaffold, contracts and domain model. There are no screens yet and no
corpus is ingested. `docs/ARCHITECTURE.md` lists what is built and what is planned;
`docs/MASTER_BUILD.md` carries the full phase sequence.

## Running it

Requires Python 3.11+ and Node 20+.

```bash
# backend
py -3.11 -m venv backend/.venv
backend/.venv/Scripts/python -m pip install fastapi "uvicorn[standard]" pydantic pydantic-settings pytest httpx ruff
cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload   # http://127.0.0.1:8000

# frontend
cd frontend && npm install && npm run dev                             # http://localhost:5173
```

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
confidence or rescue an abstention. Sources that are interactive and session-based are linked out
to, never scraped.

`docs/CORPUS_POLICY.md` lists the source set and the manifest formats.

## Limitations

No clinical or dosage advice. No drafting of applications. No opinion on whether an application
will succeed. No novelty conclusions — the prior-art feature is an orientation aid over ingested
records, not a search of every database an examiner would consult. No real-time registry status.
Only the jurisdictions listed in the corpus policy.

## Licence

Not yet chosen. Source documents remain under the terms of their publishers; each ingested source
displays its licence and attribution text verbatim on the sources page.
