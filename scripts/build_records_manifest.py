"""Generate corpus/records-manifest.json — the Layer 2 source set.

Records are evidential, never authority. They record what has been filed,
granted or registered; they are not statements of law, they never enter the
vector index, and `citable_in_answers` is false on every entry here and typed
`Literal[False]` in the domain model so no code path can promote one.

Two rules from docs/CORPUS_POLICY.md are enforced here rather than left to
discipline later:

1. Bulk and downloadable sources may be ingested. Interactive, session-based
   portals are linked out to and never fetched. A `portal_link_only` entry
   carries no parser and no field map, so there is nothing for a fetcher to be
   written against.
2. A source with an unverified licence is not ingested. Every `licence` here is
   null, because none has been read. Until one is, the interface says so and the
   pipeline has nothing to act on.

`link_template` is null for the same reason `source_url` is null in the corpus
manifest: a URL written from memory is a guess, and this product does not ship
guesses. Phase 12 fills them from the terms it has actually read.

Run: python scripts/build_records_manifest.py
"""

from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPO_ROOT / "corpus" / "records-manifest.json"

BULK = "bulk_open"
PORTAL = "portal_link_only"

# (source_id, name, publisher, jurisdiction, record_type, access_mode, terms_note)
SOURCES: list[tuple[str, str, str, str, str, str, str]] = [
    # --- India: bulk datasets, ingestible once the licence is read ---------
    (
        "in-patent-applications-bulk",
        "Patent application dataset",
        "Office of the Controller General of Patents, Designs and Trade Marks",
        "IN",
        "patent_application",
        BULK,
        "Bulk dataset. Ingestible in principle; not fetched until the licence and attribution terms have been read.",
    ),
    (
        "in-patent-applications-weekly",
        "Weekly published patent applications",
        "Office of the Controller General of Patents, Designs and Trade Marks",
        "IN",
        "patent_application",
        BULK,
        "Published on a weekly cycle. Incremental append, idempotent on record id and row hash.",
    ),
    (
        "in-patent-grants-weekly",
        "Weekly granted patents",
        "Office of the Controller General of Patents, Designs and Trade Marks",
        "IN",
        "patent_grant",
        BULK,
        "Published on a weekly cycle. Incremental append, idempotent on record id and row hash.",
    ),
    (
        "in-patent-grant-statistics",
        "Invention-wise grant statistics",
        "Office of the Controller General of Patents, Designs and Trade Marks",
        "IN",
        "aggregate_statistic",
        BULK,
        "Aggregate figures only. Loaded into a separate table, charted for context, and never attached to a claim about a specific product.",
    ),
    # --- India: interactive portals. Linked out to, never fetched. ---------
    (
        "in-patent-public-search",
        "Patent public search",
        "Office of the Controller General of Patents, Designs and Trade Marks",
        "IN",
        "patent_application",
        PORTAL,
        "Interactive service. No bulk export. The product links out and does not run the search.",
    ),
    (
        "in-ip-india-register",
        "IP India e-register and e-services",
        "Office of the Controller General of Patents, Designs and Trade Marks",
        "IN",
        "patent_grant",
        PORTAL,
        "Session-based service. The product links out and does not run the search.",
    ),
    (
        "in-gi-public-register",
        "Geographical indications public register",
        "Geographical Indications Registry",
        "IN",
        "gi_registration",
        PORTAL,
        "Interactive register. Linked out to.",
    ),
    (
        "in-trade-marks-public-search",
        "Trade marks public search",
        "Trade Marks Registry",
        "IN",
        "trademark",
        PORTAL,
        "Interactive search. Linked out to.",
    ),
    (
        "in-copyright-register",
        "Copyright register",
        "Copyright Office",
        "IN",
        "design",
        PORTAL,
        "Interactive register. Linked out to.",
    ),
    (
        "in-plant-variety-registry",
        "Plant variety registry",
        "Protection of Plant Varieties and Farmers' Rights Authority",
        "IN",
        "plant_variety",
        PORTAL,
        "Interactive registry. Linked out to.",
    ),
    (
        "in-abs-approvals",
        "Published access and benefit-sharing approvals",
        "National Biodiversity Authority",
        "IN",
        "abs_approval",
        PORTAL,
        "Published approvals. Format and terms not yet assessed; treated as link-out until they are.",
    ),
    # --- International: interactive portals --------------------------------
    (
        "wipo-patentscope",
        "Patentscope",
        "World Intellectual Property Organization",
        "INTL",
        "patent_application",
        PORTAL,
        "Interactive search across international collections. Linked out to.",
    ),
    (
        "wipo-global-brand-database",
        "Global Brand Database",
        "World Intellectual Property Organization",
        "INTL",
        "trademark",
        PORTAL,
        "Interactive search. Linked out to.",
    ),
    (
        "wipo-global-design-database",
        "Global Design Database",
        "World Intellectual Property Organization",
        "INTL",
        "design",
        PORTAL,
        "Interactive search. Linked out to.",
    ),
    (
        "wipo-madrid-monitor",
        "Madrid Monitor",
        "World Intellectual Property Organization",
        "INTL",
        "trademark",
        PORTAL,
        "Interactive status service for international trade mark registrations. Linked out to.",
    ),
    (
        "wipo-lisbon-express",
        "Lisbon Express",
        "World Intellectual Property Organization",
        "INTL",
        "gi_registration",
        PORTAL,
        "Interactive search for appellations of origin and geographical indications. Linked out to.",
    ),
    (
        "epo-espacenet",
        "Espacenet",
        "European Patent Office",
        "INTL",
        "patent_application",
        PORTAL,
        "Interactive search. Linked out to.",
    ),
]


