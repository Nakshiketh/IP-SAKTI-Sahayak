# IP-SAKTI Sahayak — Master Build Document

Single source of truth for the build. Part 1 (project brief) lives at repo root in
`AGENTS.md` and is not duplicated here.

## How to use this

1. `AGENTS.md` carries the project brief. Every phase is executed against them.
2. Run one phase per agent task. Never two at once.
3. After Phases 1, 3, 4, 7 and 8, run the Review Gate (Part 6). Highest-value step in the document.
4. Commit and tag at each phase boundary (`git tag phase-3`).
5. Phases 0–9 give a fully demoable product on mock data. 10–13 make it real. If time runs
   short, ship 0–9 plus 11 and present the rest as roadmap.
6. Append to `docs/DECISIONS.md` every phase.

---

# PART 2 — Phases

## PHASE 0 — Scaffold, contracts, domain model

Set up the IP-SAKTI Sahayak monorepo per AGENTS.md. No UI screens yet.

1. Scaffold `/frontend`: Vite + React 18 + TypeScript strict + Tailwind + React Router.
   Path alias `@/`. ESLint + Prettier. vitest + testing-library.
2. Scaffold `/backend`: FastAPI, Pydantic v2, uvicorn, pytest, ruff. Health endpoint.
   Settings module reading `.env`. No secrets committed.
3. Define the domain model TWICE — Pydantic in `backend/app/models/`, mirrored TypeScript
   in `frontend/src/types/`. Add a test that fails on drift: generate JSON Schema from
   Pydantic, compare against a checked-in schema the TS types derive from.

Types, exactly:

    Jurisdiction    = "IN" | "INTL"
    IPRight         = "patent" | "trademark" | "geographical_indication" | "copyright"
                    | "design" | "plant_variety" | "trade_secret" | "traditional_knowledge"
    RegulatoryArea  = "licensing" | "manufacturing_gmp" | "quality_standards" | "labelling"
                    | "advertising" | "food_nutraceutical" | "cosmetic" | "clinical_evidence"
                    | "import_export" | "abs_compliance"
    ProductClass    = "classical_generic" | "patent_proprietary" | "new_non_classical_drug"
                    | "phytopharmaceutical" | "ayurveda_aahar" | "cosmetic" | "undetermined"
    Confidence      = "high" | "moderate" | "low" | "abstain"

    Document {
      document_id, title, short_title, organization, jurisdiction, regime_family,
      document_type ("act"|"rules"|"regulation"|"treaty"|"guideline"|"pharmacopoeia"
                     |"case_law"|"form"|"notification"),
      language, source_url, version_label, effective_from, effective_to,
      supersedes[], superseded_by, publication_date, retrieved_at,
      verification_status ("verified"|"unverified"|"demo"), checksum
    }

    Chunk {
      chunk_id, document_id, text, section_path (["Chapter II","Section 3","(p)"]),
      page_from, page_to, heading, token_count, embedding_ref, jurisdiction,
      ip_rights[], regulatory_areas[], product_classes[], effective_from, effective_to
    }

    Citation {
      citation_id, chunk_id, document_id, document_title, organization, jurisdiction,
      section_label, page, url, retrieval_score, rerank_score, verification_status,
      as_of_date
    }

    Record {   // Layer 2 — evidential, never authority
      record_id, source_id, jurisdiction, record_type, title, applicant,
      inventor_or_proprietor, filing_date, publication_date,
      grant_or_registration_date, status, classification_codes[], goods_or_field,
      abstract_text, snapshot_at, citable_in_answers (always false)
    }

    AnswerBlock { id, kind ("answer"|"why"|"what_to_check"|"caveat"), text, citation_ids[] }

    Answer {
      answer_id, query_id, jurisdiction, language, product_class, ip_rights[],
      regulatory_areas[], blocks[], citations[], related_records[], confidence,
      abstained, abstain_reason, escalation_offered, as_of_date, corpus_version,
      latency_ms, is_demo
    }

4. Create `docs/DECISIONS.md` and `docs/ARCHITECTURE.md` with initial entries.
5. Makefile: `make dev`, `test`, `lint`, `ingest`, `ingest-records`, `evals`.

**Done when:** `make test` passes, both apps boot, schema-drift test is green.

---

## PHASE 1 — Design system

Build the design system in `/frontend`. Tokens and primitives only, no pages.

**DESIGN DIRECTION — follow this, do not substitute a generic one.**

The reference object is a palm-leaf manuscript in a registry: incised ink, aged leaf,
lac-red seals, an inspector's indigo stamp. Not a wellness brand, not a legaltech template.

Palette — six tokens, as CSS variables and Tailwind theme:

    --ink   #101A14  near-black with a green cast; text and dark surfaces
    --leaf  #1D4B36  deep botanical green; primary
    --sap   #3E7D5A  lighter green; interactive states, success
    --bone  #F6F4EE  page background — warm but desaturated, NOT cream-orange
    --lac   #9B2C1F  lac red; ONLY for caution and for the system declining to answer
    --stamp #2B4C8C  registry indigo; ONLY for verification, sourcing and citations

Two accents, two jobs. Neither is ever decorative. A user should learn "indigo means this
is sourced" within one screen, without being told.

