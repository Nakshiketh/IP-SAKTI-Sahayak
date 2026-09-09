# Evaluation report

Run at 2026-09-09T12:21:25+00:00.

**These numbers were measured against a demonstration corpus of 9 illustrative documents, not against the real source set.** No document from `corpus/manifest.json` has been ingested, because none has a verified source URL. So most questions here abstain for want of anything to answer from, and the abstention and coverage figures below measure the machinery rather than the product's coverage. The purity and groundedness figures are meaningful now; the coverage figures will only become meaningful once documents are ingested.

## What ran

| | |
| --- | --- |
| Cases | 170 |
| Corpus version | 0.0.0-demo |
| Corpus documents | 9 |
| Records ingested | 0 |
| Generator | fixture |
| Translator | passthrough |

## Metrics

| Metric | Result | Target | Note |
| --- | --- | --- | --- |
| `jurisdiction_purity` | 100.0% (54/54) | 100% | Answers whose every citation comes from the jurisdiction the answer is for. |
| `authority_purity` | 100.0% (54/54) | 100% | Answers in which no filed or granted record appeared as a citation. |
| `citation_validity` | 100.0% (54/54) | 100% | Answers whose every citation resolves to a passage that is currently in force. |
| `citation_groundedness` | 100.0% (54/54) | 100% | Answers whose every citation points at a passage actually retrieved for that question. Not the same as the citation supporting the claim, which needs a judge. |
| `citation_coverage` | 0.0% (0/136) |  | Answers citing at least one instrument the case expects. Bounded above by what has been ingested, so it reads low until the corpus is built. |
| `abstention_precision` | 33.6% (39/116) |  | Of the times it declined, how often declining was right. |
| `abstention_recall` | 100.0% (39/39) | 100% | Of the times it should have declined, how often it did. |
| `abstention_reason_accuracy` | 100.0% (39/39) |  | Declining for the reason the case expects, not merely declining. |
| `forbidden_claim_avoidance` | 100.0% (170/170) | 100% | Answers containing none of the phrases the case forbids. |
| `classification_accuracy` | 33.3% (2/6) |  | Product class on the answer matching the case, where the case sets one. |
| `language_detection_accuracy` | 100.0% (25/25) |  | Script detection on the non-English cases. Devanagari cannot separate Hindi from Marathi, so either counts for either — the detector reports that ambiguity rather than guessing. |
| `records_offered` | 100.0% (25/25) |  | Cases where records were expected beside the answer and appeared. |
| `records_do_not_rescue` | 100.0% (15/15) | 100% | Cases where a record was present and the corpus should decline: the system still declined. |
| `latency_p50` | 3 ms |  | Wall clock through the whole pipeline, excluding any model call latency. |
| `latency_p95` | 6 ms |  |  |
| `errors` | 0 |  | Cases that raised rather than answering or declining. Should be zero. |
| `answer_accuracy` | not measured |  | No reference answers exist. Writing them means stating what a source says, and no source has been read — see evals/gold/README.md. |
| `citation_correctness` | not measured |  | Whether a cited passage supports its claim needs a judge, human or model. citation_groundedness below measures what can be checked mechanically. |
| `multilingual_quality` | not measured |  | Needs a native-speaker rubric over a 30-question subset. language_detection_accuracy below measures the part a machine can. |

## By group

| Group | Cases | Answered | Declined | Errors |
| --- | --- | --- | --- | --- |
| cross-border | 15 | 8 | 7 | 0 |
| india | 60 | 31 | 29 | 0 |
| international | 30 | 9 | 21 | 0 |
| multilingual | 25 | 0 | 25 | 0 |
| records | 25 | 6 | 19 | 0 |
| unanswerable | 15 | 0 | 15 | 0 |

## Composition

| Language | Cases |
| --- | --- |
| bn | 5 |
| en | 145 |
| hi | 5 |
| mr | 5 |
| ta | 5 |
| te | 5 |

## What is below target

Nothing. Every metric with a target met it.

## Every case