def build() -> dict:
    sources = []
    for (
        source_id,
        name,
        publisher,
        jurisdiction,
        record_type,
        access_mode,
        terms_note,
    ) in SOURCES:
        entry = {
            "source_id": source_id,
            "name": name,
            "publisher": publisher,
            "jurisdiction": jurisdiction,
            "record_type": record_type,
            "access_mode": access_mode,
            "source_url": None,
            # Not read yet. Nothing is ingested until it has been.
            "licence": None,
            "licence_url": None,
            "attribution_text": None,
            "update_cadence": "unknown_until_verified",
            "last_snapshot_at": None,
            "snapshot_checksum": None,
            "record_count": None,
            "terms_note": terms_note,
            # Rule 7: registry data is evidence, never authority.
            "citable_in_answers": False,
        }

        if access_mode == PORTAL:
            # No parser, no field map — there is deliberately nothing here for a
            # fetcher to be written against.
            entry["link_template"] = None
        else:
            entry["parser"] = "csv"
            entry["field_map"] = {
                "record_id": None,
                "title": None,
                "applicant": None,
                "filing_date": None,
                "status": None,
            }

        sources.append(entry)

    return {
        "records_version": "0.0.0-unbuilt",
        "generated_by": "scripts/build_records_manifest.py",
        "note": (
            "Layer 2. Evidential, never authority. Nothing has been fetched and no "
            "licence has been read, so every licence field is null and no source is "
            "ingested. Portal sources carry no parser and no link template by design."
        ),
        "sources": sources,
    }


def main() -> int:
    manifest = build()
    sources = manifest["sources"]

    ids = [entry["source_id"] for entry in sources]
    duplicates = {i for i in ids if ids.count(i) > 1}
    if duplicates:
        raise SystemExit(f"duplicate source ids: {sorted(duplicates)}")

    for entry in sources:
        if entry["citable_in_answers"] is not False:
            raise SystemExit(f"{entry['source_id']} must not be citable")
        if entry["access_mode"] == PORTAL and ("parser" in entry or "field_map" in entry):
            raise SystemExit(f"{entry['source_id']} is portal-only and must have no fetcher config")

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"wrote {MANIFEST_PATH} with {len(ids)} sources")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
