# Phase 0 - Audit, baseline and map (no feature code)

Goal: know exactly what exists, so every later phase builds only what is missing.
Read: this file and docs/upgrade/PROGRESS.md. Skim only the headings of FLAGSHIP_CASE.md and SOURCES_TO_VERIFY.md.

## Steps
1. Archive old specs: move the root PROMPT.md and any older prompt or spec files to docs/upgrade/archive/. Don't read them in full; the capability list C1-C37 in PROGRESS.md already covers what they promised. If an older rules file (AGENTS.md, GEMINI.md, other .agents/rules files) conflicts with .agents/rules/ip-sakti-core.md, list the conflict and ask the user.
2. Map the repo with a depth-limited tree (exclude node_modules, .venv, dist, build, caches, and the contents of corpus/ and data/). Fill "Repo map" in PROGRESS.md with paths for every row.
3. Trace Check My Product end to end: form -> API -> the commercial product dataset (where it's stored, which modules read it, which UI shows "closest product"). List every file and field involved.
4. Baseline: run and record exact commands and counts (pass / fail / skip) for backend tests, frontend tests, typecheck, lint, locale check, evals, and a production build with the main JS bundle size (gzip). If a command doesn't exist, write "none". Don't fix failures now unless the app cannot start at all.
5. Capability coverage: mark every row C1-C37 DONE, PARTIAL or MISSING with a file pointer. Verify by reading code, not by trusting names or comments.
6. Check the SIH deck against the app and record findings:
   - Slides use both "IP-SAKTI" and "IP-SHAKTI"; the app must use IP-SAKTI.
   - Deck promises "10+ languages including Kannada": how many work today?
   - Deck lists "IP Status", "Trademark/Patent conflicts" and "Patent APIs": is any live registry integration real? If not, these must map to REAL_TIME_REGISTRY_REQUIRED or be removed from the UI.
   - OpenCV / NumPy: what uses them? If only the scan-badge login, plan to make them optional.
7. Write the KEEP / MODIFY / REMOVE / ADD map in PROGRESS.md, one line per item.
8. If no feature-flag module exists, add one (backend settings + frontend/src/config/features.ts) with: juryDemo, voice, helplineSim, documentIntel, adminInsights, scanBadgeLogin (false), publicAsk. No behaviour change yet.
9. List the top 5 risks (for example auth coupling, schema drift, retrieval code without tests).

## Do not
Change features, styles or tests in this phase.

## Gate
PROGRESS.md fully filled (repo map, baseline, coverage, map, risks, handoff). Commit "phase 0: audit". Report in 15 lines or fewer, then STOP and wait for the user to approve the map.
