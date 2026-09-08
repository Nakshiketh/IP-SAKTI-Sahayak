# Corpus

Source manifests and ingestion configs.

Nothing here has been fetched. All 37 entries in `manifest.json` carry a null `source_url`, so
`make ingest` reports 37 skips and builds nothing — which is the honest state of a corpus nobody
has retrieved, and is why `samples/` exists.

- `manifest.json` — Layer 1, normative sources. One entry per document, carrying the `Document`
  fields plus fetch method, parser, chunking profile and licence note. Single source of truth for
  the sources page.
- `records-manifest.json` — Layer 2, records. One entry per source, carrying access mode, licence,
  verbatim attribution text and either a field map (for bulk sources) or a link template (for
  portal-only sources, which get no fetcher at all). Nothing here is ingested either: 13 of the 17
  are portals this product never fetches, and the other four have licences nobody has read.
- `samples/` — fictional instruments of a fictional territory, and their own manifest. What proves
  the pipeline works end to end while the real manifest has nothing to fetch. See `samples/README.md`.
- `CHANGELOG.md` — written by the version stage on re-ingest, so "the law changed and the sources
  know" can be demonstrated rather than claimed. One dated entry per run, naming the sections that
  moved. Absent until something is actually ingested.
- `tags-review.jsonl` — the tag review queue. The rule-based tagger's output enters the index; a
  model's proposals land here and enter nothing until a person moves them. Gitignored.
- `raw/` — fetched documents. Gitignored: the fetch recipe and checksum are committed, the
  documents are not, because this product has no right to redistribute most of them.

## Running the pipeline

    make ingest                 # the real source set; today, 37 skips and no build
    make ingest-samples         # the fixture documents, into data/index-samples
    make refresh                # re-fetch and report what moved; writes nothing without --write
    make ingest-records         # Layer 2; today, 17 sources and nothing loaded
    make ingest-records-samples # the fixture registry, into data/records-samples.sqlite3

`scripts/ingest.py --help` and `scripts/refresh.py --help` carry the rest. A relative `source_url`
is resolved against the manifest's own directory before the repository root, so a manifest and its
documents can be moved together.

Source policy is in `docs/CORPUS_POLICY.md`.
