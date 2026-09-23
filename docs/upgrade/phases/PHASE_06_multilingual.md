# Phase 6 - Multilingual: Indian and international languages

Goal: people can use IP-SAKTI in their own language without the legal meaning, citations or safety behaviour changing, and without pretending a translation is better than it is.
Read: PROGRESS.md (i18n row of the repo map), this file.

## Language scope and tiers
- Tier 1 (UI reviewed by the team, answers supported): English (en), Hindi (hi), Telugu (te).
- Tier 2 Indian (machine-drafted, labelled "Beta translation"): Tamil (ta), Kannada (kn), Malayalam (ml), Bengali (bn), Marathi (mr), Gujarati (gu), Punjabi (pa), Odia (or), Urdu (ur, right-to-left).
- Tier 2 international (machine-drafted, "Beta translation"): the non-English PCT publication languages, which match the audiences of international filing - Arabic (ar, right-to-left), Chinese Simplified (zh-Hans), French (fr), German (de), Japanese (ja), Korean (ko), Portuguese (pt), Russian (ru), Spanish (es).
- A language appears in the switcher only if it passes the locale checks with at least 95% key coverage. Otherwise it stays hidden. The switcher shows native names and the tier label.

## Build
1. i18n: keep the existing library; if none, use react-i18next. Namespaces per route, lazy-loaded; never bundle all locales into first load.
2. Files: frontend/src/locales/{lang}/{namespace}.json and locales.meta.json (code, native name, dir, script, tier, reviewed_by, coverage).
3. scripts/i18n/translate_locales.py: reads English source files and calls the project's configured LLM provider (key from env) with glossary constraints: keep acronyms (PCT, TKDL, NBA, ABS, WIPO, FSSAI, AYUSH) and instrument names ("Patents Act, 1970, Section 3(p)") in their original form with a translated gloss; preserve ICU placeholders; write drafts with tier machine. No key -> skip cleanly and leave those languages hidden. Never hand-type bulk translations in chat.
4. scripts/i18n/check_locales: key parity, placeholder parity, no empty values, English leakage limit for Tier 1, and a scan for hard-coded JSX strings (lint rule). Add a pseudo-locale (expanded, accented text) to catch overflow and a pseudo right-to-left locale.
5. Right-to-left: set lang and dir on <html>; switch directional Tailwind classes to logical ones (ms/me/ps/pe/start/end) or rtl: variants; mirror only direction-implying icons; never flip logos, charts or the palm-leaf artwork. Test the layout in ar and ur.
6. Fonts: Noto families per script via @font-face with unicode-range and font-display: swap, loaded only when that locale is active. Keep the existing Latin fonts.
7. Formatting: dates and numbers through Intl; en-IN as the default; no hard-coded date formats.
8. Answers in the user's language, with verification intact:
   - Detect the input language (user can override).
   - Retrieve against the official-language corpus with an English pivot query; keep the original question.
   - Generate and citation-verify in English first, then translate the verified answer with a translation step that may not add claims.
   - Invariant check after translation: section numbers, years, numbers, source IDs and acronyms must survive. If the check fails, show the English answer with the note "Translation could not be verified; showing English."
   - Source quotations stay in the official language; an optional "Unofficial translation" toggle is clearly labelled.
   - The blocked-phrase filter runs on translated text too (translate the blocked list per language).
   - Switching language keeps the case_id and context. It re-renders existing results; it does not silently re-run the analysis.
9. Glossary and static source metadata (titles, authority names) get locale files through the same script.
10. Record a runtime capability map of browser speech recognition and synthesis per locale for Phase 8.

## Evals and tests to add
Multilingual eval set: classes A-H from Phase 2 in hi, te, ar and es at minimum. Assert the same abstention codes, escalation levels and "no blocked phrases" as the English results - language must never change the safety outcome. Tests: locale check in CI; right-to-left snapshot for ar; the switch keeps case_id; invariant-check fallback.

## Gate
Full gate green. Browser agent screenshots of home, flagship result and Case Brief in en, hi, te and ar at 360px and 1280px (docs/upgrade/screens/phase6/), no layout breaks. PROGRESS.md: languages shown vs hidden and why. Commit "phase 6: multilingual". Report in 15 lines or fewer.
