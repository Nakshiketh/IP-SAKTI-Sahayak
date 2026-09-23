"""What is still missing, the one question worth asking next, and the words of a reply.

Required before an analysis: what kind of product it is, the ingredients, their
quantities and what it is for. Everything else sharpens the assessment and is
asked once — never again once answered or declined.

Every explanation here is composed from the stored analysis. Nothing is said
about a product or a record that the findings do not contain.
"""

from __future__ import annotations

from app.analyst.lexicon import FORMS_BY_ID
from app.analyst.models import Analysis, DialogueState, Invention, ProductMatch

REQUIRED = ("form", "ingredients", "quantities", "use")
RECOMMENDED = (
    "percent_total",
    "purpose",
    "process",
    "novelty",
    "problem",
    "evidence",
    "disclosure",
    "brand",
)

QUESTIONS = {
    "form": "What kind of product is it — a face pack, a hair oil, a churna, a cream, something else?",
    "ingredients": (
        "Tell me the ingredients and their exact quantities or percentages. A simple list works, "
        "for example: Neem 10%, Turmeric 10%, Multani mitti 40%."
    ),
    "quantities": "I still need the amount of {names}. What is the exact quantity or percentage of each?",
    "use": "What is it for — what should it do for the person using it?",
    "percent_total": "Your percentages add up to {total}%. Is an ingredient missing, or should one of them change?",
    "purpose": (
        "What does each ingredient do in the formulation? For example: multani mitti for oil absorption, "
        "sandalwood for soothing. Say skip if you would rather not."
    ),
    "process": (
        "How do you prepare it? The steps, and any conditions that matter — drying, grinding, sieve size, "
        "temperature, mixing order."
    ),
    "novelty": "What do you believe is new or different about it, compared with what is already sold?",
    "problem": "What problem does it solve that existing products do not?",
    "evidence": (
        "Have you tested it — stability, a patch test, a comparison with other packs? An examiner asks for "
        "results when a combination is said to do more than its ingredients do separately."
    ),
    "disclosure": "Has the formulation been made public yet — sold, published, shown at an exhibition, or printed in full on a label?",
    "brand": "Will you sell it under a brand name? If so, what is it?",
}

SUGGESTIONS = {
    "form": ["Face pack", "Hair oil", "Churna", "Cream"],
    "purpose": ["Skip"],
    "process": ["Skip"],
    "novelty": ["Skip"],
    "problem": ["Skip"],
    "evidence": ["Not tested yet", "Skip"],
    "disclosure": ["Not yet public", "Already sold"],
    "brand": ["No brand yet"],
}
AFTER_ANALYSIS = [
    "Why is the closest product similar?",
    "What makes mine different?",
    "What information is missing?",
    "Run the analysis again",
]

USE_LABELS = {
    "cleansing": "cleansing", "oil_control": "oil control", "acne": "acne and pimples",
    "pores": "pores and blackheads", "soothing": "soothing", "brightening": "brightening and glow",
    "exfoliation": "exfoliation", "tan_pigmentation": "tan and pigmentation", "hydration": "hydration",
    "anti_ageing": "anti-ageing", "antimicrobial": "antibacterial", "skin_care": "general skin care",
    "hair_removal": "unwanted hair", "hair_fall": "hair fall", "dandruff": "dandruff",
    "hair_growth": "hair growth", "digestion": "digestion", "immunity": "immunity",
    "joint_pain": "joint pain", "stress_sleep": "stress and sleep", "respiratory": "cough and throat",
    "oral_care": "oral care",
}  # fmt: skip

INDICATOR_LABELS = {
    "potentially_novel": "Potentially novel",
    "further_assessment": "Further assessment required",
    "high_similarity": "High similarity",
}

GREETING = (
    "Describe your invention in your own words — what it is, what goes into it and what it is for. "
    "I will ask only for what I still need, compare it with the products and records I can search, "
    "and give you a preliminary view with the evidence behind it. This is not legal advice."
)


def form_label(form: str | None) -> str:
    return FORMS_BY_ID[form].names[0] if form in FORMS_BY_ID else "product"


def listing(items: list[str]) -> str:
    items = [item for item in items if item]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def percent_total(invention: Invention) -> float | None:
    values = [i.effective_percent for i in invention.ingredients]
    if not values or any(value is None for value in values):
        return None
    return round(sum(v for v in values if v is not None), 2)


