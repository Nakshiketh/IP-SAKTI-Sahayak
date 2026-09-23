# PROJECT: IP-SAKTI Sahayak

## What this is

A multilingual, retrieval-grounded, source-cited assistant for intellectual-property
and regulatory guidance in Ayurveda, covering the Indian regime and international
regimes separately and without conflation.

Tagline: "Ancient knowledge. Protected innovation. Grounded guidance."

## The insight the whole product is built on

For an Ayurvedic product, intellectual property and drug regulation are inseparable.
What a formulation IS regulatorily — classical medicine, patent-or-proprietary
medicine, new drug, phytopharmaceutical, Ayurveda-Aahar, or cosmetic — determines what
IP is even available to it and what Access-and-Benefit-Sharing duties attach. So the
assistant classifies the product FIRST, then routes to IP and regulatory answers.

Any build that treats this as "a chatbot with an Ayurveda knowledge base" has missed
the product.

## The one path through the middle

Type a question -> get an answer with sources -> open a source.

Three steps. A first-time user completes all three without reading anything, choosing
anything, or being taught anything. Every other capability — classification, ABS,
prior art, filters, records, languages — is offered ALONG that path at the moment it
becomes relevant. Never in front of it, never as a competing nav item.

## Non-negotiable product rules

1. GROUNDED OR SILENT. Every substantive claim maps to a retrieved passage. If
   retrieval is weak, abstain. Never fabricate a statute, section, rule, treaty
   article, case, URL or date.
2. JURISDICTION IS NEVER MIXED. India and International are separate retrieval
   namespaces and separate answer surfaces. Never merged into one paragraph.
3. INFORMATION, NOT LEGAL ADVICE. Persistent, readable. The product does not grant
   rights, approve products, issue licences, or replace an authority.
4. CITATION IS PART OF THE ANSWER, not a footer. Claim-level, not answer-level.
5. CONFIDENCE IS SHOWN, not hidden. High / moderate / low / abstain, with the reason.
6. THE CORPUS IS VERSIONED. Law changes. Answers carry an "as of" date and the
   document version they relied on.
7. RECORDS ARE NOT AUTHORITY. Registry data is evidence of what was filed or granted,
   never a statement of law, never rendered as a citation.
8. NO AFFILIATION IS IMPLIED. No emblems, no ministry named as endorser, no claim of
   official status. Never mention any competition, hackathon, problem statement or
   submission anywhere in the product, the repo, the README or the metadata.

## Zero-config rule

Nothing is configured before the first question. Jurisdiction defaults to India,
language auto-detects, product class is unknown and that is fine. The answer says
"this assumes India — switch" rather than demanding a choice up front.

## Stack

    Frontend : React 18 + TypeScript + Vite + Tailwind + Lucide + Framer Motion (sparingly)
    Backend  : Python 3.11 + FastAPI + Pydantic v2
    Retrieval: hybrid BM25 + dense embeddings, cross-encoder rerank, section-aware chunking
    Stores   : SQLite (metadata, records, audit) + FAISS/Chroma (vectors), behind interfaces
    i18n     : centralised locale files; Bhashini adapter behind a translation interface
    Testing  : pytest, vitest, and a dedicated evals/ harness

## Repo layout (existing — keep it)

    /backend    FastAPI app, services, RAG pipeline, records store
    /corpus     source documents, manifests, ingestion configs
    /data       generated indexes, chunk stores, demo fixtures
    /evals      gold question set, scoring scripts, reports
    /frontend   React app
    /scripts    ingestion, index build, corpus refresh
    /docs       DECISIONS.md, ARCHITECTURE.md, CORPUS_POLICY.md, SECURITY.md, DEMO.md

## Mock vs real

Until Phase 10, the frontend talks to a mock service layer satisfying the SAME
interfaces the real API will satisfy. Every mock file is named *.mock.ts, carries the
header comment "// DEMO DATA — not a legal source", and every demo answer renders a
visible "Illustrative example" chip. Demo must never look verified.

## Interface language

The words RAG, retrieval-augmented, embedding, rerank, namespace, chunk, vector,
corpus, pipeline and LLM do not appear in the interface. They appear on /how-it-works
and nowhere else. Elsewhere say: "searching Indian sources", "4 sources found",
"the passage this came from".

## Writing style

Plain verbs, sentence case, no marketing filler, no exclamation marks. Name things as
a user would: "Check what applies to my product", not "Regulatory Compliance Module".
Errors state what happened and what to do next.

## Craft floor (applies to every phase)

Responsive from 360px. WCAG AA contrast. Visible focus rings, never removed. Full
keyboard operation. prefers-reduced-motion honoured. No layout shift on load. No
console errors.
