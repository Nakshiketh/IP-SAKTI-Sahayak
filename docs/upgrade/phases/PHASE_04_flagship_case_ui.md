# Phase 4 - Flagship Complex Case, Jury Demo and escalation UI (Milestone A: jury-ready)

Goal: in about 3 minutes a jury member sees a hard multi-jurisdiction case handled end to end, and sees exactly where guidance ends.
Read: PROGRESS.md, this file, docs/upgrade/FLAGSHIP_CASE.md.

## Build
1. Seed data/demo/flagship_case.json from FLAGSHIP_CASE.md section 1. Add a dev-only demo reset (flag juryDemo) that restores deterministic demo data.
2. Home: one elegant "Explore a Complex IP Case" entry in the existing style (not a dashboard). Jury Demo panel with two buttons: "Run complex case" and "Clear and ask my own question". Running calls the real API; failures show the real error.
3. Pipeline activity: render real PipelineEvents in the existing status component, for example "Classifying product - 2 possible categories", "Searching official sources - 11 passages", "Checking conflicts - 1 scope overlap". No invented steps or timings.
4. Result page: sections in the order of FLAGSHIP_CASE.md section 4, built from existing components. The "Where guidance ends" block directly answers jury recommendation 2: what we can say, what we cannot conclude, who should review and why, with the escalation level (L0-L3) shown as a short plain-language stepper.
5. Conflict and overlap matrix (issue | India | international | relationship | resolution status) and source comparison matrix (issue | jurisdiction | authority | provision | why relevant | status | last reviewed). On mobile they become stacked cards.
6. IP Protection Map from Phase 3 data: six branches with status chips; tapping one shows why, sources, facts required, next step.
7. "Why am I seeing this?" provenance drawer (bottom sheet on mobile): claim -> highlighted passage -> document -> authority level -> jurisdiction -> publication / effective / review dates -> retrieval score (labelled "ranking signal, not confidence") -> citation verification result. Evidence only, never hidden model reasoning.
8. Answer Receipt (collapsed): case/query ID, timestamp, corpus version, source IDs, jurisdictions, confidence by issue, verification status, claims removed, safety flags, source review dates.
9. "Prepare for Expert Review" -> Case Brief page: case ID, timestamp, user's facts, detected language, jurisdictions, classification hypothesis, issues, source excerpts, citations, conflicts, missing facts, confidence by issue, unresolved questions, recommended specialist types, audit info. Print stylesheet (browser print to PDF, no heavy PDF library), "Copy summary", "Export JSON", "Save to my cases" when logged in.

## Tests to add
T11: the demo button makes a real call to the analysis endpoint; no hard-coded answer exists in the bundle. End-to-end test (Playwright if present) of the flow in FLAGSHIP_CASE.md section 6, asserting the section 5 acceptance list. Case Brief contains all listed fields.

## Gate
Full gate green. Run the demo manually with the browser agent at 1280px and 360px; save screenshots to docs/upgrade/screens/phase4/; record the actual output (sections shown, sources, conflicts by type, escalation level) in PROGRESS.md. Commit "phase 4: flagship case". Report in 15 lines or fewer.
