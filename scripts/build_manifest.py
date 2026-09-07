"""Generate corpus/manifest.json from the planned Layer 1 source set.

The manifest is the single source of truth for what this product intends to
answer from. It exists before anything is ingested so that the interface can say
which document a statement *will* cite, and mark that statement pending until the
document is actually fetched.

Every entry here is deliberately incomplete. `source_url`, `version_label`,
`effective_from` and `publication_date` are null, and `verification_status` is
"unverified", because per docs/CORPUS_POLICY.md those fields are filled only from
the document actually fetched. Guessing a URL or an effective date would be
exactly the kind of fabrication the abstention policy exists to prevent.

Run: python scripts/build_manifest.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

MANIFEST_PATH = REPO_ROOT / "corpus" / "manifest.json"

# Groups the sources page renders under. Derived from regime_family rather than
# set per document, so adding a source cannot land it in no group. The keys are
# translated in the interface; no display text lives in the manifest.
GROUP_BY_REGIME = {
    "patents": "indian_ip",
    "geographical_indications": "indian_ip",
    "trade_marks": "indian_ip",
    "copyright": "indian_ip",
    "designs": "indian_ip",
    "plant_varieties": "indian_ip",
    "drug_regulation": "indian_drug_food_cosmetic",
    "advertising": "indian_drug_food_cosmetic",
    "food_regulation": "indian_drug_food_cosmetic",
    "labelling": "indian_drug_food_cosmetic",
    "biodiversity": "biodiversity_abs",
    "pharmacopoeia": "pharmacopoeial",
    "traditional_knowledge": "traditional_knowledge",
    "international_ip": "international_ip",
    "market_access": "market_access",
}

#: The order groups appear in. A regime family missing from either mapping is a
#: build error rather than a silently ungrouped document.
GROUP_ORDER = [
    "indian_ip",
    "indian_drug_food_cosmetic",
    "biodiversity_abs",
    "pharmacopoeial",
    "traditional_knowledge",
    "international_ip",
    "market_access",
]

# (document_id, title, short_title, organization, jurisdiction, regime_family,
#  document_type, ip_rights, regulatory_areas)
SOURCES: list[tuple[str, str, str, str, str, str, str, list[str], list[str]]] = [
    # --- India, intellectual property -------------------------------------
    (
        "in-patents-act-1970",
        "The Patents Act, 1970",
        "Patents Act",
        "Government of India",
        "IN",
        "patents",
        "act",
        ["patent", "traditional_knowledge"],
        [],
    ),
    (
        "in-patents-rules-2003",
        "The Patents Rules, 2003",
        "Patents Rules",
        "Government of India",
        "IN",
        "patents",
        "rules",
        ["patent"],
        [],
    ),
    (
        "in-patent-office-manual",
        "Manual of Patent Office Practice and Procedure",
        "Patent Office Manual",
        "Office of the Controller General of Patents, Designs and Trade Marks",
        "IN",
        "patents",
        "guideline",
        ["patent", "traditional_knowledge"],
        [],
    ),
    (
        "in-tk-biological-material-guidelines",
        "Guidelines for Examination of Patent Applications Relating to Traditional Knowledge and Biological Material",
        "TK examination guidelines",
        "Office of the Controller General of Patents, Designs and Trade Marks",
        "IN",
        "patents",
        "guideline",
        ["patent", "traditional_knowledge"],
        ["abs_compliance"],
    ),
    (
        "in-gi-act-1999",
        "The Geographical Indications of Goods (Registration and Protection) Act, 1999",
        "GI Act",
        "Government of India",
        "IN",
        "geographical_indications",
        "act",
        ["geographical_indication"],
        [],
    ),
    (
        "in-gi-rules-2002",
        "The Geographical Indications of Goods (Registration and Protection) Rules, 2002",
        "GI Rules",
        "Government of India",
        "IN",
        "geographical_indications",
        "rules",
        ["geographical_indication"],
        [],
    ),
    (
        "in-trade-marks-act-1999",
        "The Trade Marks Act, 1999",
        "Trade Marks Act",
        "Government of India",
        "IN",
        "trade_marks",
        "act",
        ["trademark"],
        [],
    ),
    (
        "in-trade-marks-rules-2017",
        "The Trade Marks Rules, 2017",
        "Trade Marks Rules",
        "Government of India",
        "IN",
        "trade_marks",
        "rules",
        ["trademark"],
        [],
    ),
    (
        "in-copyright-act-1957",
        "The Copyright Act, 1957",
        "Copyright Act",
        "Government of India",
        "IN",
        "copyright",
        "act",
        ["copyright"],
        [],
    ),
    (
        "in-designs-act-2000",
        "The Designs Act, 2000",
        "Designs Act",
        "Government of India",
        "IN",
        "designs",
        "act",
        ["design"],
        [],
    ),
    (
        "in-ppvfr-act-2001",
        "The Protection of Plant Varieties and Farmers' Rights Act, 2001",
        "Plant Varieties Act",
        "Government of India",
        "IN",
        "plant_varieties",
        "act",
        ["plant_variety"],
        [],
    ),
    # --- India, biodiversity and access and benefit sharing ----------------
    (
        "in-biological-diversity-act-2002",
        "The Biological Diversity Act, 2002",
        "Biological Diversity Act",
        "Government of India",
        "IN",
        "biodiversity",
        "act",
        ["traditional_knowledge"],
        ["abs_compliance"],
    ),
    (
        "in-biological-diversity-rules-2024",
        "The Biological Diversity Rules, 2024",
        "Biological Diversity Rules",
        "Government of India",
        "IN",
        "biodiversity",
        "rules",
        [],
        ["abs_compliance"],
    ),
    (
        "in-nba-abs-guidelines",
        "National Biodiversity Authority guidelines and access and benefit-sharing forms",
        "NBA ABS guidelines",
        "National Biodiversity Authority",
        "IN",
        "biodiversity",
        "guideline",
        [],
        ["abs_compliance"],
    ),
    # --- India, drug, food, cosmetic and advertising -----------------------
    (
        "in-drugs-and-cosmetics-act-1940",
        "The Drugs and Cosmetics Act, 1940",
        "Drugs and Cosmetics Act",
        "Government of India",
        "IN",
        "drug_regulation",
        "act",
        [],
        ["licensing", "manufacturing_gmp", "quality_standards", "cosmetic"],
    ),
    (
        "in-drugs-and-cosmetics-rules-1945",
        "The Drugs and Cosmetics Rules, 1945",
        "Drugs and Cosmetics Rules",
        "Government of India",
        "IN",
        "drug_regulation",
        "rules",
        [],
        ["licensing", "manufacturing_gmp", "labelling", "clinical_evidence", "cosmetic"],
    ),
    (
        "in-magic-remedies-act-1954",
        "The Drugs and Magic Remedies (Objectionable Advertisements) Act, 1954",
        "Magic Remedies Act",
        "Government of India",
        "IN",
        "advertising",
        "act",
        [],
        ["advertising"],
    ),
    (
        "in-fssai-ayurveda-aahara-2022",
        "Food Safety and Standards (Ayurveda Aahara) Regulations, 2022",
        "Ayurveda Aahara Regulations",
        "Food Safety and Standards Authority of India",
        "IN",
        "food_regulation",
        "regulation",
        [],
        ["food_nutraceutical", "labelling"],
    ),
    (
        "in-fssai-labelling-claims",
        "Food Safety and Standards (Labelling and Display) Regulations and the Advertising and Claims Regulations",
        "FSSAI labelling and claims",
        "Food Safety and Standards Authority of India",
        "IN",
        "food_regulation",
        "regulation",
        [],
        ["labelling", "advertising", "food_nutraceutical"],
    ),
    (
        "in-legal-metrology-packaged-2011",
        "The Legal Metrology (Packaged Commodities) Rules, 2011",
        "Packaged Commodities Rules",
        "Government of India",
        "IN",
        "labelling",
        "rules",
        [],
        ["labelling"],
    ),
    # --- India, standards and traditional knowledge ------------------------
    (
        "in-ayurvedic-pharmacopoeia",
        "The Ayurvedic Pharmacopoeia of India",
        "Ayurvedic Pharmacopoeia",
        "Ministry of Ayush",
        "IN",
        "pharmacopoeia",
        "pharmacopoeia",
        [],
        ["quality_standards"],
    ),
    (
        "in-ayurvedic-formulary",
        "The Ayurvedic Formulary of India",
        "Ayurvedic Formulary",
        "Ministry of Ayush",
        "IN",
        "pharmacopoeia",
        "pharmacopoeia",
        [],
        ["quality_standards"],
    ),
    (
        "in-tkdl-access-model",
        "Traditional Knowledge Digital Library: access model and agreements",
        "TKDL access model",
        "Council of Scientific and Industrial Research",
        "IN",
        "traditional_knowledge",
        "guideline",
        ["traditional_knowledge", "patent"],
        [],
    ),
    # --- International, intellectual property ------------------------------
    (
        "intl-trips",
        "Agreement on Trade-Related Aspects of Intellectual Property Rights",
        "TRIPS",
        "World Trade Organization",
        "INTL",
        "international_ip",
        "treaty",
        ["patent", "trademark", "geographical_indication", "copyright"],
        [],
    ),
    (
        "intl-paris-convention",
        "Paris Convention for the Protection of Industrial Property",
        "Paris Convention",
        "World Intellectual Property Organization",
        "INTL",
        "international_ip",
        "treaty",
        ["patent", "trademark", "design"],
        [],
    ),
    (
        "intl-cbd",
        "Convention on Biological Diversity",
        "CBD",
        "United Nations",
        "INTL",
        "biodiversity",
        "treaty",
        ["traditional_knowledge"],
        ["abs_compliance"],
    ),
    (
        "intl-nagoya-protocol",
        "Nagoya Protocol on Access to Genetic Resources and the Fair and Equitable Sharing of Benefits",
        "Nagoya Protocol",
        "United Nations",
        "INTL",
        "biodiversity",
        "treaty",
        ["traditional_knowledge"],
        ["abs_compliance"],
    ),
    (
        "intl-wipo-gratk-2024",
        "WIPO Treaty on Intellectual Property, Genetic Resources and Associated Traditional Knowledge",
        "WIPO GRATK Treaty",
        "World Intellectual Property Organization",
        "INTL",
        "international_ip",
        "treaty",
        ["patent", "traditional_knowledge"],
        ["abs_compliance"],
    ),
    (
        "intl-pct",
        "Patent Cooperation Treaty",
        "PCT",
        "World Intellectual Property Organization",
        "INTL",
        "international_ip",
        "treaty",
        ["patent"],
        [],
    ),
    (
        "intl-madrid-protocol",
        "Protocol Relating to the Madrid Agreement Concerning the International Registration of Marks",
        "Madrid Protocol",
        "World Intellectual Property Organization",
        "INTL",
        "international_ip",
        "treaty",
        ["trademark"],
        [],
    ),
    (
        "intl-hague-agreement",
        "Hague Agreement Concerning the International Registration of Industrial Designs",
        "Hague Agreement",
        "World Intellectual Property Organization",
        "INTL",
        "international_ip",
        "treaty",
        ["design"],
        [],
    ),
    (
        "intl-budapest-treaty",
        "Budapest Treaty on the International Recognition of the Deposit of Micro-organisms",
        "Budapest Treaty",
        "World Intellectual Property Organization",
        "INTL",
        "international_ip",
        "treaty",
        ["patent"],
        [],
    ),
    # --- International, herbal market access -------------------------------
    (
        "uk-traditional-herbal-registration",
        "Traditional herbal registration scheme",
        "UK traditional herbal registration",
        "Medicines and Healthcare products Regulatory Agency",
        "INTL",
        "market_access",
        "guideline",
        [],
        ["licensing", "labelling", "import_export"],
    ),
    (
        "eu-traditional-herbal-directive",
        "Directive on traditional herbal medicinal products",
        "EU traditional herbal directive",
        "European Union",
        "INTL",
        "market_access",
        "regulation",
        [],
        ["licensing", "quality_standards", "import_export"],
    ),
    (
        "eu-health-claims-regulation",
        "Regulation on nutrition and health claims made on foods",
        "EU health claims regulation",
        "European Union",
        "INTL",
        "market_access",
        "regulation",
        [],
        ["labelling", "advertising", "food_nutraceutical"],
    ),
    (
        "us-dietary-supplement-framework",
        "Dietary supplement framework, current good manufacturing practice and new dietary ingredient notification",
        "US dietary supplement framework",
        "Food and Drug Administration",
        "INTL",
        "market_access",
        "regulation",
        [],
        ["licensing", "manufacturing_gmp", "labelling", "food_nutraceutical", "import_export"],
    ),
    (
        "who-herbal-quality-guidance",
        "Quality control methods for herbal materials, and good agricultural and collection practices for medicinal plants",
        "WHO herbal quality guidance",
        "World Health Organization",
        "INTL",
        "market_access",
        "guideline",
        [],
        ["quality_standards"],
    ),
]


def build() -> dict:
    unmapped = {regime for (_, _, _, _, _, regime, _, _, _) in SOURCES} - set(GROUP_BY_REGIME)
    if unmapped:
        raise SystemExit(f"regime families with no group: {sorted(unmapped)}")

    documents = []
    for (
        document_id,
        title,
        short_title,
        organization,
        jurisdiction,
        regime_family,
        document_type,
        ip_rights,
        regulatory_areas,
    ) in SOURCES:
        documents.append(
            {
                "document_id": document_id,
                "title": title,
                "short_title": short_title,
                "organization": organization,
                "jurisdiction": jurisdiction,
                "regime_family": regime_family,
                "document_type": document_type,
                "group": GROUP_BY_REGIME[regime_family],
                "language": "en",
                # Filled only from the document actually fetched — see the
                # module docstring. Nulls here are the honest state, not a to-do.
                "source_url": None,
                "access_mode": "open",
                "version_label": None,
                "effective_from": None,
                "effective_to": None,
                "supersedes": [],
                "superseded_by": None,
                "publication_date": None,
                "retrieved_at": None,
                "verification_status": "unverified",
                "checksum": None,
                "parser": "pdf_layout",
                "chunking_profile": "statute_section_aware",
                "tags": {
                    "ip_rights": ip_rights,
                    "regulatory_areas": regulatory_areas,
                    "product_classes": [],
                },
            }
        )

    return {
        "corpus_version": "0.0.0-unbuilt",
        "generated_by": "scripts/build_manifest.py",
        "group_order": GROUP_ORDER,
        "note": (
            "The planned Layer 1 source set. Nothing here has been fetched: "
            "source_url, effective dates and checksums are filled by the "
            "ingestion pipeline in Phase 11, from the document itself."
        ),
        "documents": documents,
    }


def main() -> int:
    manifest = build()

    # Validate each entry against the real Document model before writing, so a
    # typo here fails now rather than at render time.
    from app.models.domain import Document

    for entry in manifest["documents"]:
        fields = {k: v for k, v in entry.items() if k in Document.model_fields}
        Document.model_validate(fields)

    ids = [d["document_id"] for d in manifest["documents"]]
    duplicates = {i for i in ids if ids.count(i) > 1}
    if duplicates:
        raise SystemExit(f"duplicate document ids: {sorted(duplicates)}")

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"wrote {MANIFEST_PATH} with {len(ids)} documents")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
