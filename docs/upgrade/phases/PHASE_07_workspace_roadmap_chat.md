# Phase 7 - Case Workspace, Compliance Roadmap, Ask Sahayak upgrade, feedback

Goal: users can build a case over time, see why the assessment changed, and follow an evidence-grounded checklist, all from one assistant.
Read: PROGRESS.md, this file.

## Build
1. Models + API: Case, CaseFact (with change history), CaseRun (snapshot of AnalysisResult), ActionItem, Escalation. Endpoints for create, read, update facts, re-run, archive and delete (delete removes facts and runs for real). Workspace requires login.
2. Workspace UI: tabs on desktop, accordion on mobile, progressive disclosure: Overview, Product, Classification, IP, Traditional Knowledge, Biodiversity/ABS, Regulation, Jurisdictions, Evidence, Conflicts, Actions, Audit. Every finding links to its evidence.
3. Change explanation: diff facts between runs and show "Assessment updated because: intended use changed from X to Y", plus which findings changed.
4. Your Regulatory and IP Roadmap: tasks generated from issues and sources, e.g. confirm classification, verify formulation references, document resource origin, determine ABS applicability, structured prior-art search, review patent exclusions and requirements, decide the IP protection mix, prepare regulatory documents, check target-market requirements, seek professional review for open points. Each task shows why, source, status, dependency and user action. Statuses: Not started, Needs information, Ready, Requires expert review, Completed by user. Never a "filed" or "approved" status.
5. Ask Sahayak (the only chatbot): case-aware follow-ups attached to case_id; evidence cards; clickable citations opening the provenance drawer; jurisdiction and issue badges; confidence; conflict alerts; "Add to roadmap"; "Prepare for Expert Review". Delete any duplicate chatbot implementation found in Phase 0.
6. Feedback after answers: Yes / Partly / No, plus optional "Which part needs clarification?". Stored separately with no user ID; never used for automatic training.

## Tests to add
T17: public Ask can never read saved private cases. Fact change -> re-run -> change explanation lists the changed fact. Delete removes facts and runs. Roadmap never produces a filed or approved status. Feedback rows contain no user ID.

## Gate
Full gate green. Commit "phase 7: workspace". Report in 15 lines or fewer.
