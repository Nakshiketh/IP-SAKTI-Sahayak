"""The preliminary indicator, and every reason it rests on.

Three states, decided by rules a reader can check against the findings:

* ``high_similarity`` — one product contains every ingredient given, a classical
  formulation matches, or a filed record matches closely.
* ``further_assessment`` — something close exists, or patent records were not
  available to search, or little is described beyond the ingredients.
* ``potentially_novel`` — nothing close was found *and* a patent search actually ran
  *and* something distinctive is described. On an instance with no records loaded
  this state is unreachable on purpose: a clean result from a search that never ran
  is not a result.

Never "patentable". The requirements are shown separately — novelty, inventive
step, industrial applicability and the exclusions — because they fail separately.
"""

from __future__ import annotations

import re

from app.analyst.lexicon import THERAPEUTIC_USES
from app.analyst.models import (
    Assessment,
    Invention,
    IpOption,
    KnowledgeFinding,
    PriorArtFinding,
    ProductsFinding,
    Reason,
    RequirementView,
)
from app.analyst.vocabulary import Vocabulary, fold


def assess(
    invention: Invention,
    products: ProductsFinding,
    knowledge: KnowledgeFinding,
    prior: PriorArtFinding,
    would_sharpen: list[str],
) -> Assessment:
    keys = [i.key for i in invention.ingredients]
    total = len(keys)
    names = {i.key: i.name for i in invention.ingredients}
    everything = products.matches + products.weaker
    close = products.matches
    subset = [m for m in everything if total >= 2 and m.shared_count == total]
    union = {key for m in everything for key in m.shared}
    all_known = total >= 2 and set(keys) <= union
    distinct = [names[k] for k in keys if k not in union]
    patent_high = [p for p in prior.matches if p.level == "high"]
    patent_mod = [p for p in prior.matches if p.level == "moderate"]
    has_evidence = bool(invention.evidence)
    has_process = bool(invention.process_steps)
    searched = prior.state == "searched"

    def product_params(match) -> dict:
        return {
            "name": match.name,
            "brand": match.brand or "",
            "shared": match.shared_count,
            "total": total,
        }

    reasons: list[Reason] = []
    if subset:
        indicator = "high_similarity"
        reasons.append(
            Reason(
                code="all_ingredients_in_product",
                params=product_params(subset[0]),
                basis="evidence",
            )
        )
    elif knowledge.classical:
        indicator = "high_similarity"
        reasons.append(
            Reason(
                code="classical_match",
                params={"name": knowledge.classical[0].label},
                basis="evidence",
            )
        )
    elif patent_high:
        indicator = "high_similarity"
        reasons.append(
            Reason(code="patent_close", params={"title": patent_high[0].title}, basis="evidence")
        )
    elif close or patent_mod:
        indicator = "further_assessment"
        if close:
            reasons.append(
                Reason(
                    code="close_products",
                    params={**product_params(close[0]), "count": len(close)},
                    basis="evidence",
                )
            )
        if patent_mod:
            reasons.append(
                Reason(code="patent_related", params={"count": len(patent_mod)}, basis="evidence")
            )
    elif not searched:
        indicator = "further_assessment"
    elif not (distinct or has_process or has_evidence or invention.distinctive_features):
        indicator = "further_assessment"
        reasons.append(Reason(code="little_beyond_ingredients"))
    else:
        indicator = "potentially_novel"
        reasons.append(
            Reason(
                code="no_close_product", params={"size": products.dataset_size}, basis="evidence"
            )
        )

    if close and not subset:
        reasons.append(
            Reason(code="no_single_product_has_all", params={"total": total}, basis="evidence")
        )
    if not searched:
        reasons.append(
            Reason(code="patents_not_searched", params={"state": prior.state}, basis="evidence")
        )
    if all_known and not subset:
        reasons.append(Reason(code="all_ingredients_known", params={"count": len(everything)}))
    if distinct and everything:
        reasons.append(Reason(code="distinct_ingredients", params={"names": distinct}))
    if knowledge.traditional_count and knowledge.traditional_count * 2 >= total:
        reasons.append(
            Reason(
                code="tk_consideration",
                params={"count": knowledge.traditional_count, "total": total},
            )
        )
    reasons.append(Reason(code="effect_evidence_given" if has_evidence else "effect_not_shown"))

    # -- the requirements, one at a time
    if subset or knowledge.classical or patent_high:
        novelty_status = "anticipation_risk"
    elif close or patent_mod:
        novelty_status = "close_match_found"
    else:
        novelty_status = "no_single_match_found"
    novelty_reasons = []
    if close:
        novelty_reasons.append(
            Reason(code="closest_product", params=product_params(close[0]), basis="evidence")
        )
    if close and not subset:
        novelty_reasons.append(
            Reason(code="no_single_product_has_all", params={"total": total}, basis="evidence")
        )
    novelty_reasons.append(
        Reason(
            code="searched_scope",
            params={
                "products": products.dataset_size,
                "records": prior.record_count,
                "state": prior.state,
            },
            basis="evidence",
        )
    )

    if all_known or (
        knowledge.traditional_count and knowledge.traditional_count == total and total >= 2
    ):
        step_status = "concern"
    elif not has_evidence:
        step_status = "needs_evidence"
    else:
        step_status = "arguable"
    step_reasons = []
    if all_known:
        step_reasons.append(Reason(code="all_ingredients_known", params={"count": len(everything)}))
    if close and not distinct and not has_process:
        step_reasons.append(Reason(code="proportions_only"))
    step_reasons.append(
        Reason(code="effect_evidence_given" if has_evidence else "effect_not_shown")
    )
    if has_process:
        step_reasons.append(
            Reason(code="process_described", params={"count": len(invention.process_steps)})
        )

    applicable = bool(invention.ingredients and (invention.form or invention.category))
    industrial = RequirementView(
        status="likely" if applicable else "unclear",
        reasons=[Reason(code="can_be_made" if applicable else "form_unknown")],
    )

    exclusions: list[Reason] = []
    if knowledge.traditional_count:
        exclusions.append(
            Reason(
                code="exclusion_tk", params={"count": knowledge.traditional_count, "total": total}
            )
        )
    if total >= 2 and not has_evidence:
        exclusions.append(Reason(code="exclusion_admixture"))
    if any(
        re.search(r"\b(extract|isolat|new form|fraction)\w*", f, re.I)
        for f in invention.distinctive_features
    ):
        exclusions.append(Reason(code="exclusion_known_form"))
    if set(invention.use_terms) & THERAPEUTIC_USES or invention.category == "medicine":
        exclusions.append(Reason(code="exclusion_treatment"))

    return Assessment(
        indicator=indicator,  # type: ignore[arg-type]
        reasons=reasons,
        novelty=RequirementView(status=novelty_status, reasons=novelty_reasons),
        inventive_step=RequirementView(status=step_status, reasons=step_reasons),
        industrial_applicability=industrial,
        exclusions=exclusions,
        would_sharpen=would_sharpen,
    )


