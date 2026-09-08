# Demo script

Written properly in Phase 13, rehearsed twice, with an offline-safe fallback ready. What follows is
what actually works today, with the exact questions, because retrieval is real now and a question
that reaches the wrong state on stage is a question that was not rehearsed.

## Running it

    make dev-backend       # http://127.0.0.1:8000
    make dev-frontend      # http://localhost:5173, proxied to the API

No API key is needed. With none set, the generator is `fixture`: it writes only over demo passages
and refuses to write over anything else. Every answer is marked "Illustrative example".

If the API cannot be started, `make dev-frontend-mock` runs the interface alone against the same
fixture files. Say so if you use it — the interface looks identical and that is the point of the
switch, so it is worth naming out loud.

## Five minutes, in this order

**1. Ask, without configuring anything.** Land on the homepage, type into the box, press Ask.

> What do we need in place before manufacturing an Ayurvedic product in India?

Nothing was chosen first: jurisdiction defaulted to India, language was detected from the script,
the product type is unknown and the answer says so. Point at the status line — the passage count and
the timings are what the stages actually did.

**2. Open a source.** Expand a source card and show the passage, its section path, and the dashed
edge that says demo. Then expand "what happened" and show the per-passage scores, including the ones
that did not clear the floor and are marked as such.

**3. Flip the jurisdiction.** The answer set swaps whole — different documents, different
confidence, nothing blended. The Indian sources are not filtered; they are not in the store that was
read.

**4. Trigger an abstention deliberately.** Five that work; pick one, or walk them.

| Question | Abstains with |
| --- | --- |
| `How much of this should a patient take each day?` | out of scope — refused before anything was searched |
| `What are the patent rules in Brazil?` | nothing relevant — retrieval ran and found nothing above the floor |
| `What stability and shelf life information goes on the pack?` | sources conflict — two passages point different ways, both shown |
| `Is that notification superseded or is it still current?` | out of date — what was found sits outside its effective window |
| `Is our product a medicine, a nutraceutical or a cosmetic?` | needs more facts — and it offers the classification flow, which is the gap it just named |

Say plainly that these are the product working. The conflict one is the best of them: it shows both
sides rather than picking one.

**5. Classification, offered rather than navigated to.** From the abstention in the last row, take
the offer. It reaches a class in under eight questions, and the consequence panels carry pending
markers because the graph decides what the product *is* and the corpus supplies what follows.

**6. Say what is not real.** The passage bodies are placeholders — no document has been ingested.
Everything else on the path ran: the refusal, the search, the scoring, the citation check, the
confidence and its reason. That is the honest line and it is stronger than pretending otherwise.

## What is deliberately not in the script

- Evaluation numbers. None have been produced; the site shows none. (Phase 13.)
- Any claim about what a provision says. The demo passages are placeholders and every card says so.
- Any suggestion that a source list is complete. `/sources` reports 0 of 37 documents fetched.
