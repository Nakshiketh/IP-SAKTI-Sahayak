# PART 6 — Review Gate

Run after Phases 1, 3, 4, 7 and 8. One extra turn each; the highest-value step in the build.

---

Review the phase you just completed against `AGENTS.md` and `docs/BANNED.md` before I continue.
Produce a report in four parts. Do not fix anything until I have read it.

## 1. AI-LOOK AUDIT

Go through the banned visual list and the banned copy list. For each item state whether it appears
anywhere in what you built, quoting the offending code or copy. Be adversarial — assume it is there
and go looking. If you find none, name the three you checked most carefully and say why they were
tempting.

## 2. SIMPLICITY AUDIT

- How many decisions must a first-time user make before getting an answer? Target 0.
- How many taps from landing to a visible source? Target 2.
- List every user-facing string containing: RAG, retrieval, embedding, rerank, namespace, chunk,
  vector, corpus, pipeline, LLM, module, workflow, engine. Any hit outside `/how-it-works` is a defect.
- Screenshot at 360px width. Do the answer, its confidence and one source card read without pinching?
  Attach it.

## 3. LAYOUT VARIETY

List each section and its structural pattern. If more than two share "heading + subheading + three
equal cards", say so and propose a different structure for each repeat, chosen from what the content
actually is — table, sequence, worked example, comparison, single statement.

## 4. HONESTY AUDIT

List every claim the interface makes about capability. For each, name the file and function performing
it. Any claim without an implementation is a defect: build it or move it under a "Planned" heading.

Then wait. I will tell you which items to fix.

---

# PART 7 — Pre-demo checklist

- [ ] Grep the whole repo for `SIH`, `hackathon`, `problem statement`, `26045`, `Ayush`, `AIIA`,
      `submission`, `team`. Zero hits in anything shipped, including README, page titles, meta tags and
      the favicon manifest.
- [ ] No government emblem, seal or ministry logo anywhere, including source cards — text names only.
- [ ] Every citation resolves to a real fetched document or is visibly marked demo.
- [ ] `jurisdiction_purity` and `authority_purity` both 100%.
- [ ] The jurisdiction toggle produces two visibly different answer sets on the same question.
- [ ] An abstention with related records present still reads as an abstention.
- [ ] No fetcher exists for any `portal_link_only` source — grep to confirm.
- [ ] The prior-art banner is present and cannot be dismissed.
- [ ] Nothing anywhere states or implies a novelty conclusion.
- [ ] Every ingested source displays its licence and attribution text verbatim.
- [ ] At least one live abstention in the demo path — show it deliberately, it is a feature.
- [ ] Classification reaches a class in under 8 questions.
- [ ] Eval numbers are on the site and current.
- [ ] The 60-second test passes: someone who knows nothing gets an answer and opens a source in under
      a minute, with no explanation from you.
- [ ] `docs/DEMO.md` rehearsed twice, end to end, with an offline-safe fallback ready.
