# Corpus

Source manifests and ingestion configs. Populated in Phase 11.

- `manifest.json` — Layer 1, normative sources. One entry per document, carrying the `Document`
  fields plus fetch method, parser, chunking profile and licence note. Single source of truth for
  the sources page.
- `records-manifest.json` — Layer 2, records. One entry per source, carrying access mode, licence,
  verbatim attribution text and either a field map (for bulk sources) or a link template (for
  portal-only sources, which get no fetcher at all).
- `CHANGELOG.md` — written by the version stage on re-ingest, so "the law changed and the sources
  know" can be demonstrated rather than claimed.
- `raw/` — fetched documents. Gitignored: the fetch recipe and checksum are committed, the
  documents are not.

Source policy is in `docs/CORPUS_POLICY.md`.
