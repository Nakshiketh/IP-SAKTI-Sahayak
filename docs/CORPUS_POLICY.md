# PART 3 — Sources and data specification

Corpus policy. Two layers, never mixed.

- **Layer 1 — normative corpus.** Answers *what is required*. Citable as authority.
- **Layer 2 — records.** Answers *what has been filed, granted or registered*. Evidential only.
  Never embedded, never citable, never rescues an abstention.

---

## 3.1 Layer 1 — normative corpus

### India, intellectual property

| Regime | Instruments |
| --- | --- |
| Patents | Patents Act 1970 as amended; Patents Rules 2003 with the 2024 amendment rules; Manual of Patent Office Practice and Procedure; guidelines for examining applications relating to traditional knowledge and biological material |
| Geographical indications | GI of Goods (Registration and Protection) Act 1999; GI Rules 2002 |
| Trade marks | Trade Marks Act 1999; Trade Marks Rules 2017; Registry manual |
| Copyright | Copyright Act 1957; Copyright Rules 2013 |
| Designs | Designs Act 2000; Designs Rules 2001 |
| Plant varieties | Protection of Plant Varieties and Farmers' Rights Act 2001 and Rules |
| Trade secrets | No standalone statute — index contract and confidentiality guidance, and state the gap explicitly rather than implying coverage |

### India, biodiversity and ABS

Biological Diversity Act 2002 as amended in 2023; Biological Diversity Rules 2024; National
Biodiversity Authority guidelines and ABS forms; state biodiversity board procedures where published.

### India, drug, food, cosmetic and advertising

Drugs and Cosmetics Act 1940; Drugs and Cosmetics Rules 1945, ASU-relevant rules and schedules
including GMP requirements and the list of authoritative books; Drugs and Magic Remedies
(Objectionable Advertisements) Act 1954 and Rules; FSSAI Food Safety and Standards (Ayurveda Aahara)
Regulations 2022 and related labelling and claims regulations; Legal Metrology (Packaged Commodities)
Rules 2011; relevant BIS standards.

### India, standards and traditional knowledge

Ayurvedic Pharmacopoeia of India, all parts; Ayurvedic Formulary of India; Essential Drugs List
(Ayurveda); AYUSH notifications, guidelines and pharmacovigilance material; documentation on the
Traditional Knowledge Digital Library including its access model.

### International, IP

TRIPS; Paris Convention; Berne Convention; Convention on Biological Diversity; Nagoya Protocol; WIPO
Treaty on Genetic Resources and Associated Traditional Knowledge (2024); Patent Cooperation Treaty;
Madrid Protocol; Hague Agreement; Budapest Treaty; Lisbon Agreement and Geneva Act; WIPO IGC documents
on traditional knowledge.

### International, herbal market access

- **United States:** dietary supplement framework, cGMP for supplements, new dietary ingredient
  notification, labelling and claims.
- **European Union:** traditional herbal medicinal products directive, herbal monographs, nutrition
  and health claims regulation, novel food regulation.
- **United Kingdom:** traditional herbal registration scheme.
- **Canada:** natural health products regulations and monographs.
- **Australia:** listed medicines and permissible indications.
- **WHO:** traditional medicine strategy, good agricultural and collection practices for medicinal
  plants, quality control methods for herbal materials.

**Scope discipline:** start with India, UK, EU and US only. Four jurisdictions done properly beats
twelve done shallowly, and a cross-border demo needs exactly two sides.

---

## 3.2 Layer 2 — records

- **Ingestible, open data** — patent application datasets; weekly published applications; weekly
  granted applications; aggregate invention-wise grant statistics (analytics only, never cited).
- **Portal, link-out only** — Patent Public Search; IP India e-services and register. Interactive,
  session-based, no bulk export, terms generally prohibit automated retrieval. The product links out
  and never claims to have run the search.
- **Registries to add once the layer exists** — India: GI public register, trade marks public search,
  copyright register, plant variety registry, published ABS approvals, AYUSH manufacturer listings.
  International: WIPO Patentscope, Global Brand Database, Global Design Database, Lisbon Express;
  Espacenet; Madrid Monitor.

**Rule throughout:** bulk and downloadable → ingest. Interactive and session-based → link out.

---

## 3.3 Document manifest entry

Fill `source_url`, `version_label`, `effective_from` and `publication_date` **only** from the document
actually fetched. Leave null and set `verification_status: "unverified"` rather than guessing.

The pipeline enforces this from both directions. A row with a null `source_url` is *skipped* with
that as the reason — not an error, just the honest state of a source nobody has fetched. A row that
*was* fetched and still has no `effective_from` is a *failure*, and the document does not enter the
index, because an answer citing it would carry an as-of date the corpus cannot support. And the
ingest never writes `verification_status` back: a machine cannot promote a document to verified,
because verified means a person read it against the source.

```json
{
  "document_id": "in-patents-act-1970",
  "title": "The Patents Act, 1970",
  "short_title": "Patents Act",
  "organization": "Government of India",
  "jurisdiction": "IN",
  "regime_family": "patents",
  "document_type": "act",
  "language": "en",
  "source_url": null,
  "access_mode": "open",
  "version_label": null,
  "effective_from": null,
  "effective_to": null,
  "supersedes": [],
  "superseded_by": null,
  "publication_date": null,
  "retrieved_at": null,
  "verification_status": "unverified",
  "checksum": null,
  "parser": "pdf_layout",
  "chunking_profile": "statute_section_aware",
  "tags": {
    "ip_rights": ["patent", "traditional_knowledge"],
    "regulatory_areas": [],
    "product_classes": ["new_non_classical_drug", "phytopharmaceutical"]
  },
  "notes": "Index the exclusions from patentability and the biological-source disclosure requirements with particular care; these drive most Ayurveda patent answers."
}
```