Typography:
- Display: Tiro Devanagari Hindi / Tiro Tamil / Tiro Telugu / Tiro Bangla — one designed
  family across scripts, so a Telugu heading has the same voice as English.
- UI/body: IBM Plex Sans, with Noto Sans Devanagari / Telugu / Tamil / Bengali as per-script
  fallbacks. Configure `font-family` per `:lang()` selector. Subset and preload per script —
  a Telugu heading must never flash Latin fallback first.
- Scale 1.25 ratio. Body 16/1.6. Measure capped at 68ch.

Structural language — this carries meaning, not decoration:
- Sourced content sits inside a left indigo rule, 2px. Unsourced or illustrative content
  sits inside a dashed neutral rule. This one device runs through the whole product.
- IP and regulatory content are distinguished by an incised-line motif as well as colour,
  for accessibility.
- Numbered markers ONLY where content is genuinely a sequence: the classification flow,
  the pipeline. Nowhere else.
- Border radius is a small deliberate set varied by role — hairline for data surfaces,
  slightly softer for controls. Not one radius on everything.

Motion: one orchestrated reveal on the homepage hero, plus motion that answers user action
(drawer opening, source expanding, answer streaming, classification advancing). No
scroll-triggered fade-up. No hover lift on cards. Honour `prefers-reduced-motion`.

BANNED, absolutely — check output against this list before finishing: cream/parchment
background near #F4F1EA with serif display and terracotta near #D97757; gradients of any
kind including gradient text and borders; glassmorphism or frosted panels; neon, glow,
particles, floating orbs; identical rounded cards with the same rgba(0,0,0,.1) shadow for
every content type; a coloured rounded square with an icon above every card heading;
ALL-CAPS letter-spaced eyebrow labels; meta strings joined with middle dots as decoration;
"->" appended to link and button text; one word in a headline coloured or italicised for
emphasis; emoji as interface icons; symmetrical three-column grids for content that is not
three parallel things; vector illustrations of people, robots, brains, circuit boards or
shields-with-checkmarks; stock photos of labs or herbs in bowls; invented statistics,
testimonials or "trusted by" strips.

Build these primitives with examples on a dev-only `/design` route:
Button (primary / secondary / quiet / danger), Chip, Badge, Card in three genuinely distinct
variants, SourceRule, RecordCard (neutral, visually distinct from sources), Callout (info /
caution / abstain), Tabs, Select, Drawer, BottomSheet, Tooltip, Skeleton, Disclosure,
JurisdictionToggle (segmented, two states, strong), ConfidenceMeter (four states, always with
a one-sentence reason, never a bare number).

Accessibility: AA contrast on all six palette pairings verified with a tool; focus rings 2px
`--stamp` with offset; full keyboard operation; semantic landmarks; `aria-live` for streaming
answers.

**Done when:** `/design` renders every primitive, keyboard-only navigation works, axe reports
zero violations, and you have stated in writing which banned items you checked for.
**Run the Review Gate after this phase.**

---

## PHASE 2 — Shell, navigation, i18n

Routes: `/`, `/sahayak`, `/what-is-covered`, `/how-it-works`, `/sources`, `/about`.
No team page, no sponsors, nothing competition-related.

Header:
- Wordmark "IP-SAKTI Sahayak" in the display face, descriptor beneath at small size:
  "Ayurveda, intellectual property and regulation".
- Nav, six items, no dropdowns, no sub-navigation:
  Home · Ask Sahayak · What's covered · How it works · Sources · About
- Right: language selector (globe + current language in its own script) and the primary
  CTA "Ask Sahayak".
- Mobile: full-screen menu, focus-trapped, Esc closes, focus restored on close.

Persistent footer strip on every page — not sticky, not dismissible:
"IP-SAKTI Sahayak provides information retrieved from published legal and regulatory sources.
It does not provide legal advice, grant intellectual-property rights, approve products, or
replace any regulatory authority. Verify important decisions against current official sources
and a qualified professional."
Plus "Sources as of {date} · {n} documents · v{corpus_version}" from a single source of truth,
never hard-coded in JSX.

i18n:
- react-i18next with `/frontend/src/locales/{en,hi,te,ta,bn,mr}/{common,home,sahayak,covered,
  howitworks,sources,about}.json`. English complete; others seeded with the same keys, English
  values, and `"__untranslated": true`.
- `scripts/i18n-coverage.ts` prints a per-locale table.
- No hard-coded user-facing strings anywhere — add an ESLint rule enforcing it.
- Set `html lang` and `dir` from the active locale.

**Done when:** all six routes render, the language selector switches and persists locale,
coverage reports six locales, and the no-hard-coded-strings lint passes.

---

## PHASE 3 — Homepage

Six sections, no more. Use the Phase 1 system.

**1. HERO — with a working question box in it.**
Headline, display face, three lines, no coloured word:

    Ancient knowledge.
    Protected innovation.
    Grounded guidance.

One sentence beneath: "Ask about protecting, registering, manufacturing or selling an
Ayurvedic product, and get an answer built from published sources — with every claim cited,
and the Indian and international positions kept separate."

Then a real, working question input. Submitting it navigates to `/sahayak` with the question
already running. Nothing sells the product like the product.
NO badge row. NO chips joined by middle dots. NO secondary CTA competing with the input.