def missing(invention: Invention, state: DialogueState) -> list[str]:
    out: list[str] = []
    if not invention.form and not invention.category:
        out.append("form")
    if not invention.ingredients:
        out.append("ingredients")
    elif any(not i.has_quantity for i in invention.ingredients):
        out.append("quantities")
    if not invention.intended_use and not invention.use_terms:
        out.append("use")
    total = percent_total(invention)
    if (
        total is not None
        and abs(total - 100) > 0.5
        and all(i.percent is not None for i in invention.ingredients)
    ):
        out.append("percent_total")
    if invention.ingredients and any(not i.purpose for i in invention.ingredients):
        out.append("purpose")
    if not invention.process_steps:
        out.append("process")
    if not invention.distinctive_features:
        out.append("novelty")
    if not invention.problem:
        out.append("problem")
    if not invention.evidence:
        out.append("evidence")
    if invention.disclosure is None:
        out.append("disclosure")
    if invention.brand_name is None:
        out.append("brand")
    return [slot for slot in out if slot not in state.declined]


def is_ready(missing_slots: list[str]) -> bool:
    return not any(slot in REQUIRED for slot in missing_slots)


def next_question(
    invention: Invention, state: DialogueState, missing_slots: list[str]
) -> str | None:
    for slot in missing_slots:
        if slot in REQUIRED:
            return slot
    for slot in missing_slots:
        if slot not in state.asked:
            return slot
    return None


def question_text(slot: str, invention: Invention) -> str:
    if slot == "quantities":
        names = [i.name for i in invention.ingredients if not i.has_quantity]
        return QUESTIONS[slot].format(names=listing(names))
    if slot == "percent_total":
        return QUESTIONS[slot].format(total=percent_total(invention))
    return QUESTIONS[slot]


# -- explanations --------------------------------------------------------------


GENERIC_NAME_WORDS = frozenset(
    {"face", "pack", "powder", "mask", "with", "natural", "herbal", "bright", "glow"}
)


def _product_line(match: ProductMatch) -> str:
    brand = f" by {match.brand}" if match.brand else ""
    return f"{match.name}{brand}"


def _find_product(analysis: Analysis, target: str | None) -> ProductMatch | None:
    candidates = analysis.products.matches + analysis.products.weaker
    if not candidates:
        return None
    if target:
        wanted = f" {target.lower()} "
        # Brand first, then the words of a name that are not just "face pack".
        for match in candidates:
            if match.brand and f" {match.brand.lower()} " in wanted:
                return match
        for match in candidates:
            words = [
                w for w in match.name.lower().split() if len(w) > 3 and w not in GENERIC_NAME_WORDS
            ]
            if any(f" {word} " in wanted for word in words):
                return match
    return candidates[0]


def summary(analysis: Analysis, invention: Invention) -> str:
    total = len(invention.ingredients)
    products = analysis.products
    lines = ["Here is the preliminary picture, based only on what I could search:"]
    if products.matches:
        closest = products.matches[0]
        lines.append(
            f"- Similar products: {len(products.matches)} of the {products.dataset_size} products in the reference set "
            f"are close. The closest, {_product_line(closest)}, shares {closest.shared_count} of your {total} ingredients."
        )
    else:
        lines.append(
            f"- Similar products: none of the {products.dataset_size} products in the reference set is close."
        )
    knowledge = analysis.knowledge
    line = f"- Traditional knowledge: {knowledge.traditional_count} of your {total} ingredients are in the traditional-use reference list."
    if knowledge.classical:
        line += f" It matches the classical formulation {knowledge.classical[0].label}."
    lines.append(line)
    prior = analysis.prior_art
    if prior.state == "not_loaded":
        lines.append(
            "- Patents and prior art: no patent records are held on this site, so patents were not searched here. "
            "The registries to search are listed in the findings."
        )
    elif prior.state == "failed":
        lines.append(
            "- Patents and prior art: the records search failed, so no patent was compared. Try again shortly."
        )
    else:
        lines.append(
            f"- Patents and prior art: {len(prior.matches)} of {prior.record_count} records share features with it."
        )
    lines.append(f"- Preliminary indicator: {INDICATOR_LABELS[analysis.assessment.indicator]}.")
    lines.append("The comparison, the reasons and the sources are in the findings panel.")
    return "\n".join(lines)


def explain_product(analysis: Analysis, target: str | None) -> str:
    match = _find_product(analysis, target)
    if match is None:
        return "No product in the reference set was close enough to flag, so there is nothing to explain yet."
    shared = [row.label for row in match.rows if row.status == "common"]
    added = [row.user_name or row.label for row in match.rows if row.status == "added"]
    extra = [row.product_name or row.label for row in match.rows if row.status == "removed"]
    lines = [f"{_product_line(match)} was flagged ({match.level} similarity) because:"]
    lines.append(
        f"- It shares {match.shared_count} of your {match.user_count} ingredients: {listing(shared)}."
    )
    if match.same_form:
        lines.append(f"- It is the same kind of product ({form_label(match.product_form)}).")
    if match.shared_uses:
        lines.append(
            f"- Its stated use overlaps yours: {listing([USE_LABELS.get(u, u) for u in match.shared_uses])}."
        )
    if added:
        lines.append(f"What differs: you add {listing(added)}.")
    if extra:
        lines.append(
            f"Its published list also names {listing(extra[:4])}{' and more' if len(extra) > 4 else ''}."
        )
    if not any(note.code in ("ratios_differ", "ratios_match") for note in match.notes):
        lines.append("It does not publish quantities, so ratios cannot be compared.")
    source = match.sources[0]
    lines.append(f"Source: {source.publisher}, page retrieved {source.retrieved_at}.")
    lines.append(
        "A product on sale is not a patent. It matters because what it publicly discloses can count against "
        "the novelty of the same combination."
    )
    return "\n".join(lines)


