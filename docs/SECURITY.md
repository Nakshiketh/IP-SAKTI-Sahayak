# Security

The threats this product has that an ordinary web application does not, the controls against each,
and what is actually built rather than intended. Every claim below names the module that makes it
true, so a reader can check rather than believe.

Where a control is measured, the number is from the last `make evals` run and is on `/how-it-works`
with its date. Where a control is partial, it says so.

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
of them. Measured as `jurisdiction_purity`, target 100%. **Currently 100% over 54 answered cases.**

*Built.* `Namespaces` holds one store per jurisdiction and hands retrieval exactly one of them —
there is no filter to forget. A cross-border question produces two routes, runs the pipeline twice
and streams two results. Tests assert that an answer never cites the other jurisdiction and that the
two jurisdictions return disjoint document sets for the same question.

**Authority laundering.** Registry records are evidence, not law. If one appeared as a citation,
the interface would present a filing as though it were a requirement. `citable_in_answers` is typed
`Literal[False]` so a record cannot occupy a citation slot. Measured as `authority_purity`, target
100%. **Currently 100% over 54 answered cases.**

*Built.* Layer 2 lives in `app/records`, in its own database, with no embedding column in its schema
and no path from the query pipeline into its aggregate table. The generation context builder takes
only corpus passages, so a record cannot be packed as authority even by mistake; a test watches the
packed prompt during a real run and asserts no retrieved record's title or id appears in it. Portals
get no fetcher anywhere: the loader refuses on `access_mode`, the manifest reader rejects a portal
carrying a parser, and `app/records/portal.py` has no HTTP client.

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

### Content security policy

Two policies, because there are two things being served and they need different ones.

**The API** sends `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`
on every response, including the ones no route wrote — a 404 from the router, a 429 from the
limiter, a 500 from something unforeseen. It returns JSON and nothing else, so the most restrictive
policy there is costs nothing: if a response from it is ever rendered as a document, there is
nothing in it a policy this tight would allow to run. Alongside it go `X-Content-Type-Options:
nosniff`, `Referrer-Policy: no-referrer` and a `Permissions-Policy` that allows the camera to this
origin only — badge sign-in scans with it — and disables microphone, geolocation and payment,
features this product has none of, named so a future dependency cannot quietly acquire one. See
`SECURITY_HEADERS` in `backend/app/main.py`. Camera frames go to `/api/v1/auth/badge`, are compared
in memory with the one authorised QR code's module grid (`backend/app/core/badge.py`) and are never
stored. No route accepts a typed or decoded QR string.

The interactive documentation is the one document that process serves and it loads its viewer from
a CDN, so it gets a policy of its own rather than an exemption from having one — and it is served
only when `environment` is `development`, along with the OpenAPI schema. A list of every endpoint
and its shape is a map of the attack surface.

**The web app** gets `default-src 'none'` and then only what it needs: `script-src 'self'`,
`img-src 'self' data:`, `font-src 'self'`, `connect-src 'self'`, `object-src` and `frame-src`
`'none'`. It loads no third-party script, no web font, no analytics and no image from anywhere but
itself, so almost every directive is a refusal.

`style-src` carries `'unsafe-inline'`, which is a real weakening and is stated rather than hidden: a
few components set a `style` attribute to carry an animation delay or a bar height, and a style
attribute is inline style. A nonce would need a server rendering the document; this app is static
files. Injected CSS can restyle a page and cannot run code, so the trade is taken and named.

The policy is injected at build time only (`contentSecurityPolicy()` in `frontend/vite.config.ts`).
The dev server needs inline script and a websocket for hot reloading, so a policy strict enough to
be worth having would make the app undevelopable, and one loose enough to develop under is not the
one that should ship.

**What a deployment must add.** `frame-ancestors` is ignored in a `<meta>` element and has to be a
real response header, so the static host serving `frontend/dist` must send:

    Content-Security-Policy: frame-ancestors 'none'
    X-Content-Type-Options: nosniff
    Referrer-Policy: no-referrer
    Strict-Transport-Security: max-age=31536000; includeSubDomains

Written here rather than in the app, because a policy that cannot work from a meta element must not
be written there as though it did.

### Output encoding

React escapes interpolated text, and nothing in this interface uses `dangerouslySetInnerHTML` —
including the answer, which is the one place tempting enough to matter. An answer is rendered from
the structured claim-to-passage map as elements, never as a markup string, so a passage containing
angle brackets is text on the page rather than an element in it. Retrieved passage text reaches the
page the same way. This is not merely convention: there is no HTML-string path from the corpus to
the DOM to review.

### Dependency audit

`.github/workflows/ci.yml` runs `pip-audit --strict` over the backend including its optional model
client, and `npm audit --audit-level=high` over the frontend. On every push and pull request, and
also weekly on a schedule — an audit that only runs on a push is an audit of the developer's
activity rather than of the dependency set, and an advisory published against code nobody has
touched is exactly the one that goes unnoticed.

The same workflow enforces a bundle budget (`frontend/scripts/check-bundle.ts`) and greps for
competition and endorsement wording (`scripts/check-affiliation.sh`).

### Consent

A source marked `user_credentialed` is never fetched by this product, under any flag. It is reached
at query time through the reader's own subscription, which means the reader — not this product — is
the one paying for and identified by the access. Nothing goes out under those credentials until the
reader has agreed, about that specific source, in a sentence that names it. There is no blanket
"allow subscription sources": a reader cannot see the edges of a blanket.

The dialog (`frontend/src/components/privacy/ConsentDialog.tsx`) names the source and its publisher,
says whose credentials are used and that this product never sees them, says how far the agreement
reaches, and says it is recorded. Nothing is pre-selected and closing it agrees to nothing. A grant
the server refused is never reported as one.

Grants and withdrawals are rows in the audit log, so a withdrawal is a second row rather than the
deletion of the first — the reader's access log has to be able to show that consent was held between
two dates, and a store that erased the grant could not. `/privacy` shows that log back with the
times the server recorded. See `backend/app/services/consent.py`.

No source in the current set is credentialed, and the privacy page says so from the manifest rather
than from a sentence somebody typed, so it stops saying it the moment one is added.

### The audit viewer

`/audit` prints the raw table, with the column list read from the schema that creates it — so the
claim that there is no column for the question text can be checked rather than believed. It is
gated twice: the route is not registered in a production build, and the endpoint refuses to serve
outside a development environment. Either alone would be a route whose safety rests on one flag.

### What is not claimed

Accounts exist, with a sign-in in front of the site, and they are the front door rather than a
security boundary: tokens are HMAC-signed with a per-process secret, with no refresh, revocation or
rotation. The one place an account is a boundary is the invention analyst: `/api/v1/analyst/*`
requires a valid token, and a saved analysis (`data/analyses.sqlite3`, holding the inventor's own
words and findings) is read, written and deleted only through the account that created it — another
account gets a 404, not a 403, so it cannot even learn the analysis exists. If a hosted model is
configured as the analyst's reader, message text goes to that provider; the reader's output is
checked against the message before it is applied. No multi-tenancy beyond that, and no protection
against a determined caller: the rate limit is keyed on
a client-supplied session id and is trivially rotated. No secret management beyond a gitignored
`.env`. A deployment exposed to the public internet needs a gateway in front of this, and the honest
statement of that is here rather than in a paragraph implying otherwise.

## Secrets

No secrets are committed. `backend/.env` is gitignored; `backend/.env.example` lists the keys.
Subscription-gated sources are never scraped and never fetched by the ingestion pipeline; they are
accessed only through the user's own credentials, with explicit per-session consent, and every
access is logged and shown back to the user.