Hero visual: an SVG composition of a palm-leaf manuscript page whose incised lines resolve
into a retrieval graph — leaf ribs becoming edges, seals becoming nodes. One orchestrated
draw-on for the page load, respecting reduced motion, then static. This is the single
memorable element on the entire site. Everything else stays quiet.

**2. THE COUPLING INSIGHT — one worked example, not abstract cards.**
A hypothetical polyherbal formulation for joint pain, shown three ways: as a classical
formulation taken unchanged from an authoritative text, as a proprietary medicine, as a new
non-classical drug. For each: what IP is realistically available, what regulatory route
applies, what ABS duty attaches. Present as a comparison table, not as three cards. Label the
block "Illustrative example" and keep legal specifics high-level here.

**3. WHAT IT COVERS — the IP / regulation distinction.**
Two visually distinct panels.
- Left, intellectual property: "How do I secure or understand rights in this?"
  Patents · Trademarks · Geographical indications · Copyright · Designs · Plant variety
  rights · Trade secrets · Traditional knowledge
- Right, regulation: "What am I required to do before I can sell this?"
  Product classification · Licensing · Manufacturing and GMP · Quality standards · Labelling ·
  Advertising · Food and cosmetic routes · Access and benefit sharing

Beneath both, one full-width band: across borders, the Indian answer and the export answer are
produced separately and never merged.

**4. A REAL ANSWER — rendered with the actual Answer component and demo fixtures.**
Question: "We have modified a classical polyherbal formulation and want to sell it in India and
the UK. What should we work out first?"
Show confidence, product classification, jurisdiction tabs (India | UK), the four answer
blocks, claim-level citation markers, and source cards. Header chip: "Illustrative example —
demo sources". Every citation shows verification_status demo.

**5. LANGUAGES.** Six cards, each showing a real sample question in its own script — English,
हिंदी, తెలుగు, தமிழ், বাংলা, मराठी — plus "detect automatically". One line noting the translation layer
plugs into national language infrastructure (Bhashini) and that source documents stay in their
original language for checking.

**6. CLOSING.** State the limitation honestly in one short paragraph, then a single CTA.

DELETED deliberately: a "why this is hard" marketing section, and a "how a question becomes an
answer" strip — the latter lives on `/how-it-works`.

Vary the structural pattern between sections. If more than two sections are "heading +
subheading + three equal cards", restructure them.

**Done when:** responsive 360–1920, Lighthouse a11y >= 95, no layout shift, all copy from
locale files, the hero input actually works, hero animation respects reduced motion.
**Run the Review Gate after this phase.**

---

## PHASE 4 — "What's covered"

Build `/what-is-covered`. This is the page that proves domain depth. Content-led, dense,
text-forward. Reference material should look like reference material — that density is the
credibility signal. Not eight marketing cards.

H1: "Understanding Ayurveda's IP and regulatory landscape"
Sub: "Different parts of an Ayurvedic product raise different questions. This page maps which
is which."

**A. THE DISTINCTION, EXPLAINED ONCE, PROPERLY.**
IP asks: how do I secure or understand rights in this? Regulation asks: what must I do before
I can make, sell or advertise this? Then the coupling: for Ayurveda these are joined, because
the regulatory classification of a formulation determines the IP available to it.
Render the coupling as a matrix — rows are product classes; columns are IP posture, regulatory
route, ABS posture. Short cells. Any cell without a source reads "pending source" rather than
guessing.

**B. RIGHTS — one section each, layout varying with content weight.**
For each: what it protects · how it appears in Ayurveda · a real user question · what it does
NOT do · which jurisdiction.
- Patents — why novelty and inventive step are the hard part for classical formulations; the
  exclusion of traditional-knowledge aggregation; documented traditional knowledge as prior art.
- Geographical indications — regional herbs and preparations; producer collectives rather than
  single owners; what a GI does not give you.
- Trademarks — brand names for ASU products; marks descriptive of a classical formulation name;
  interaction with advertising restrictions.
- Copyright — texts, translations, course material, software, packaging artwork; classical text
  in the public domain versus an original commentary.
- Designs — bottle, dispenser, packaging form.
- Plant variety rights — cultivated medicinal plant varieties; farmers' rights.
- Trade secrets — process know-how, and its tension with disclosure in a patent application and
  in regulatory dossiers.
- Traditional knowledge — codified versus community-held; defensive protection; the 2024
  international treaty on genetic resources and associated traditional knowledge, and what a
  disclosure requirement means in practice.

**C. REGULATION — one section each.**
Product classification (lead with it, it drives everything) · manufacturing licence · GMP ·
quality and pharmacopoeial standards · labelling · advertising restrictions · food and
nutraceutical route · cosmetic route · clinical evidence for new drugs · import, export and
market access.

**D. ACCESS AND BENEFIT SHARING — its own section with real weight.**
Who owes duties; when access to a biological resource is triggered; which authority; what
benefit sharing means; how it interacts with a patent application. State explicitly that
obligations differ for Indian and foreign entities and that recent amendments changed the
position for some categories — with the corpus date shown.

EVERY factual statement carries an inline citation marker resolving to a corpus document. If
the corpus lacks the source, render the statement in a "pending source" state rather than
asserting it. Never invent a section number.

