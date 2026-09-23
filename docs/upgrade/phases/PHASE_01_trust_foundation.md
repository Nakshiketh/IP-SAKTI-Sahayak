# Phase 1 - Trust foundation: source registry, provenance, citation checks, injection defence

Goal: answers can only use official sources with known provenance, and every sentence can be traced to a passage.
Read: PROGRESS.md, this file, docs/upgrade/SOURCES_TO_VERIFY.md.

## Build
1. SourceRecord: SQLite table + Pydantic model + TypeScript type. Migrate the existing corpus metadata table if there is one; don't duplicate it.
   Fields: source_id, title, authority, jurisdiction, document_type, legal_area[], authority_level (1-5), official_url, publication_date, effective_date, amendment_status, retrieved_at, reviewed_at, reviewed_by, version, sha256, supersedes, superseded_by, primary_or_secondary, citation_allowed, full_text_available, access_restriction, review_state, legacy_allowed, notes.
   Treaty-only fields: adopted_date, entry_into_force_status, india_status, status_source_url, status_checked_at.
   Unknown values stay null and display as "unknown". Never invent a date or status.
2. review_state values:
   - VERIFIED_OFFICIAL: text fetched from an allowlisted official host, hash stored, provision labels parsed from the text. Usable in answers.
   - HUMAN_REVIEWED: VERIFIED_OFFICIAL plus a team member confirmed it (reviewed_by, reviewed_at). Usable.
   - NEEDS_REVIEW, UNVERIFIED, SUPERSEDED, UNAVAILABLE: not usable, visible to admins only.
   - Demo continuity: an existing corpus document that clearly came from an official source but can't be re-fetched right now may keep legacy_allowed = true. It stays usable, shows "provenance pending review" in the Answer Receipt, and caps confidence for its issue at MODERATE.
3. scripts/registry_backfill.py: register every existing corpus document, compute sha256, fill only what the document or its official page states explicitly.
4. Gap pass against SOURCES_TO_VERIFY.md: mark each target IN_CORPUS, FETCHABLE or MISSING. Ingest FETCHABLE items only from allowlisted hosts (store official text, hash, retrieved_at). Never paraphrase law into the corpus. Put MISSING items in PROGRESS.md under "Manual steps for the team".
5. scripts/registry_review.py: a small CLI for the team to list sources needing review and mark them HUMAN_REVIEWED after checking the text against the official PDF.
6. Chunk provenance: every chunk carries source_id, provision label (only if it literally appears in the text, such as "3(p)"), page and character span. Never generate provision labels.
7. Citation verifier: for each (claim, cited chunk) pair, check support with the existing method, or lexical overlap plus an entailment check restricted to that passage. Unsupported claims are removed and recorded in AnswerReceipt.claims_removed.
8. Injection defence: pass retrieved and uploaded text inside clearly delimited data blocks, labelled as evidence only. Neutralise instruction-like strings in logs. Add a poisoned test chunk.
9. Shared schemas (Pydantic + TypeScript; reuse existing equivalents): SourceRecord, Evidence, Conflict, ConfidenceAssessment, Uncertainty, Abstention, EscalationStatus, AnswerReceipt, PipelineEvent.
10. corpus_version: a hash over (source_id, sha256, review_state) of usable sources. Expose it through the existing meta or health endpoint (or GET /api/meta) and in every AnswerReceipt.

## Tests to add
- T2: an L3 or L5 passage cannot override an L1 provision on the same point.
- T3: no response or UI string says the restricted TKDL database was searched or is available (response check + string scan of locales and components).
- T4: a claim whose citation doesn't support it is removed and counted.
- T9: a user upload can never be stored as an authoritative SourceRecord.
- T15: source version and review dates reach the AnswerReceipt.
- Injection: a chunk containing "ignore previous instructions" does not change behaviour.

## Gate
Full gate green. PROGRESS.md: registry counts by review_state, missing sources, coverage rows C3, C4, C16 updated. Commit "phase 1: trust foundation". Report in 15 lines or fewer.
