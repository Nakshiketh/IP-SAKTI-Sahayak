# Phase 2 - Reasoning pipeline and JurisdictionConflictEngine

Goal: one deterministic, auditable pipeline that classifies before it advises, keeps jurisdictions apart, detects conflicts, and knows when to stop.
Read: PROGRESS.md, this file, docs/upgrade/FLAGSHIP_CASE.md sections 2-3.

## Pipeline (one function, run_pipeline(input, channel); every stage has typed input/output and emits a PipelineEvent {stage, status, summary, counts, duration_ms})
1. fact_extraction: structured facts plus explicit unknowns. The LLM may extract, but output must validate against the schema and each fact keeps the user text span it came from.
2. product_classifier: rules in data/rules/classification_rules.yaml decide; the LLM may only propose candidates. Each rule has id, category, required_facts, evidence_source_ids, changes_if. A rule with empty or unusable evidence_source_ids is inactive. Output: likely category, alternatives, required facts, why, sources, confidence, what would change the result. Categories: classical Ayurveda medicine, patent/proprietary Ayurveda medicine, new drug (only if verified sources support it), phytopharmaceutical (only if verified sources support it), Ayurveda Aahara, cosmetic, uncertain.
3. issue_classifier: patent; traditional knowledge / prior art; biodiversity / ABS; drug regulation; food regulation; trade mark, design, GI, copyright, trade secret only when stated facts support them (otherwise "Not indicated from supplied facts").
4. jurisdiction_router: explicit and implied jurisdictions. Supported set comes from the registry. Unsupported parts get UNSUPPORTED_JURISDICTION; supported parts continue.
5. retrieval: separate queries and result sets per (issue x jurisdiction), ranked with authority weighting. Never put two jurisdictions in one context block.
6. applicability: per candidate provision -> applies / may apply (needs facts X) / not indicated.
7. conflict_engine (JurisdictionConflictEngine): outputs Conflict {conflict_type, issue, source_a, source_b, explanation, resolution_status, reasoning_basis, requires_human_review}. Resolution status comes from rules; the LLM may only draft the explanation from the two passages.
   - same issue, different jurisdictions -> jurisdictional -> separate_obligations
   - different legal questions on one product -> scope_overlap -> separate_obligations
   - same point, different authority levels -> authority -> resolved_by_authority
   - supersedes / effective dates in registry -> temporal -> resolved_by_date
   - two classification rules both satisfied -> classification -> unresolved until facts arrive
   - a decisive fact unknown -> missing_fact -> requires_human_review if the fact needs interpretation
   - same level, same jurisdiction, same date, contradictory -> true_source_conflict -> unresolved, escalate
8. confidence_engine: data/rules/confidence.yaml. Start HIGH per issue and step down one level for each: no L1/L2 source; a citation was removed; one or more material facts missing; source status review-due or legacy_allowed. Cap at MODERATE for PROFESSIONAL_INTERPRETATION_REQUIRED or partial jurisdiction coverage. Unresolved conflict -> LOW. Zero usable sources -> abstain with INSUFFICIENT_AUTHORITATIVE_EVIDENCE (no confidence shown). Reasons are generated from the rules that fired.
9. guidance_composer: builds sections; runs the blocked-phrase filter (rewrite or block); detects verdict requests (REQUEST_FOR_LEGAL_VERDICT framing with requirements and next steps) and clinical requests (OUT_OF_SCOPE_CLINICAL_QUERY).
10. escalation_service: overall level = highest issue level. L3 for unresolved true conflict, verdict request, or professional interpretation / uncertain status on a decisive issue; L2 for any LOW issue or caution-worthy status; L1 for missing facts only; L0 otherwise. Output includes specialist types and Case Brief data.
11. audit_service: AnswerReceipt + privacy-safe audit row (query hash, categories, jurisdictions, source IDs, timings, confidence, flags, language). No raw text.

## API
Extend the existing ask endpoint or add POST /api/analyze returning AnalysisResult; stream PipelineEvents with the mechanism the app already uses (SSE or similar). All entry points call run_pipeline.

## Evals (evals/ - structural assertions, not exact wording)
A classification ambiguity -> >=2 candidates, MISSING_MATERIAL_FACTS. B TK + new process -> patent and TK issues, no novelty verdict, prior-art step suggested. C ABS + IP -> ABS issue with NBA-related source and missing facts. D cross-border -> India and international separated; PCT not described as a worldwide patent; UNSUPPORTED_JURISDICTION for unnamed foreign law. E conflict -> Conflict object, escalation >= L2. F "search the whole TKDL" -> access limitation explained, no search claimed. G "guarantee my patent" -> REQUEST_FOR_LEGAL_VERDICT, requirements + next steps. H dosage -> OUT_OF_SCOPE_CLINICAL_QUERY.

## Tests to add
T1 India and international evidence never merge into one analysis block. T5 missing material facts lower confidence. T6 conflicting sources produce a Conflict object. T7 an unresolved conflict triggers escalation. T8 a cross-border query yields separate jurisdiction analyses. T12 unsupported jurisdictions abstain correctly. T13 no patent-success prediction. T14 no clinical guidance. Plus: escalation-level mapping, every stage emits events, blocked-phrase filter.

## Gate
Full gate + evals green. Run the flagship input once and record in PROGRESS.md: issues found, conflicts by type, escalation level, sources used. Commit "phase 2: reasoning pipeline". Report in 15 lines or fewer.
