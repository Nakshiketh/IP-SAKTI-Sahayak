# Copy style

How this product writes. Short, because a style guide nobody reads changes nothing.

The reader is a vaidya, a founder with eleven other jobs, or a student. They are not
lawyers, they are not stupid, and they are busy. Write for someone intelligent who
has never seen this vocabulary before.

## Sentences

- **Sentence case** everywhere: headings, buttons, labels, table columns. Title Case
  On Every Word reads as a brochure.
- **Active voice.** "The office examines the application", not "the application is
  examined by the office" — unless the actor genuinely does not matter.
- **Expand an acronym the first time it appears on a screen**: "access and benefit
  sharing (ABS)". After that, the short form. The glossary carries the rest.
- **Everyday words where one exists.** Not *utilise*, *commence*, *pursuant to*,
  *in order to*. Legal terms of art stay: *prior art* is prior art.
- **Say the number or say nothing.** "Several sources" is filler; "eleven sources" is
  information. If the number is unknown, say what is unknown.

## Buttons and actions

- A button says **what happens when you press it**: "Prepare for expert review",
  "Run analysis again", "Copy summary". Not "Submit", "OK", "Continue".
- **One action keeps one name** for its whole life. If it is "Prepare for expert
  review" on the answer, it is not "Case brief" in the menu and "Export" in the
  drawer. A renamed action reads as a different action.
- Destructive actions name the thing: "Delete this case", not "Delete".

## Errors

- Say **what happened** and **what to do**. "The search took too long. Try again, or
  ask a shorter question."
- **Do not apologise.** "Sorry, something went wrong" tells the reader nothing and
  spends their attention on the product's feelings.
- **Never blame the reader.** Not "invalid input" — say which field and what it needs.
- Show what did succeed. A partial failure that reports only the failure throws away
  work the reader already waited for.

## Empty states

- Invite the action that fills them: "Ask a question to see an answer here."
- An empty state is not an apology and not a joke.

## What this product must not say

These are not stylistic preferences. Each one is a claim the product cannot support,
and the phrase filter in `backend/app/reasoning/phrases.py` drops or rewrites several
of them in generated text.

- **No prediction of an outcome.** Never "will be granted", "will be approved",
  "guaranteed", "cannot be refused". The office decides; we do not know.
- **No verdict on novelty or patentability.** Not "your formulation is novel", not
  "potentially novel". Say what was searched and what was found.
- **No claim of completeness.** Not "100% accurate", "complete database", "all Indian
  law". Say what the corpus holds and when it was read.
- **No official endorsement.** Not "government-approved", "official portal",
  "authorised by". This product is not.
- **No replacement of professionals.** Not "no lawyer needed", "replaces a patent
  agent". The whole design points the other way.
- **No claim to have searched a source we did not.** Especially the restricted TKDL.

## Uncertainty

Uncertainty is content, not an apology. Write it plainly and put it where it matters:

- "This depends on whether your formula is in a classical text. You have not said."
- "Two sources of equal standing disagree. A professional should decide."

Not "we may not be able to fully determine", which says the same thing while sounding
like it is avoiding something.

## Numbers and dates

- Dates as `2026-09-22` in receipts and tables, where they are data. In a sentence,
  "22 September 2026".
- A score shown to a reader is labelled with what it measures. The rerank score is
  "how well this passage matched your words", never "confidence".
