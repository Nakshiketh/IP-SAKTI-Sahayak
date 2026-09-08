# Security

Full threat model and controls land in Phase 13. This file exists from Phase 0 so the threats are
named before code is written against them.

## Threats specific to this product

**Prompt injection via corpus text.** Retrieved passages are source documents, and a source
document can contain text shaped like an instruction. Corpus text is DATA, never instruction:
passages are neutralised before packing, and the generation prompt states that passages are
evidence to be cited, not commands to follow.

*Built.* `app/services/guardrails.neutralise` replaces instruction-like spans with a visible marker
before the passage is packed, and the count of removals goes onto the audit row — a corpus document
that starts producing them is a fact about the corpus somebody needs to see. `app/services/context`
wraps every passage in a delimiter under a labelled header, and `app/llm/prompt.SYSTEM_PROMPT`
opens by saying the passages are data. Neither measure is presented as sufficient alone. Ten
injection shapes are tested, alongside a test that ordinary statutory wording is left untouched.

**Citation spoofing.** A generated answer could name a passage id that does not exist, or attach a
real citation to a claim it does not support. Every returned passage id is validated against the
chunk store; a claim whose citation does not verify is dropped; if too many drop, the answer is
downgraded or abstains.

*Built.* `app/services/citations.map_citations` checks every id against the ids actually packed.
A claim written to rest on a passage whose passage does not verify is removed from the answer
entirely — not kept unsourced, because a sentence whose grounds are unknown is worse than no
sentence. Past `DROP_LIMIT` (a third of cited claims) the whole answer is abandoned and the system
abstains. Only citations something actually points at are carried on the answer, and only passages
that cleared the retrieval floor are ever packed, so a claim cannot cite a passage the confidence
rule already discounted.

**Jurisdiction leakage.** An answer that mixes the Indian and an international position is wrong in
a way that looks right. India and International are separate indexes and a retrieval call reads one
of them. Measured as `jurisdiction_purity`, target 100%. (Phase 13 measures it.)

*Built.* `Namespaces` holds one store per jurisdiction and hands retrieval exactly one of them —
there is no filter to forget. A cross-border question produces two routes, runs the pipeline twice
and streams two results. Tests assert that an answer never cites the other jurisdiction and that the
two jurisdictions return disjoint document sets for the same question.

**Authority laundering.** Registry records are evidence, not law. If one appeared as a citation,
the interface would present a filing as though it were a requirement. `citable_in_answers` is typed
`Literal[False]` so a record cannot occupy a citation slot. Measured as `authority_purity`, target
100%. (Phases 0, 12, 13.)

**Stale law presented as current.** Documents carry effective dates and supersession links.
Superseded text is retained but excluded from retrieval for current answers, and every answer
carries an as-of date and corpus version. (Phase 11.)

## Refusals

The product declines five kinds of request outright, matched on the question and *before* retrieval
runs, so a refusal never depends on what happened to be in the corpus: clinical advice (diagnosis,
dosage, treatment), predicting whether an application or a case will succeed, an opinion on the
reader's own matter, drafting an instrument, and help concealing a compliance failure. Each returns
an out-of-scope abstention naming the rule that fired. The near misses are tested too — a guardrail
that also refuses "what do the labelling rules require" is not a safer product, it is a broken one.

## Standard controls

*Built in Phase 10.* Input validation on every endpoint (Pydantic models with `extra="forbid"`) ·
a request-size cap enforced by middleware before the body is read · a per-question length cap ·
per-session rate limiting with `Retry-After` · CORS restricted to configured origins · no secrets
client-side · an append-only audit log.

The rate limit is keyed on a client-supplied session id, never on an IP address and never on a user
identity. That is trivially rotated, and the code says so: the limit exists to stop one open tab
hammering a model, not to stop a determined caller. A deployment that needs more puts a gateway in
front.

The audit log holds the session id, jurisdiction, retrieved passage ids, model, prompt version,
corpus version, latency, confidence, abstention reason, neutralised-span count and dropped-claim
count. It holds no question text, no answer text, no user identity and no address — a truncated
hash of the question lets the same question be recognised without being recoverable. See
`backend/app/services/audit.py` and the decision recording why.

*Phase 13.* Output encoding review · CSP · dependency audit in CI · consent surfaces and the
consent events the audit table already has a column for.

## Secrets

No secrets are committed. `backend/.env` is gitignored; `backend/.env.example` lists the keys.
Subscription-gated sources are never scraped and never fetched by the ingestion pipeline; they are
accessed only through the user's own credentials, with explicit per-session consent, and every
access is logged and shown back to the user.