Sticky in-page contents. Deep links work (`#patents`, `#abs`). Print stylesheet.

**Done when:** every assertion is cited or visibly pending, and deep links resolve.
**Run the Review Gate after this phase.**

---

## PHASE 5 — How it works

Build `/how-it-works`. Two audiences: someone assessing the engineering, and a practitioner
deciding whether to trust it. This is the ONLY page where technical vocabulary is allowed.

1. **THE PIPELINE, as an interactive diagram.**
   Question -> language detection -> query understanding (intent, IP type, regulatory area,
   product-class hints) -> clarifying questions if class is undetermined -> jurisdiction split
   -> hybrid retrieval per namespace -> cross-encoder rerank -> context assembly with metadata
   -> generation constrained to context -> claim-to-passage citation mapping -> confidence
   scoring -> abstention check -> translation -> answer with sources.
   Each node clickable: what the stage does, what it outputs, what happens when it fails.
   Advances on click, not on a timer.
2. **WHY RETRIEVAL, HONESTLY.** Without it, a model answers from training data: undated,
   unattributed, and confidently wrong on amended law. With it, answers are constrained to a
   curated, version-tracked corpus and each claim points at the passage behind it. State
   plainly: this reduces and localises hallucination. It does not eliminate it. That is why
   every claim is checkable and why the system abstains.
3. **ABSTENTION AS A FEATURE.** Show the real states with real UI: nothing relevant found;
   sources conflict; sources out of date; question out of scope; question needs facts only a
   professional can assess. Each with what the user is offered next.
4. **KEEPING JURISDICTIONS APART.** Explain the two-namespace design, then show one question
   answered under India and under an export market side by side, with a note that these are
   never merged.
5. **ARCHITECTURE.** Layered diagram: client -> API -> orchestrator -> {query processor,
   classifier, retriever, reranker, context builder, generator, citation mapper, confidence
   scorer, translator} -> stores {vector index, chunk store, metadata DB, records DB, audit log}
   -> corpus pipeline {fetch, parse, section-aware chunk, embed, version-diff}. Show retriever
   metadata filters: jurisdiction, product class, IP right, regulatory area, effective date
   window, document type, language. Mark clearly which layers are live and which are planned —
   knowledge graph, agentic multi-source orchestration, subscription connectors.
6. **HOW IT IS EVALUATED.** The axes: answer accuracy, citation correctness, safe abstention,
   multilingual quality, jurisdiction purity, authority purity. Pull current numbers from the
   evals JSON summary with the run date. If a number is bad, show it — that reads as competence.

**Done when:** the diagram is keyboard-navigable, every stage has real copy, and nothing claims
a capability the code does not have.

---

## PHASE 6 — Sources page

Build `/sources`, driven entirely by `corpus/manifest.json` and `corpus/records-manifest.json`.
No hard-coded lists.

H1: "What this is built on"
Sub: "Every answer comes from these sources. Here is what is in them, where they came from, and
when they were last checked."

**SECTION 1 — Legal and regulatory sources (Layer 1, normative).**
Filterable and searchable, facets: jurisdiction, regime family, document type, verification
status, effective date. Each card: title · issuing organization · jurisdiction · document type ·
version · effective from (and to, if superseded) · last retrieved · verification status · link
to the official source · indexed passage count.
Groups: Indian IP regimes · Indian drug, food and cosmetic regulation · Biodiversity and ABS ·
Pharmacopoeial standards · Traditional knowledge resources · International IP treaties and
systems · International market access.

**SECTION 2 — Registry and records data (Layer 2, evidential).**
Separate section, visually distinct, with a standing note that these are records of what has
been filed or granted, not statements of law, and are never cited as authority. Each entry:
name · publisher · jurisdiction · record type · licence and verbatim attribution text · last
snapshot date · record count · whether it is ingested or link-out only.

**SECTION 3 — "How this is kept honest".** Commitments, each with the mechanism beside it:
- Prefer primary official sources -> ingestion rejects secondary sources unless flagged as commentary.
- Track versions and amendments -> effective_from / supersedes / superseded_by; superseded text
  is retained but never retrieved for current answers.
- Date every answer -> as_of_date and corpus_version on every response.
- Never assert beyond the sources -> abstention policy.
- Show uncertainty -> confidence with a stated reason.
- Let users check -> every citation links to the official source.
- Respect subscription sources -> never scraped; accessed only through the user's own
  credentials, with explicit per-session consent, each access logged and visible.
- Escalate -> route to a qualified IP facilitator for anything consequential.

**SECTION 4 — "What this does not cover".** Specific and unembarrassed: no clinical or dosage
advice; no drafting of applications; no opinion on whether an application will succeed; no
jurisdictions outside the list; no real-time registry status; no novelty conclusions.

**Done when:** the page renders from the manifests, facets work, and adding a source changes the
page with no code edit.

---

## PHASE 7 — Ask Sahayak: workspace

Build `/sahayak`. Build it mobile-first. If the answer, its confidence and one source card do
not read legibly at 360px without pinching, the design is wrong regardless of how the desktop
looks.

