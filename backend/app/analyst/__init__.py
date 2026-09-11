"""The invention analyst: a conversation about one invention, and the evidence it is compared with.

A third surface, beside the question pipeline (`app.services`) and the records layer
(`app.records`), and kept apart from both in the same way they are kept apart from
each other:

    reader        a message becomes a structured change to the invention
    dialogue      what is still missing, and the one question worth asking next
    products      commercial products, from a fetched and dated reference set
    knowledge     traditional-use vocabulary and classical formulations
    prior_art     filed and granted records, from the records store
    assess        a preliminary indicator, with every reason it rests on
    service       one turn of the conversation, streamed stage by stage
    store         conversations, messages and analysis history, per account

Three rules hold everywhere in this package.

1. **Retrieval and interpretation are different fields.** Every finding carries the
   evidence it was built from; every judgement is a reason code marked
   ``interpretation``. The interface renders them differently and never merges them.
2. **Nothing is found that was not looked for.** A source that was not searched is
   reported as not searched — never as "nothing found".
3. **A reader may restructure what the inventor wrote, and nothing else.** Whichever
   reader runs, an ingredient or a quantity that does not appear in the message is
   dropped before it reaches the invention.
"""
