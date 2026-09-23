# Phase 3 - Rebuild Check My Product as Product and Formulation Intelligence

Goal: replace weak commercial-product similarity with rule-based, source-grounded analysis, using the Phase 2 pipeline.
Read: PROGRESS.md (Check My Product trace from Phase 0), this file.

## Build
1. Remove the commercial dataset safely: search every reader; delete the dataset files, similarity / "closest product" logic, UI sections that only show those comparisons, and obsolete API/DB fields (with a migration). Keep unrelated form parts that still make sense.
2. New input form (existing form components; all fields optional except the description, "I don't know" on each, which becomes a missing fact): ingredients, quantities, preparation / extraction / manufacturing process, product form, intended use, claims, based on a classical formulation (and which book), traditional knowledge source, origin of biological material, applicant/entity details only where legally relevant, target markets, whether IP protection is intended.
3. Output from run_pipeline(channel="product"): classification hypothesis; missing facts; regulatory branches; IP branches; TK / prior-art considerations; biodiversity / ABS considerations; jurisdiction-specific considerations; potential exclusions needing investigation; evidence table; uncertainty; recommended searches and checks; escalation conditions; compliance roadmap seed.
4. ABS decision support: ask only material questions (biological resource involved, origin, Indian or foreign source, associated TK, purpose, research / commercial / IP context, applicant characteristics where relevant, IP application planned). Output: potential ABS relevance, sources, missing facts, possible procedural path, forms or portals only where grounded in a usable source, uncertainty, expert-review condition.
5. Prior-Art Search Builder: concepts, botanical names (validated only against a stored reference list, otherwise marked "unvalidated"), process terms, technical features, synonyms, TK terminology; IPC/CPC hints only when stored from the official WIPO IPC publication. Output search strings for IP India and WIPO PATENTSCOPE plus links to their official search pages (no scraping). Banner: "Search strategy generated - no novelty conclusion has been made." TKDL: public-source help only, with the access limitation stated.
6. IP Protection Map data: patent, trade mark, design, copyright, GI, trade secret, each Relevant / Possibly relevant / Not indicated from supplied facts / Needs more information, with why, sources, facts required, next step. (UI in Phase 4.)

## Tests to add
T16: nothing imports or reads the commercial dataset (search-based test plus a runtime check). Also: "I don't know" becomes a missing fact; the prior-art banner is always present; no blocked verdict phrases in product outputs; ABS output never names a form that isn't in the registry.

## Gate
Full gate green. Commit "phase 3: product intelligence". Report in 15 lines or fewer.
