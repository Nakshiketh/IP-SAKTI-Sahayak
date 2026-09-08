# Scripts

- `gen_schema.py` — regenerates `schemas/domain.schema.json` from the Pydantic domain model. Run
  after any change to `backend/app/models/domain.py`; `--check` verifies without writing. The
  contract tests on both sides depend on this file being current.
- `ingest.py` — the corpus pipeline: fetch, parse, segment, enrich, embed, version, validate. Thin
  CLI over `backend/app/corpus`, where the machinery lives so it can be tested. Idempotent — a
  document whose bytes have not changed reuses its cached parse — and resumable, in that a document
  that fails takes only itself down and every outcome is reported at the end.
  `--manifest` picks the source set, `--index-dir` where to build, `--strict` turns a skip into a
  failure, `--force` throws every cache away.
- `refresh.py` — re-fetch, diff, report. Read-only by default: it answers "has anything we cite
  moved?" without committing to a rebuild. `--write` runs the ingest for what changed, which retains
  the superseded wording with an `effective_to` date and appends to the changelog.
- `ingest_records.py` — the records layer, Layer 2. Config-driven from a records manifest, into its
  own SQLite database with no embeddings anywhere. Refuses a `portal_link_only` source on
  `access_mode` before it looks at anything else, and refuses any source whose licence nobody has
  read. Fails the run on schema drift or on a mapped field that comes out null in more than 5% of
  rows — a mapping that silently produces nulls is worse than one that crashes.
- `i18n-coverage.ts` — per-locale translation coverage table. Phase 2.
