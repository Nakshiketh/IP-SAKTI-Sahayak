# Demo script

Five minutes, with the exact questions, because retrieval is real and a question that reaches the
wrong state on stage is a question that was not rehearsed. The offline-safe fallback is at the bottom
and takes one command. Nothing in it requires a manual step or a key.

**How far this has been verified.** Every question below was run against the running API and reached
the state this script says it reaches: step 1 answers at moderate confidence over two Indian
documents, step 3 answers on both sides with disjoint document sets, and all five abstentions arrive
with the reason named in the table. The endpoints behind steps 6 and 7 were checked the same way —
the audit table holds no column for the question, and the security headers are on every response.

What has *not* been walked is the interface itself, click by click, in a browser. The pages are
covered by the test suite, including an axe pass on each, but a test rendering a page is not a person
using one. Do the run in "Rehearsal notes" below before showing this to anybody.

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

Then move along the tabs. **Related records** are things somebody filed — full neutral borders, no
indigo anywhere, and a line on every card saying they are not a statement of law. **Search
elsewhere** is the registries this product did *not* search, each saying so, and each saying its link
is not yet verified rather than offering a guessed URL. Say the sentence out loud: finding nothing in
a search nobody ran means nothing.

**3. Flip the jurisdiction.** Ask this one, because it is the question the demo corpus answers on
both sides — most questions answer on one and abstain on the other, which is honest but makes a
duller point:

> What must appear on the label of a herbal product?

Then use the toggle. The answer set swaps whole: India cites the Drugs and Cosmetics Act and its
Rules at low confidence, International cites the UK food-supplements labelling and traditional
herbal registration material at moderate. Different documents, different confidence, nothing
blended, and no sentence carrying one jurisdiction's rule under the other's heading.

Say why, because it is the strongest structural claim in the product: the Indian sources are not
filtered out of the international answer. They are not in the store that was read.

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

**6. Show the numbers.** Go to `/how-it-works` and scroll to the evaluation table. Every metric has
a figure and a run date, published by `make evals` rather than typed. Jurisdiction purity, authority
purity, citation validity and citation groundedness are all 100%.

Then read the caveat above the table out loud, because it is the most honest thing on the site: the
numbers come from a demonstration corpus of nine documents, most questions abstain for want of
anything to answer from, and the abstention and coverage figures measure the machinery rather than
the product. Three metrics say *not measured*, with the reason — writing 170 reference answers about
what the law requires, from memory, is the fabrication this product exists to prevent.

Point at the row reading 33.6%. A demo that hid it would be a worse demo.

**7. Say what is not real.** The passage bodies are placeholders — no document has been ingested.
Everything else on the path ran: the refusal, the search, the scoring, the citation check, the
confidence and its reason. That is the honest line and it is stronger than pretending otherwise.

## If there is time: what it stores

Thirty seconds, from the footer link — `/privacy`, not in the header, because six destinations is
the whole product surface.

Two lists side by side. What is kept: a session id, a one-way fingerprint of the question, the
passage ids, the versions, the outcome, the timings — each with a reason. What is not kept: the
question text, the answer text, any note typed into the feedback box, any identity, any address.
Those are not empty fields, they are not columns.

The line worth saying: this is checkable rather than promised. Open `/audit` in the same browser —
a development route, refused outside a development environment — and show the column list, printed
from the schema that creates the table. There is no column for the question.

Then press **Discard this session**. There is no account to close; what tied one row to another was
the session id, it lived in that tab, and it is gone.

## If there is time: the corpus pipeline

Worth two minutes, because "no document has been ingested" invites the question of whether anything
could be. In a terminal:

    make ingest              # the real source set: 37 skips, nothing built, nothing guessed
    make ingest-samples      # fictional instruments, built end to end
    make ingest-records      # Layer 2: 17 sources, nothing loaded, no portal fetched
    make ingest-records-samples   # a fictional registry, loaded end to end

The first is the honest report — every source is skipped for want of a verified URL, and the run
says so rather than inventing one. The second builds a real index: open `corpus/samples/CHANGELOG.md`
and show the sections it found, with their chapter and section paths.

Then show that it notices when the law moves. Edit one line of
`corpus/samples/sample-instruments-act-2020.txt` and run:

    python scripts/refresh.py --manifest corpus/samples/manifest.json --index-dir data/index-samples

It reports the document as changed. With `--write` it rebuilds, retains the previous wording with an
effective-to date, and names the section in the changelog. That retention is the point: it is what
lets an answer say "the position on this has moved" rather than "I found nothing".

For the records layer, run `make ingest-records-samples` twice. The second run reports "0 added, 0
changed" — the snapshot diff working — and the store now answers `/api/v1/records/search`. The
portal in that fixture carries a licence, a readable file and a working link template, and is still
refused: the refusal is on how a source is accessed, not on whether a fetch would succeed.

## The offline-safe fallback

One command, and it needs nothing running but Node:

    make dev-frontend-mock      # or: cd frontend && VITE_SAHAYAK_API=mock npm run dev

The interface answers from the same fixture files the backend's fixture generator writes over, so
steps 1 to 5 look identical. Say so out loud if you use it — the interface looking identical is the
point of the switch, and letting an audience assume the API is up would be the one dishonest moment
in the demo.

What the fallback cannot show, and should not be attempted on it: the stage timings under the
answer are the mock's, the access log is empty because there is no server to have recorded anything,
and `/audit` will report that it could not reach the endpoint. If the API is down, do steps 1 to 5
and the evaluation table — which is a static file and works either way — and stop there.

## Rehearsal notes

Run twice, end to end, before showing it:

1. `make dev-backend` and `make dev-frontend` in two terminals. Wait for the footer to read
   "No sources indexed yet" rather than "unavailable right now" — that line is the fastest check
   that the proxy is working.
2. Ask the step 1 question and let it finish. If the answer arrives without a status line, the
   stream is not being read; restart the backend rather than talking over it.
3. Walk every abstention in the table. All five must reach the state the row names — an abstention
   that arrives with the wrong reason is worse than none, because the reason is the product.
4. `make evals` before the demo, so the run date on `/how-it-works` is recent. It takes seconds.

## What is deliberately not in the script

- Any evaluation number without its caveat. The purity figures are real; the coverage figures are
  a measurement of a nine-document fixture, and quoting the first set without the second would be
  the same overclaim the product is built to avoid.
- Any claim about what a provision says. The demo passages are placeholders and every card says so.
- Any suggestion that a source list is complete. `/sources` reports 0 of 37 documents fetched.
