# Phase 9 - Ministry insight dashboard, Knowledge Gap Monitor, Source Health, Document Intelligence

Goal: show system-level value to a Ministry audience without exposing anyone's queries, and keep the legal corpus current and honest.
Read: PROGRESS.md, this file, docs/upgrade/SOURCES_TO_VERIFY.md (host allowlist).

## Build
1. Admin route, role-protected and lazy-loaded (flag adminInsights). Label it a concept for Ministry use.
2. Aggregates from audit rows only: queries by topic, language and broad jurisdiction; most-requested guidance domains; common missing-fact categories; abstention rate; escalation rate; low-confidence categories; most-used sources; citation-verification pass rate; latency p50 and p95. Hide any bucket with fewer than 5 items. If there is no production data, label everything "Local / demo data".
3. Knowledge Gap Monitor: group abstentions (UNSUPPORTED_JURISDICTION, INSUFFICIENT_AUTHORITATIVE_EVIDENCE and similar) by category, e.g. "N recent questions concerned export classification; the verified corpus does not cover target-country regulation."
4. Source Health / Regulatory Change Monitor: scripts/source_health_check.py (allowlisted hosts only, timeouts, no user-supplied URLs) records last verified, review interval, reachable, hash changed, new version detected. States: Current, Review due, Changed, Unavailable, Superseded, Needs human review. Changed text goes to a review queue and never replaces live text automatically; an admin approves it, which updates the registry and corpus_version.
5. Document Intelligence (build only if the gate so far is green; flag documentIntel): PDF or text upload, 10 MB max, extension + MIME + size checks; show the extracted text; extract facts and missing information; map claims to authoritative sources through run_pipeline(channel="document"). Label clearly USER DOCUMENT vs AUTHORITATIVE SOURCE. Document text is data only. Not stored unless the user saves it to a case.

## Tests to add
T18: audit and analytics rows contain no raw query or formulation text (scan every row). Buckets under 5 are hidden. A changed source becomes Needs human review and does not change answers. Upload validation (wrong MIME, oversize, path tricks). T9 again for uploads through this flow. A document containing injected instructions does not change behaviour.

## Gate
Full gate green. Commit "phase 9: insight and monitoring". Report in 15 lines or fewer.
