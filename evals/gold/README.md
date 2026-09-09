# The gold set

One JSONL file per part of the composition the build document asks for. 170 cases in total.

| File | Cases | What it covers |
| --- | --- | --- |
| `india.jsonl` | 60 | Indian intellectual property, drug and food regulation, and access and benefit sharing |
| `international.jsonl` | 30 | UK, EU, US and the treaties |
| `cross-border.jsonl` | 15 | Questions naming both sides, which must produce two answer sets and never one |
| `unanswerable.jsonl` | 15 | Deliberately out of scope, or outside what the sources cover |
| `multilingual.jsonl` | 25 | Five each in Hindi, Marathi, Bengali, Tamil and Telugu |
| `records.jsonl` | 25 | The records regression set: 10 where records should appear, 10 where a record exists and the system must still abstain, 5 asking for a novelty verdict |

## What a case carries, and what it deliberately does not

Every field is a statement about the *question*, not about the law. Which rights a question touches,
which jurisdiction it belongs in, whether it should be answered or declined, which instrument an
answer would have to rest on — those can be written down without asserting what any instrument says.

`reference_answer` is null on every case, and `reference_answer_status` says why. Writing 170 model
answers stating what Indian and international law requires would be exactly the fabrication this
product exists to prevent: nobody has read the sources, and an answer written from memory is a guess
however carefully it is hedged. So `answer_accuracy` is reported as not measured, with that as the
reason, and the metrics that *can* be computed from a run are computed for real.

The same applies to `must_cite_document_ids`. Naming the Patents Act as the instrument an answer
about patentability would rest on is a claim about relevance, not about content, and it is checkable
the moment that document is ingested.

## Fields

    id                        stable, and referenced by the report
    question                  what a reader would type
    language                  ISO code of the question, not of the answer
    jurisdiction              IN | INTL — which namespace this belongs in
    expected_behaviour        answer | abstain | clarify
    expected_abstain_reason   set where the behaviour is abstain, and checkable
    expected_product_class    null where the question does not settle one
    expected_ip_rights        rights the question touches
    expected_regulatory_areas areas the question touches
    must_cite_document_ids    instruments an answer would have to rest on
    must_not_claim            phrases an answer must never contain
    expected_related_records  some | none — for the records regression set
    reference_answer          null; see above
    notes                     why this case is in the set