## 3.4 Chunk record

A chunk id is the section key — the document id plus a slug of the section path — followed by eight
characters of the content hash. Identical wording therefore produces an identical id without
anything being compared, which is what lets a re-ingest tell an amended section from one that is
simply gone. The alphabet is `[a-z0-9-]`, because a citation id *is* a chunk id and the interface
builds element ids from it.

```json
{
  "chunk_id": "in-patents-act-1970-chapter-ii-section-3-a1b2c3d4",
  "document_id": "in-patents-act-1970",
  "text": "<verbatim provision text as parsed>",
  "section_path": ["Chapter II", "Section 3", "(p)"],
  "heading": "What are not inventions",
  "page_from": 12,
  "page_to": 12,
  "token_count": 84,
  "jurisdiction": "IN",
  "ip_rights": ["patent", "traditional_knowledge"],
  "regulatory_areas": [],
  "product_classes": ["classical_generic", "patent_proprietary"],
  "effective_from": null,
  "effective_to": null,
  "verification_status": "unverified",
  "embedding_ref": "faiss:in::14822"
}
```

## 3.5 Records manifest entries

```json
{
  "source_id": "in-patent-applications-bulk",
  "name": "Patent Application Dataset",
  "publisher": "<verify at fetch time>",
  "jurisdiction": "IN",
  "record_type": "patent_application",
  "access_mode": "bulk_open",
  "source_url": null,
  "licence": null,
  "licence_url": null,
  "attribution_text": null,
  "update_cadence": "unknown_until_verified",
  "parser": "csv",
  "field_map": {
    "record_id": "<source column>",
    "title": "<source column>",
    "applicant": "<source column>",
    "filing_date": "<source column>",
    "status": "<source column>"
  },
  "citable_in_answers": false,
  "notes": "Evidential only. Never enters the vector index."
}
```

```json
{
  "source_id": "in-patent-public-search",
  "name": "Patent Public Search",
  "jurisdiction": "IN",
  "record_type": "patent_application",
  "access_mode": "portal_link_only",
  "link_template": "<verified base URL>?query={terms}",
  "terms_note": "Interactive service. No bulk retrieval. The product links out and does not run the search.",
  "citable_in_answers": false
}
```

---

## 3.6 Demo fixtures — Phases 3 to 9 only

Every demo record carries `"verification_status": "demo"`, `"is_demo": true`, and a `demo-` prefixed
document id. Build twelve demo answers covering:

1. a classical formulation patent question
2. a proprietary medicine question
3. a GI question
4. a trademark refusal question
5. a labelling question
6. an advertising-claim question
7. an ABS question
8. a cross-border UK question
9. a nutraceutical-versus-medicine classification
10. a copyright question on course material
11. a low-confidence answer
12. a full abstention

---

## 3.7 Gold evaluation set — seed, expand to 120

| # | Question | Jurisdiction | Expected |
| --- | --- | --- | --- |
| 1 | We prepare a classical formulation exactly as given in an authoritative text. Can we patent it? | IN | answer · patent + TK · classical_generic |
| 2 | We changed two ingredients and the dosage form. Does that change anything? | IN | clarify then answer · patent_proprietary |
| 3 | We isolated and standardised a single fraction from a herb. What are we now? | IN | answer · phytopharmaceutical |
| 4 | Can we trademark a brand name that is also a classical formulation name? | IN | answer · trademark |
| 5 | Our herb grows only in one district. What protects that? | IN | answer · geographical_indication |
| 6 | We wild-collect a herb and want to commercialise. What compliance applies? | IN | answer · abs_compliance |
| 7 | Must we disclose the biological source in a patent application? | IN | answer · patent + abs |
| 8 | Can we say our product "cures diabetes" on the pack? | IN | answer · advertising + labelling |
| 9 | Is our herbal drink a food or a medicine? | IN | clarify then answer |
| 10 | Can we sell the same product in the UK without changes? | INTL | answer · UK route, separate from IN |
| 11 | How do we protect the brand in eight countries at once? | INTL | answer · Madrid |
| 12 | We deposited a micro-organism — what treaty covers that? | INTL | answer · Budapest |
| 13 | Can I search the traditional knowledge digital library myself? | IN | answer · must state the access restriction |
| 14 | What dose should a 60-year-old take? | IN | abstain — medical, out of scope |
| 15 | Will my patent application be granted? | IN | abstain — no outcome prediction |
| 16 | What are the rules in Brazil? | INTL | abstain — outside sources, say so |
| 17 | మా ఆయుర్వేద ఉత్పత్తులను ఎగుమతి చేయాలంటే ఏమి కావాలి? | INTL | answer in Telugu, sources in original language |
| 18 | हमारे ब्रांड नाम को कैसे सुरक्षित कर सकते हैं? | IN | answer in Hindi · trademark |

Add 20 more India IP, 20 India regulatory, 15 ABS, 20 international, 10 cross-border, 12 more
abstention cases.
