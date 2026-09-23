# Flagship case: "Explore a Complex IP Case"

Used in Phases 2, 4 and 10. It answers jury recommendation 1 with a real, reproducible run of the actual pipeline, and recommendation 2 by showing exactly where guidance ends and expert review begins.

## 1. Demo input
Store as data/demo/flagship_case.json with fields: id "flagship-ashwagandha-shilajit", language "en", question (below). The pipeline must extract the facts itself; never store a pre-written answer.

> We are an Indian Ayurveda startup. We have developed an oral formulation combining Ashwagandha and Shilajit. The ingredients and their traditional uses may already be documented in classical texts. We believe our innovation is a modified extraction and standardisation process with defined composition parameters that may give new technical characteristics. We want to: (1) sell it in India; (2) know whether it is a classical Ayurvedic drug, a proprietary Ayurvedic medicine, an Ayurveda Aahara product or something else; (3) explore patent protection without assuming it is novel; (4) understand traditional-knowledge and prior-art issues; (5) know whether biodiversity or access-and-benefit-sharing obligations apply; (6) understand what we must disclose about biological material or traditional knowledge in an IP application; (7) later file internationally. What should we look at, and in what order?

## 2. What the pipeline should find (for tests: assert structure, never exact wording)
- Facts stated: Indian startup; oral product; ingredients Ashwagandha + Shilajit; possible classical documentation; claimed innovation in process and composition parameters; India market first; international filing later.
- Deliberately missing (must appear as missing facts / next questions): intended claims (therapeutic vs nutritional); whether it follows a First Schedule book formulation; dosage form; source and origin of raw material (cultivated or wild, where); whether Shilajit counts as a biological resource; shareholding or entity details if legally relevant; target countries.
- Issues: product classification; patent (process vs composition, TK-related exclusions); traditional knowledge / prior art (public TKDL only); biodiversity / ABS; IP disclosure of biological material; international filing strategy.
- Trademark, design, GI, copyright: "Not indicated from supplied facts" (no brand, shape or origin claim was given). This proves the system does not over-reach.

## 3. Real overlap and conflict examples (verify each before use)
Rule: an example appears in the demo only if the provisions behind it are usable sources in the registry. If it cannot be verified, drop it and log that in PROGRESS.md. These are research pointers, not facts to cite.

| # | Conflict type -> expected resolution | What the user sees | Verify in |
|---|---|---|---|
| 1 | scope_overlap -> separate_obligations | Patent law, ASU drug licensing and biodiversity law answer different legal questions; all may apply at the same time. | Patents Act 1970; Drugs Rules 1945 (Rule 158B); Biological Diversity Act 2002 |
| 2 | temporal -> resolved_by_date | When NBA approval is needed in relation to an IP application: wording before and after the Biological Diversity (Amendment) Act, 2023, shown side by side with dates. | BD Act s.6, original and as amended in 2023 |
| 3 | classification -> unresolved (missing facts) | ASU proprietary medicine vs Ayurveda Aahara depends on claims, composition and whether a First Schedule book formulation is followed. | Drugs and Cosmetics Act 1940 definitions; Drugs Rules; FSS (Ayurveda Aahara) Regulations 2022 |
| 4 | jurisdictional -> separate_obligations | India: TK and admixture exclusions, biological-material disclosure, foreign-filing permission for residents. International: PCT is a filing procedure, patentability is decided nationally, and PCT is not a worldwide patent. | Patents Act s.3(e), 3(p), 10(4)(d)(ii)(D), 39; PCT; Paris Convention |
| 5 | authority / status -> status surfaced | WIPO Treaty on IP, Genetic Resources and Associated TK: adopted vs in force vs India's status, exactly as verified. Never "binding". | WIPO treaty status page (with status_checked_at) |
| 6 | source_status_uncertain (optional) | ASU advertisement rule (Drugs Rules, Rule 170): 2024 omission notification and later court proceedings. Use only if the current status can be confirmed from an official source; otherwise show SOURCE_STATUS_UNCERTAIN and L3. | e-Gazette; official Ministry notices; court orders |
| 7 | missing_fact -> requires_human_review | Whether Shilajit (a mineral-organic exudate) is a "biological resource", and whether a standardised extract is a "value-added product" under the BD Act. Never decide; flag PROFESSIONAL_INTERPRETATION_REQUIRED. | BD Act definitions (s.2) |
| 8 | unsupported jurisdiction | "File internationally later" with no target country: target-country national law is not in the corpus, so UNSUPPORTED_JURISDICTION applies to that part only. | none |

Expected overall escalation: L3 (items 3, 6, 7 need professional interpretation). Specialist types: AYUSH regulatory professional, IP/patent professional, biodiversity/ABS specialist.

## 4. Result sections, in reading order (easiest first)
1. In short (3 plain sentences) + escalation level + discreet guidance notice
2. Case at a glance (facts found, facts missing)
3. Where guidance ends: what we can say / what we cannot conclude / who should review and why
4. Product classification: likely category, alternatives, required facts, what would change the result, sources, confidence
5. Issues: IP, Traditional knowledge, Biodiversity/ABS, Regulation (tabs on desktop, accordion on mobile)
6. India | International side by side (never merged)
7. Conflict and overlap matrix: issue, India, international, relationship, resolution status
8. Source comparison matrix: issue, jurisdiction, authority, provision, why relevant, status, last reviewed
9. Confidence by issue with reasons
10. Next questions for you, next actions
11. Official sources + Answer Receipt (collapsed)
12. Button: Prepare for Expert Review

## 5. Automated acceptance (Phase 4)
- The demo button triggers a network call to the real analysis endpoint (no hard-coded HTML or JSON answer).
- Response has: >=2 classification candidates; separate India and international analyses; >=1 conflict with resolution separate_obligations; every conflict carries source_a/source_b IDs that exist in the registry; no blocked verdict phrases; escalation level >= L2; AnswerReceipt with corpus_version and source review dates.
- If a needed source is missing, the UI shows the real gap (abstention code), not a filler answer.

## 6. Three-minute jury talk track
- 0:00 Home -> "Explore a Complex IP Case" -> Run. "This is a real run on official sources, not a recording."
- 0:15 Pipeline activity: real steps (facts, classification, retrieval, verification, conflicts).
- 0:35 In short + escalation level: "The system tells you where guidance ends."
- 0:55 Classification: two candidates and the facts that decide between them.
- 1:15 India | International: "PCT is a filing route, not a worldwide patent."
- 1:35 Conflict matrix: one overlap (separate obligations), one old-vs-new rule (resolved by date), one unresolved (escalated).
- 2:00 Tap a citation -> "Why am I seeing this?": passage, authority, dates, verification.
- 2:15 Confidence by issue with reasons; "What we cannot conclude": novelty, restricted TKDL.
- 2:30 Prepare for Expert Review -> Case Brief.
- 2:45 Switch to Hindi or Telugu (case stays), ask a voice follow-up.
- 2:55 Admin insight: anonymised knowledge gaps (labelled demo data).