**DEFAULT STATE** — a single centred column at comfortable reading width. Do NOT open a
three-column workspace. Three columns is a state the product reaches, not a state it starts in.
Above the composer, one quiet summary line: "India · answering in English · product not yet
identified" — each part clickable to change. That is the entire context UI until the user wants
more. The sources panel does not exist until the first answer exists. Then it slides in.

**AFTER THE FIRST ANSWER** — Desktop >=1280px: centre conversation, right panel 360px for
sources, left context rail 280px available but collapsed by default. Tablet: right panel becomes
a drawer. Mobile: single column throughout; sources in a bottom sheet with a count badge.

**JURISDICTION TOGGLE** — the most visually prominent control on the page. India | International,
with a market selector when International. Changing it re-runs retrieval and visibly SWAPS the
answer set. Never blends.

**COMPOSER** — Placeholder: "Ask about protecting, registering, manufacturing or selling an
Ayurvedic product…". Input language auto-detected with a visible, correctable indicator:
"Detected: हिंदी — change".

Show THREE starter questions, with "More examples" revealing the rest:
- "We reformulated a classical preparation — is there anything patentable in it?"
- "What do we need in place before manufacturing an Ayurvedic product in India?"
- "What changes if we want to sell the same product in the UK?"

Full set behind the reveal, grouped as protecting an innovation / getting to market / using
biological resources / going abroad. Include at minimum:
- "Can we register our brand name if it contains a classical formulation name?"
- "Does our regional herb qualify for a geographical indication?"
- "Our product has a health claim on the label — what are the limits?"
- "Is our product a medicine, a nutraceutical or a cosmetic?"
- "We wild-collect a herb — what compliance applies before we commercialise?"
- "Do we need to declare the biological source in a patent application?"
- "How do we protect the brand in several countries at once?"

Header: "Sahayak", one line beneath — "Ask about intellectual property or regulation for an
Ayurvedic product. Answers are built from cited sources." Plus a small persistent "Information,
not legal advice" pill in `--lac`.

Keyboard: Cmd/Ctrl+K focuses composer, Cmd+Enter sends, Esc closes drawers, "/" opens starter
questions. Screen reader: answers announced `aria-live=polite`; retrieval status
`aria-live=assertive` only on state change.

**Done when:** a first-time user makes ZERO decisions before getting an answer; layout is correct
at 360 / 768 / 1280 / 1920; the page opens as one column and reaches three only after an answer
exists. **Run the Review Gate after this phase.**

---

## PHASE 8 — Answers, citations, confidence, abstention

Implement the answer experience against the mock service layer.

**RETRIEVAL STATUS — two lines, not six.** "Searching Indian sources…" then "Reading 7 passages
from 4 documents…". On completion collapse to one summary line: "7 passages from 4 documents ·
India · 1.8s". That line EXPANDS to reveal the full stage-by-stage breakdown with timings and the
retrieved passages with their scores. Depth is available; it is not the default. No fake typing
animation.

**ANSWER RENDERING.** Header row: confidence chip · jurisdiction badge · product class badge ·
as-of date · "Illustrative example" chip when `is_demo`.
Blocks in fixed order:
- Answer — 2 to 5 short paragraphs.
- Why this matters — the reasoning in plain language.
- What to check — a concrete ordered checklist the user can act on.
- Caveats — what this does not settle.

Claim-level citation: superscript markers inside sentences, resolving to the source panel. A
sentence with no citation renders with a subtle dashed underline and the tooltip "general
explanation, not from a specific source", so a user can see at a glance which sentences are
sourced. Follow-up chips generated from the answer's own gaps. Answers are copyable as clean text
with citations intact. Deep-linkable.

**SOURCE CARDS.** Title · organization · jurisdiction · document type · section · page · version ·
effective from · retrieved date · verification status · relevance bar · "Open source" · "Show the
passage" expanding the actual retrieved text. Verified renders in `--stamp`. Unverified neutral.
Demo gets a dashed border and the word "demo". Demo must never look verified.

**RELATED RECORDS** — a separate tab in the panel, never mixed with sources. Neutral border, no
indigo rule, persistent label "Filed or granted record — not legal authority", snapshot date shown.

**CONFIDENCE — computed in code, not by vibes.**
- high — >=3 passages above rerank threshold, from >=2 documents, no contradiction, all within the
  effective date window
- moderate — passages found but from a single document, or partially out of window
- low — weak scores, or detected tension between passages
- abstain — below retrieval floor, or out of scope

Always with the reason in one sentence: "Based on 4 passages from 2 current sources." Records never
raise or lower confidence.

**ABSTENTION — first-class states, not an error toast.**
1. Nothing relevant: "I couldn't find anything in these sources that answers this reliably."
   Offers: rephrase · pick a jurisdiction · name the product type · see what's covered · send to a human.
2. Out of scope: medical or dosage advice, individual legal opinion, predicting an outcome, drafting
   an application. Say what it can do instead.
3. Sources disagree or are outdated: show both passages with dates, say plainly the position may have changed.
4. Needs facts not given: ask the ONE most decisive question.

Uses `--lac`, never dressed up as an answer, always logged for evals.

CRITICAL: the presence of related records never rescues an abstention. It still abstains, and may
additionally show records.

**ESCALATION.** A persistent "Get someone to look at this" on every answer. Opens a form packaging
the question, jurisdiction, product class and retrieved sources into a summary the user can copy or
send. Do not fake a live expert network — an honest handoff summary plus links to official
facilitation channels is the real feature.

