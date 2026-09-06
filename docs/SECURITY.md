# Security

Full threat model and controls land in Phase 13. This file exists from Phase 0 so the threats are
named before code is written against them.

## Threats specific to this product

**Prompt injection via corpus text.** Retrieved passages are source documents, and a source
document can contain text shaped like an instruction. Corpus text is DATA, never instruction:
passages are neutralised before packing, and the generation prompt states that passages are
evidence to be cited, not commands to follow. (Phase 10.)

**Citation spoofing.** A generated answer could name a passage id that does not exist, or attach a
real citation to a claim it does not support. Every returned passage id is validated against the
chunk store; a claim whose citation does not verify is dropped; if too many drop, the answer is
downgraded or abstains. (Phase 10.)

**Jurisdiction leakage.** An answer that mixes the Indian and an international position is wrong in
a way that looks right. India and International are separate indexes and a retrieval call reads one
of them. Measured as `jurisdiction_purity`, target 100%. (Phases 10, 13.)

**Authority laundering.** Registry records are evidence, not law. If one appeared as a citation,
the interface would present a filing as though it were a requirement. `citable_in_answers` is typed
`Literal[False]` so a record cannot occupy a citation slot. Measured as `authority_purity`, target
100%. (Phases 0, 12, 13.)

**Stale law presented as current.** Documents carry effective dates and supersession links.
Superseded text is retained but excluded from retrieval for current answers, and every answer
carries an as-of date and corpus version. (Phase 11.)

## Standard controls (Phase 13)

Input validation on every endpoint · output encoding · CSP · no secrets client-side · dependency
audit in CI · rate limiting and request size caps · no PII in logs, session ids rather than user
ids · append-only audit log of queries, retrieved passage ids, model and prompt version, corpus
version, confidence, abstention and consent events.

## Secrets

No secrets are committed. `backend/.env` is gitignored; `backend/.env.example` lists the keys.
Subscription-gated sources are never scraped and never fetched by the ingestion pipeline; they are
accessed only through the user's own credentials, with explicit per-session consent, and every
access is logged and shown back to the user.