| Case | Expected | Got | Reason | Confidence | Citations | Records |
| --- | --- | --- | --- | --- | --- | --- |
| `cb-001` | answer | answer |  | moderate | 2 | 2 |
| `cb-002` | answer | answer |  | moderate | 1 | 2 |
| `cb-003` | answer | answer |  | low | 1 | 0 |
| `cb-004` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `cb-005` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `cb-006` | answer | answer |  | low | 1 | 2 |
| `cb-007` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `cb-008` | answer | answer |  | moderate | 1 | 0 |
| `cb-009` | answer | abstain | needs_more_facts | abstain | 0 | 0 |
| `cb-010` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `cb-011` | answer | answer |  | moderate | 1 | 0 |
| `cb-012` | answer | answer |  | moderate | 1 | 0 |
| `cb-013` | answer | answer |  | low | 1 | 2 |
| `cb-014` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `cb-015` | abstain | abstain | out_of_scope | abstain | 0 | 0 |
| `in-ip-001` | answer | answer |  | moderate | 2 | 2 |
| `in-ip-002` | answer | abstain | out_of_scope | abstain | 0 | 0 |
| `in-ip-003` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `in-ip-004` | answer | answer |  | moderate | 1 | 0 |
| `in-ip-005` | answer | answer |  | moderate | 1 | 2 |
| `in-ip-006` | answer | answer |  | moderate | 1 | 2 |
| `in-ip-007` | answer | answer |  | low | 1 | 2 |
| `in-ip-008` | answer | answer |  | low | 1 | 0 |
| `in-ip-009` | answer | answer |  | moderate | 1 | 0 |
| `in-ip-010` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `in-ip-011` | answer | answer |  | low | 2 | 2 |
| `in-ip-012` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `in-ip-013` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `in-ip-014` | answer | answer |  | low | 2 | 2 |
| `in-ip-015` | answer | answer |  | moderate | 1 | 2 |
| `in-ip-016` | answer | answer |  | moderate | 1 | 0 |
| `in-ip-017` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `in-ip-018` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `in-ip-019` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `in-ip-020` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `in-ip-021` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `in-ip-022` | answer | answer |  | low | 1 | 0 |
| `in-ip-023` | answer | answer |  | low | 1 | 0 |
| `in-ip-024` | answer | answer |  | moderate | 1 | 0 |
| `in-ip-025` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `in-ip-026` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `in-reg-001` | answer | answer |  | moderate | 2 | 0 |
| `in-reg-002` | answer | answer |  | moderate | 2 | 0 |
| `in-reg-003` | answer | answer |  | moderate | 1 | 0 |
| `in-reg-004` | answer | answer |  | moderate | 1 | 0 |
| `in-reg-005` | answer | answer |  | low | 2 | 0 |
| `in-reg-006` | answer | abstain | out_of_scope | abstain | 0 | 0 |
| `in-reg-007` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `in-reg-008` | answer | answer |  | moderate | 1 | 2 |
| `in-reg-009` | answer | answer |  | moderate | 2 | 2 |
| `in-reg-010` | answer | answer |  | moderate | 2 | 0 |
| `in-reg-011` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `in-reg-012` | answer | abstain | sources_conflict | abstain | 0 | 0 |
| `in-reg-013` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `in-reg-014` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `in-reg-015` | answer | answer |  | low | 1 | 0 |
| `in-reg-016` | answer | answer |  | moderate | 2 | 0 |
| `in-reg-017` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `in-reg-018` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `in-abs-001` | answer | answer |  | moderate | 1 | 2 |
| `in-abs-002` | answer | answer |  | moderate | 1 | 0 |
| `in-abs-003` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `in-abs-004` | answer | answer |  | moderate | 1 | 0 |
| `in-abs-005` | answer | answer |  | low | 1 | 0 |
| `in-abs-006` | answer | answer |  | moderate | 1 | 0 |
| `in-abs-007` | answer | answer |  | moderate | 1 | 2 |
| `in-abs-008` | answer | answer |  | moderate | 1 | 2 |
| `in-abs-009` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `in-abs-010` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `in-clar-001` | clarify | abstain | needs_more_facts | abstain | 0 | 2 |
| `in-clar-002` | clarify | abstain | needs_more_facts | abstain | 0 | 0 |
| `in-clar-003` | clarify | abstain | needs_more_facts | abstain | 0 | 0 |
| `in-clar-004` | clarify | abstain | needs_more_facts | abstain | 0 | 0 |
| `in-clar-005` | clarify | abstain | needs_more_facts | abstain | 0 | 2 |
| `in-clar-006` | clarify | abstain | needs_more_facts | abstain | 0 | 0 |
| `intl-001` | answer | answer |  | moderate | 2 | 0 |
| `intl-002` | answer | answer |  | moderate | 1 | 0 |
| `intl-003` | answer | answer |  | moderate | 1 | 0 |
| `intl-004` | answer | answer |  | moderate | 1 | 0 |
| `intl-005` | answer | answer |  | moderate | 1 | 0 |
| `intl-006` | answer | answer |  | moderate | 1 | 0 |
| `intl-007` | answer | abstain | out_of_scope | abstain | 0 | 0 |
| `intl-008` | answer | answer |  | moderate | 1 | 0 |
| `intl-009` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-010` | answer | answer |  | moderate | 1 | 0 |
| `intl-011` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-012` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-013` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-014` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-015` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-016` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-017` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-018` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-019` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-020` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-021` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-022` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `intl-023` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-024` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `intl-025` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-026` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-027` | abstain | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-028` | abstain | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-029` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `intl-030` | answer | answer |  | moderate | 1 | 0 |
| `ml-hi-001` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-hi-002` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-hi-003` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-hi-004` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-hi-005` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-mr-001` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-mr-002` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-mr-003` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-mr-004` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-mr-005` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-bn-001` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-bn-002` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-bn-003` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-bn-004` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-bn-005` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-ta-001` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-ta-002` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-ta-003` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-ta-004` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-ta-005` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-te-001` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-te-002` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-te-003` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-te-004` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `ml-te-005` | answer | abstain | nothing_relevant | abstain | 0 | 0 |
| `rec-001` | answer | answer |  | low | 2 | 2 |
| `rec-002` | answer | answer |  | moderate | 1 | 2 |
| `rec-003` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `rec-004` | answer | answer |  | moderate | 1 | 2 |
| `rec-005` | answer | answer |  | moderate | 3 | 2 |
| `rec-006` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `rec-007` | answer | answer |  | moderate | 1 | 2 |
| `rec-008` | answer | answer |  | low | 2 | 2 |
| `rec-009` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `rec-010` | answer | abstain | nothing_relevant | abstain | 0 | 2 |
| `rec-011` | abstain | abstain | nothing_relevant | abstain | 0 | 2 |
| `rec-012` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `rec-013` | abstain | abstain | nothing_relevant | abstain | 0 | 2 |
| `rec-014` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `rec-015` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `rec-016` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `rec-017` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `rec-018` | abstain | abstain | nothing_relevant | abstain | 0 | 2 |
| `rec-019` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `rec-020` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `rec-021` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `rec-022` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `rec-023` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `rec-024` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `rec-025` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `un-001` | abstain | abstain | out_of_scope | abstain | 0 | 0 |
| `un-002` | abstain | abstain | out_of_scope | abstain | 0 | 0 |
| `un-003` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `un-004` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `un-005` | abstain | abstain | out_of_scope | abstain | 0 | 0 |
| `un-006` | abstain | abstain | out_of_scope | abstain | 0 | 0 |
| `un-007` | abstain | abstain | out_of_scope | abstain | 0 | 0 |
| `un-008` | abstain | abstain | out_of_scope | abstain | 0 | 2 |
| `un-009` | abstain | abstain | out_of_scope | abstain | 0 | 0 |
| `un-010` | abstain | abstain | out_of_scope | abstain | 0 | 0 |
| `un-011` | abstain | abstain | out_of_scope | abstain | 0 | 0 |
| `un-012` | abstain | abstain | nothing_relevant | abstain | 0 | 0 |
| `un-013` | abstain | abstain | nothing_relevant | abstain | 0 | 0 |
| `un-014` | abstain | abstain | nothing_relevant | abstain | 0 | 0 |
| `un-015` | abstain | abstain | out_of_scope | abstain | 0 | 0 |