**Done when:** all four abstention states trigger from fixtures; citation hover-linking works both
directions; confidence comes from the scoring function; an abstention with records present still
reads unambiguously as an abstention; a screen reader reads the answer in order.
**Run the Review Gate after this phase.**

---

## PHASE 9 — Classification, ABS, prior art

The phase that wins the demo. Do not skip it.

Build the three guided flows. None of them is a nav item. Each is offered by an answer that needed
it, as a card inside that answer: "This depends on what your product is regulatorily. Work it out —
5 questions."

**FLOW A — "What is your product, regulatorily?"**
An adaptive questionnaire asking the MINIMUM questions to reach a ProductClass. Implement as a
decision graph in `backend/app/services/classification/`, with the graph in a JSON or YAML data
file, not in code, so it can be revised without a deploy.

Questions, order adapting, skipping anything already known:
1. Is the formulation and its method taken from an authoritative classical text, unmodified?
2. Have you changed ingredients, proportions, dosage form or method?
3. Are you making a specific therapeutic claim?
4. Is any ingredient a purified or standardised extract or fraction rather than a whole-plant preparation?
5. Is it intended as a food or supplement rather than a medicine?
6. Is it applied externally for appearance rather than therapeutic effect?
7. Does it contain a non-Ayurvedic or novel ingredient?
8. Do you have human evidence of safety and effectiveness?

Output card: determined class, or "more than one route may be open" with both; confidence, and
which answers drove it; three consequence panels, each cited — regulatory route · IP posture · ABS
posture; "What would change this" — the answer that moves it to another class.

The graph decides the CLASS. The corpus supplies the CONSEQUENCES — generate those panels from
retrieved passages, never from static legal assertions written into the graph. Missing corpus
renders "pending source". Once set, the class becomes session context, shows in the context line,
and can be overridden manually.

**FLOW B — Access and benefit sharing.** Short flow: who you are (Indian individual / Indian
company / foreign entity / registered practitioner / researcher); whether you access a biological
resource; research or commercial use; whether you intend to seek IP over a result; whether the
knowledge is codified or community-held. Output: which authority is likely involved, what step
usually comes first, what the benefit-sharing question is, how it interacts with a patent filing's
disclosure requirement. Every statement cited or marked pending. Ends with an explicit line that
this is an orientation aid and that the rules were recently amended — check the effective date shown.

**FLOW C — Prior-art orientation.** Given a formulation description: generate search terms
(Sanskrit and vernacular names, botanical binomials, classification codes, dosage-form terms); run a
keyword search against ingested records (Phase 12) and show what it found; build ready-made deep
links to portals that cannot be searched programmatically; render this fixed, non-dismissible
statement:

> "This is an orientation aid, not a novelty search. It covers only ingested records as of
> {snapshot_date} and not every database an examiner would consult. Finding nothing here does not
> mean an invention is new."

Never output a novelty conclusion. Never imply the traditional knowledge digital library has been
searched — it is access-restricted to patent offices under access agreements and cannot be searched
by this product. Say so, and say what to do instead.

**Done when:** each flow completes in under 8 questions, produces cited output, persists to session
context, and is fully keyboard and screen-reader operable.

---

## PHASE 10 — Real backend

Replace the mock layer with a working FastAPI backend. Interfaces stay identical.

Endpoints:

    POST /api/v1/query    {text, jurisdiction, market?, language_in, language_out,
                           product_class?, filters?, session_id} -> streams Answer
    POST /api/v1/classify  -> ProductClass + rationale
    POST /api/v1/abs-check -> ABS orientation
    GET  /api/v1/sources   -> manifest, filterable
    GET  /api/v1/sources/{id}
    POST /api/v1/feedback
    POST /api/v1/escalate
    GET  /api/v1/health, /api/v1/corpus-version

Pipeline (`backend/app/services/`):
1. `detect_language` — with confidence, returned to the UI for correction.
2. `understand_query` — intent, ip_rights[], regulatory_areas[], product-class hints, entities
   (herbs, dosage forms, markets), and whether clarification is required before answering at all.
3. `route` — select namespace by jurisdiction. India and International are SEPARATE indexes. A query
   never reads both in one retrieval call. Cross-border questions run two retrievals and return two
   answer sets.
4. `retrieve` — hybrid BM25 (SQLite FTS5 or rank_bm25) + dense (multilingual embedding model with
   strong Indic coverage, e.g. multilingual-e5 or BGE-M3), reciprocal rank fusion. Metadata
   pre-filters: jurisdiction, effective window (superseded excluded), document type, product class, topic.
5. `rerank` — cross-encoder over top 30 -> top 8. Record both scores.
6. `build_context` — pack passages with metadata headers (title, section path, version, effective
   date) so the model can attribute. Token budget enforced with document diversity: never fill the
   window from one document.
7. `generate` — strict system prompt: answer ONLY from the provided passages; every factual sentence
   carries a passage id; if the passages do not support an answer, return an abstention object; never
   state a section number not present in the passages; produce the four blocks plus a machine-readable
   claim-to-passage map. Use schema-constrained structured output, not prose parsing.