def explain_patent(analysis: Analysis) -> str:
    prior = analysis.prior_art
    if prior.state == "not_loaded":
        return (
            "No patent was flagged because none could be searched: no patent records are held on this site. "
            "That is not a finding that none exists. The findings list the registries to search, with the terms to use."
        )
    if not prior.matches:
        return f"None of the {prior.record_count} records searched shared enough features with your formulation to flag."
    match = prior.matches[0]
    return (
        f"{match.title} was flagged ({match.level}) because its title or abstract names "
        f"{listing(match.matched_ingredients)}"
        + (f" and a similar use ({listing(match.matched_uses)})" if match.matched_uses else "")
        + ". A record is evidence of what was filed, not a statement that your formulation is covered — "
        "its claims decide that, and they need reading on the official register."
    )


def explain_difference(analysis: Analysis, invention: Invention) -> str:
    matches = analysis.products.matches + analysis.products.weaker
    union = {key for match in matches for key in match.shared}
    new = [i.name for i in invention.ingredients if i.key not in union]
    lines = ["Compared with what I could search:"]
    if new:
        lines.append(
            f"- No product found lists {listing(new)} alongside the rest of your ingredients."
        )
    elif matches:
        lines.append("- Every ingredient you listed appears in at least one of the products found.")
    if matches:
        closest = matches[0]
        added = [row.user_name for row in closest.rows if row.status == "added" and row.user_name]
        if added:
            lines.append(
                f"- Against the closest, {_product_line(closest)}, you add {listing(added)}."
            )
        lines.append(
            "- Your exact percentages cannot be compared where products do not publish theirs."
        )
    if invention.process_steps:
        lines.append(
            f"- You describe {len(invention.process_steps)} preparation steps; no product page describes its process."
        )
    if invention.distinctive_features:
        lines.append(f"- You say: {invention.distinctive_features[0]}")
    lines.append(
        "A different composition is not automatically patentable. What usually has to be shown is a technical "
        "effect beyond what the known ingredients do on their own."
    )
    return "\n".join(lines)


def explain_missing(invention: Invention, missing_slots: list[str]) -> str:
    if not missing_slots:
        return "Nothing essential is missing. Test results or a description of the process would still sharpen the assessment."
    labels = {
        "form": "what kind of product it is", "ingredients": "the ingredients", "quantities": "quantities for every ingredient",
        "use": "what it is for", "percent_total": "percentages that add up to 100", "purpose": "what each ingredient does",
        "process": "how it is prepared", "novelty": "what you believe is new", "problem": "the problem it solves",
        "evidence": "any test results", "disclosure": "whether it has been made public", "brand": "a brand name, if any",
    }  # fmt: skip
    required = [labels[s] for s in missing_slots if s in REQUIRED]
    optional = [labels[s] for s in missing_slots if s not in REQUIRED]
    lines = []
    if required:
        lines.append(f"Needed before I can analyse it: {listing(required)}.")
    if optional:
        lines.append(f"Would sharpen the assessment: {listing(optional)}.")
    return "\n".join(lines)


def explain_tkdl(invention: Invention, tkdl) -> str:
    """What can and cannot be said about the TKDL, from its public pages only."""
    parts = [
        "The Traditional Knowledge Digital Library (TKDL) is a Government of India database of "
        "formulations transcribed from classical texts of Ayurveda, Unani, Siddha, Sowa-Rigpa and Yoga. "
        "Its full database is open only to patent offices under the TKDL Access Agreement, so your "
        "formulation cannot be checked against it here. The public TKDL website offers a "
        "representative database of about 1,250 formulations that anyone can search."
    ]
    if invention.source_texts:
        parts.append(
            "You named "
            + listing(invention.source_texts)
            + f", listed by TKDL among the {tkdl.book_count} classical books it transcribes. "
            "What that text documents is traditional knowledge and prior art for a patent; only "
            "what you changed can be new."
        )
    else:
        parts.append(
            "If your formulation comes from a classical text, tell me which one — I will check it "
            "against TKDL's published list of the books it transcribes."
        )
    parts.append("The official links are in the Traditional knowledge tab.")
    return " ".join(parts)


OTHER_QUESTION = (
    "I can explain the findings — why a product or record was flagged, what differs, what is missing — and update "
    "the formulation as you change it. For what the law requires, Ask Sahayak answers from the published sources."
)
