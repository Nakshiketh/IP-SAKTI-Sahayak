# Data

Generated artefacts. Nothing here is authored by hand.

- `index/` — vector indexes, one namespace per jurisdiction. Gitignored.
- `chunks/` — chunk store and metadata database. Gitignored.
- `fixtures/` — demo fixtures for Phases 3–9. Committed. Every record carries
  `verification_status: "demo"` and `is_demo: true`, and every file is named `*.mock.ts` or lives
  under this directory, so demo content can never be mistaken for a verified source.