8. `map_citations` — validate every returned passage id exists. Drop any claim whose citation does not
   verify. If too many drop, downgrade confidence or abstain.
9. `score_confidence` — the Phase 8 rules.
10. `translate` — a Translator interface with two implementations: passthrough/LLM, and a
    BhashiniTranslator stub with the real request and response shape, selected by config. Translate the
    answer; never the citation metadata.
11. `audit` — append-only record of query, retrieved passage ids, model, prompt version, corpus
    version, latency, confidence, abstained, and consent events.

Guardrails:
- Refuse and redirect: diagnosis, dosage, treatment advice, individual legal opinion, or help
  concealing a compliance failure.
- Prompt-injection defence: corpus text is DATA, never instruction. Neutralise instruction-like
  content in retrieved passages before packing.
- Rate limiting, request size caps, no PII in logs, session ids not user ids.

`LLMClient` interface so a hosted or local model swaps without touching the pipeline.

**Done when:** the frontend runs unchanged against the real API by flipping one env var, every
endpoint is tested, and a query that should abstain abstains end to end.

---

## PHASE 11 — Corpus pipeline (Layer 1)

Build ingestion and versioning in `/scripts` and `/corpus`.

`corpus/manifest.json` is the single source of truth. Each entry carries the Document fields plus
fetch method, parser, chunking profile, licence note, and whether the source is open or
subscription-gated.

Stages (`scripts/ingest.py` — idempotent, resumable):
- **fetch** — download or load PDF/HTML/XML; store raw with checksum and retrieved_at.
  Subscription-gated sources are NEVER fetched here; marked `access_mode="user_credentialed"` and
  handled only at query time with logged consent.
- **parse** — PDF via pymupdf with layout retention; HTML via selectolax; keep page numbers. OCR
  fallback via tesseract only for scanned documents, flagged `ocr=true` and confidence-scored.
- **segment** — SECTION-AWARE chunking. This is the critical step for legal text. Split on the
  document's own structure — Chapter, Section, sub-section, clause; Article, paragraph; Rule,
  sub-rule — not on a fixed token window. Each chunk keeps its section_path so a citation says exactly
  where it came from. Target 300–800 tokens with 15% overlap WITHIN a section only, never across
  section boundaries. Long sections split by sub-clause, keeping the parent path.
- **enrich** — tag each chunk with jurisdiction, ip_rights[], regulatory_areas[], product_classes[],
  effective window. Rules file plus an LLM tagger whose output is written to `corpus/tags-review.jsonl`
  for human review.
- **embed** — multilingual embedding model; store vectors and chunk store.
- **version** — on re-ingest, diff against the previous version. Unchanged chunks keep their ids.
  Changed chunks get new ids; old ones get effective_to set. Write a human-readable
  `corpus/CHANGELOG.md`.
- **validate** — fail the build if a document lacks effective_from, a chunk lacks a section_path, a
  source_url is unreachable, or verification_status is unset.

`scripts/refresh.py` — re-fetch, diff, report. This is what makes "kept current" true rather than claimed.

Rules:
- Never commit a document you lack the right to redistribute. Store the fetch recipe and checksum; let
  the pipeline download at build time.
- Never hand-write a section number or date into any answer template.
- Anything not parsed and validated does not enter the index. Silence beats a wrong citation.

**Done when:** `make ingest` builds reproducibly from the manifest, `make refresh` reports a diff, and
validation fails loudly on a deliberately broken entry.

---

## PHASE 12 — Records layer (Layer 2)

Build the records layer. SEPARATE from the corpus. It must not enter the vector index and must never
be citable as legal authority.

**WHY SEPARATE.** The corpus is normative — it answers what is required, and can be cited as
authority. Records are evidential — they answer what has been filed, granted or registered. They are
tabular, far larger, and semantically thin. Embedding them into the same index pollutes retrieval and
produces citations that look authoritative but are not law.

**STORE** — `backend/app/records/`, SQLite in dev, Postgres-ready.
- `record_sources`: source_id, name, publisher, jurisdiction, record_type
  ("patent_application"|"patent_grant"|"gi_registration"|"trademark"|"design"|"plant_variety"|
  "abs_approval"|"aggregate_statistic"), access_mode ("bulk_open"|"api_open"|"portal_link_only"),
  licence, licence_url, attribution_text, source_url, update_cadence, last_snapshot_at,
  snapshot_checksum, record_count
- `records`: as defined in Phase 0, plus raw JSON of the original row and source_row_hash
- `record_snapshots`: snapshot_id, source_id, taken_at, rows_added, rows_changed, rows_removed,
  checksum — APPEND-ONLY. Never mutate a record in place; write a new snapshot and supersede the old.

Full-text index on title, abstract and applicant. NO embeddings.

**INGESTION** — `scripts/ingest_records.py`, config-driven from `corpus/records-manifest.json`.
- Bulk sources: download, validate schema against a checked-in expectation, map fields, diff against
  the last snapshot, write a new snapshot.
- Weekly sources: incremental append, idempotent on record_id + source_row_hash.
- Aggregate sources: load into a separate `aggregate_statistics` table (dimension, period, measure,
  value), flagged `citable_in_answers = false` at the schema level. Charts only.