def ip_options(
    invention: Invention, assessment: Assessment, vocabulary: Vocabulary
) -> list[IpOption]:
    options: list[IpOption] = []
    patent_relevance = "relevant" if assessment.indicator == "potentially_novel" else "possible"
    patent_code = {
        "potentially_novel": "patent_worth_pursuing",
        "further_assessment": "patent_depends_on_search",
        "high_similarity": "patent_limited",
    }[assessment.indicator]
    options.append(
        IpOption(type="patent", relevance=patent_relevance, reasons=[Reason(code=patent_code)])
    )

    if invention.brand_name:
        words = [w for w in fold(invention.brand_name).split() if w in vocabulary.descriptive_words]
        words += [h.term.common_name for h in vocabulary.find(invention.brand_name)]
        reasons = [Reason(code="brand_given", params={"name": invention.brand_name})]
        if words:
            reasons.append(
                Reason(code="brand_descriptive", params={"words": list(dict.fromkeys(words))})
            )
        options.append(IpOption(type="trademark", relevance="relevant", reasons=reasons))
    else:
        options.append(
            IpOption(
                type="trademark", relevance="possible", reasons=[Reason(code="if_sold_under_name")]
            )
        )

    options.append(
        IpOption(type="design", relevance="possible", reasons=[Reason(code="packaging_mentioned")])
        if invention.packaging_note
        else IpOption(
            type="design",
            relevance="not_indicated",
            reasons=[Reason(code="design_appearance_only")],
        )
    )
    options.append(
        IpOption(type="copyright", relevance="possible", reasons=[Reason(code="label_and_content")])
    )
    options.append(
        IpOption(type="gi", relevance="possible", reasons=[Reason(code="gi_requirements")])
        if invention.region_note
        else IpOption(type="gi", relevance="not_indicated", reasons=[Reason(code="gi_origin_link")])
    )
    if invention.disclosure == "public":
        options.append(
            IpOption(
                type="trade_secret",
                relevance="not_indicated",
                reasons=[Reason(code="already_public")],
            )
        )
    else:
        reasons = [Reason(code="keep_confidential")]
        if assessment.indicator != "high_similarity":
            reasons.append(Reason(code="patent_or_secret"))
        options.append(IpOption(type="trade_secret", relevance="relevant", reasons=reasons))
    return options


def next_steps(
    invention: Invention, assessment: Assessment, prior: PriorArtFinding
) -> list[Reason]:
    steps = [
        Reason(code="detailed_search", params={"state": prior.state}),
        Reason(code="review_claims", params={"count": len(prior.matches)}),
        Reason(code="assess_novelty", params={"status": assessment.novelty.status}),
        Reason(code="assess_inventive_step", params={"status": assessment.inventive_step.status}),
        Reason(code="check_exclusions", params={"count": len(assessment.exclusions)}),
        Reason(code="keep_records"),
        Reason(
            code="filing_before_disclosure",
            params={"public": invention.disclosure == "public"},
        ),
        Reason(code="consult_professional"),
        Reason(code="confirm_product_class"),
    ]
    if invention.brand_name:
        steps.append(Reason(code="trademark_search", params={"name": invention.brand_name}))
    return steps
