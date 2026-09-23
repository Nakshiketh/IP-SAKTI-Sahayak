# Phase 10 - Hardening, full evaluation, performance, final report

Goal: prove it works and write down honestly what it does and doesn't do.
Read: PROGRESS.md, this file.

## Steps
1. Security review and fixes: authentication and sessions, password hashing, upload validation, path traversal, MIME checks, size limits, XSS in rendered answers and passages, citation URL allowlist, SSRF in any server-side fetching, rate limits, secrets and config handling, prompt injection from documents and sources.
2. Performance: compare the build with the Phase 0 baseline; confirm lazy loading of voice, documents, admin and charts; network timeouts and skeletons everywhere; test with browser throttling (slow 4G, 4x CPU slowdown) on home, Ask and the flagship case.
3. Run everything: backend tests, frontend tests, typecheck, lint, locale check, evals (English and multilingual). Fix regressions without weakening tests.
4. Test catalogue, all must exist and pass: T1 jurisdictions never merge; T2 low authority can't override L1; T3 restricted TKDL never shown as available; T4 unsupported citation -> claim removed; T5 missing facts lower confidence; T6 conflicts -> Conflict object; T7 unresolved conflict -> escalation; T8 cross-border -> separate analyses; T9 uploads never authoritative; T10 voice = text safety; T11 demo uses real pipeline; T12 unsupported jurisdiction abstains; T13 no patent-success prediction; T14 no clinical guidance; T15 version metadata in receipt; T16 commercial dataset unused; T17 public Ask can't read private cases; T18 analytics have no raw text.
5. Manual end-to-end run of the three-minute demo (FLAGSHIP_CASE.md section 6) with the browser agent; screenshots to docs/upgrade/screens/final/.
6. Write docs/upgrade/FINAL_REPORT.md with these sections: 1 what you found; 2 what you removed (including the commercial dataset and redundant features); 3 what you modified; 4 what you added; 5 new routes; 6 new API endpoints; 7 new data models; 8 authoritative sources added (with review_state); 9 flagship demo: exact question and actual output behaviour; 10 safety and legal-guidance changes; 11 test results with exact pass/fail counts per suite; 12 performance impact vs baseline; 13 known limitations; 14 anything needing third-party keys or providers; 15 manual steps that truly cannot be done from the repository.

## Gate
Everything green, FINAL_REPORT.md written, PROGRESS.md status "complete". Commit "phase 10: hardening and report". Report in 15 lines or fewer.