- Portal-only sources: NO fetcher at all. Store a `link_template` with placeholders and a `terms_note`.
  The pipeline must REFUSE to write a fetcher for any source whose access_mode is portal_link_only.

Fail the run if the licence field is empty, schema drift is detected, or a mapped field is null in more
than 5% of rows. Before writing any fetcher, read the licence and terms for each source. Open government
data typically requires verbatim attribution and prohibits implying endorsement. Search portals typically
prohibit automated retrieval outright. Record the licence string per source and render it on `/sources`.
If a licence is unclear, treat the source as portal_link_only.

**SERVICE** — `backend/app/services/records_service.py`:
`search_records(query, record_type, jurisdiction, date_range, status, limit)`, `get_record(record_id)`,
`landscape(field, period)` -> aggregates for charts, `build_portal_link(source_id, params)` -> a deep
link, never a fetch.

**API** — separate endpoints from `/api/v1/query`: `GET /api/v1/records/search`, `/records/{id}`,
`/records/landscape`, `/records/sources`.

**ORCHESTRATION RULES — enforce in code, not in a prompt.**
1. A record is never packed into the LLM context as authority. If record text reaches the model at all,
   it is labelled in context "EVIDENCE — a filed or granted record, not a statement of law".
2. Confidence is computed only from corpus passages. Records neither raise nor lower it.
3. If the corpus abstains, records do NOT rescue the answer. It still abstains, and may additionally
   show related records.
4. Aggregate statistics can never attach to a claim about a specific product.

**UI** — the "Related records" tab from Phase 8, plus a "Search elsewhere" tab rendering portal deep
links, each with one line on what the user will find there and an explicit statement that the product has
not run this search.

**Done when:** records ingest reproducibly, portal-only sources have no fetcher anywhere in the codebase
(grep to confirm), the records tab is visually distinct from sources, and an abstention with records
present still reads as an abstention.

---

## PHASE 13 — Evaluation, trust, hardening

**A. EVALUATION HARNESS (`/evals`).**
Gold set, 120 questions minimum, `evals/gold/*.jsonl`, each with: id, question, language,
jurisdiction, expected_product_class, expected_ip_rights[], expected_regulatory_areas[],
must_cite_document_ids[], must_not_claim[], expected_behaviour ("answer"|"abstain"|"clarify"),
reference_answer.
Composition: 60 India, 30 international, 15 cross-border, 15 deliberately unanswerable or out of scope;
at least 5 per non-English language.

Metrics (`evals/score.py` -> `evals/reports/*.md` and a JSON summary):

    answer_accuracy        LLM-as-judge against reference, with a human spot-check column
    citation_correctness   % of claims whose cited passage actually supports them
    citation_validity      % of citations resolving to a real current passage — must be 100%
    abstention_precision   abstains when it should
    abstention_recall      does not abstain when it shouldn't
    jurisdiction_purity    % of answers with no cross-jurisdiction contamination — target 100%
    authority_purity       % of answers where no record appeared as a citation — target 100%
    classification_acc     product class correctness
    multilingual_quality   round-trip plus native-speaker rubric on a 30-question subset
    latency                p50 / p95

Add a records regression set: 10 questions where records should appear as related records; 10 where a
record exists but the corpus abstains and the system must still abstain; 5 asking for a novelty verdict,
which must refuse to conclude. Wire to `make evals`. Publish current numbers on `/how-it-works` with the
run date.

**B. TRUST AND COMPLIANCE.**
Privacy page: what is stored (question text, session id, retrieved passage ids, feedback), what is not
(identity, no third-party sharing), retention, deletion path, lawful basis. Aligned to the Digital
Personal Data Protection framing: purpose limitation, data minimisation, consent for anything beyond the
core function, and a visible withdraw-consent action.
Consent modal for any subscription source: names the source, states the user's own credentials will be
used, requires explicit action, logs the event with a timestamp shown back in an "Access log" the user
can open. Audit log viewer on a dev/admin route.
Security floor: input validation on every endpoint, output encoding, CSP, no secrets client-side,
dependency audit in CI, rate limits, and `docs/SECURITY.md` covering prompt injection via corpus text,
citation spoofing, and jurisdiction leakage.

**C. HARDENING AND POLISH.**
Error boundaries with useful recovery copy; offline state; retry with backoff. Streaming with graceful
partial failure — if citation mapping fails, downgrade to abstention rather than showing an uncited
answer. Performance: route-level code splitting, optimised SVG, LCP < 2.0s on 4G, bundle budget enforced
in CI, useful render with slow JavaScript. Accessibility: axe clean, manual keyboard pass on every flow,
screen-reader pass on the answer component, contrast verified on all six palette pairings,
reduced-motion honoured. 404 and offline states designed, not default. Distinct descriptive `<title>` and
meta description per page. Print stylesheet on `/what-is-covered` and on answers.
README, public-facing: what it is, the insight, the architecture, how to run, source policy, evaluation
results, limitations, licence. `docs/DEMO.md`: a five-minute scripted walkthrough — classify a product,
ask an Indian question, flip to international, trigger an abstention, open a source passage, show the eval
numbers. Rehearse against it twice.

**Done when:** `make evals` produces a report, every metric has a number, jurisdiction purity and
authority purity are 100%, and the demo script runs end to end without a manual step.
