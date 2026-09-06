# Scripts

- `gen_schema.py` — regenerates `schemas/domain.schema.json` from the Pydantic domain model. Run
  after any change to `backend/app/models/domain.py`; `--check` verifies without writing. The
  contract tests on both sides depend on this file being current.
- `ingest.py` — corpus pipeline: fetch, parse, segment, enrich, embed, version, validate. Phase 11.
- `refresh.py` — re-fetch, diff, report. Phase 11.
- `ingest_records.py` — records layer. Phase 12.
- `i18n-coverage.ts` — per-locale translation coverage table. Phase 2.
