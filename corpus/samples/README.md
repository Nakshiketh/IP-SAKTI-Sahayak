# Sample fixture documents

Fictional instruments of a fictional territory, written to exercise the ingestion pipeline end to
end. **None of them is law, and none of them paraphrases the law of any real jurisdiction.**

They exist because the real manifest has no verified source URLs yet — nothing has been fetched, so
`make ingest` builds nothing. These do get built, which is what proves the pipeline works: fetch,
parse, section-aware segmentation, tagging, versioning, validation and an index retrieval can read.

    make ingest-samples        # builds into data/index-samples
    python scripts/refresh.py --manifest corpus/samples/manifest.json \
        --index-dir data/index-samples

To see the API answer from that build rather than from the committed demo fixture, point it at the
index and restart:

    SAHAYAK_INDEX_DIR_OVERRIDE=data/index-samples

Every document here carries `verification_status: "demo"`, so anything built from this manifest is
marked illustrative everywhere a reader can see it, and the corpus-version endpoint reports the
build as a demo corpus.

## What each one exercises

| File | Parser | Profile | What it is for |
| --- | --- | --- | --- |
| `sample-instruments-act-2020.txt` | `text` | `statute_section_aware` | Chapters, sections with headings, sub-sections, clauses, a preamble, and one section long enough to be split at its own sub-clause boundaries |
| `sample-practice-rules-2021.html` | `html` | `rules_section_aware` | The HTML parser, and that `script`, `style`, `nav` and `footer` content never reaches the output |
| `sample-convention-2019.txt` | `text` | `treaty_article_aware` | Parts and Articles, and a second jurisdiction so the per-namespace index split is real |
| `sample-credentialed-source` | — | — | Carries a resolvable `source_url` on purpose. The pipeline must still refuse to fetch it, because the refusal is on `access_mode` and not on whether a fetch would succeed |

## Rules for anything added here

1. **Fictional, and unmistakably so.** A fixture that read like a real statute would eventually be
   quoted as one. The title says illustrative, the territory does not exist, and the first line of
   every file says it is not law.
2. **`verification_status` is `demo`.** Never `unverified`, and never `verified`.
3. **It never moves into `corpus/manifest.json`.** That manifest is the real source set.

`CHANGELOG.md`, `tags-review.jsonl` and `raw/` in this directory are build output and are
gitignored.
