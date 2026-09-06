# Evaluation

Built in Phase 13.

- `gold/*.jsonl` — the gold question set, 120 minimum: 60 India, 30 international, 15 cross-border,
  15 deliberately unanswerable or out of scope, at least 5 per non-English language. A seed set is
  in `docs/CORPUS_POLICY.md` §3.7.
- `score.py` — scoring. Metrics: answer accuracy, citation correctness, citation validity,
  abstention precision and recall, jurisdiction purity, authority purity, classification accuracy,
  multilingual quality, latency.
- `reports/` — markdown reports and a JSON summary. The JSON summary is what `/how-it-works` reads,
  so published numbers are always the numbers from the last run — including the bad ones.
