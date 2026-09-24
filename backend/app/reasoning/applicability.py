"""Does this provision apply to this reader, or only possibly?

Three states, and the middle one is the point. "May apply — we would need to
know whether the formula is in a classical text" is more useful and more honest
than either "applies" or silence, because it tells the reader which fact turns
the answer.

A provision is only ever `applies` when the facts a rule required were stated
and matched. Nothing here reads the passage text to decide; it reads the
metadata the passage carries about what it governs, against the facts the reader
gave. Deciding applicability by interpreting the words of a provision is the
thing a lawyer does, and it is exactly what this product must not do.
"""

from __future__ import annotations

from app.models.domain import ApplicabilityStatus, ProductClass, ProvisionApplicability
from app.reasoning.facts import ExtractedFacts
from app.retrieval.types import ScoredChunk

#: The fact that decides whether a passage about a product class reaches this
#: reader. Only classes whose passages carry the metadata are listed.
_DECIDING_FACT: dict[ProductClass, str] = {
    ProductClass.CLASSICAL_GENERIC: "classical_text_formulation",
    ProductClass.PATENT_PROPRIETARY: "classical_text_formulation",
    ProductClass.PHYTOPHARMACEUTICAL: "purified_extract",
    ProductClass.AYURVEDA_AAHAR: "food_form",
    ProductClass.COSMETIC: "cosmetic_claim",
}


def assess(
    passages: list[ScoredChunk],
    facts: ExtractedFacts,
    product_class: ProductClass,
) -> list[ProvisionApplicability]:
    results: list[ProvisionApplicability] = []
    for passage in passages:
        classes = passage.chunk.product_classes
        if not classes:
            # A provision that names no product class is general to the topic
            # it was retrieved for; nothing about this reader excludes it.
            results.append(
                ProvisionApplicability(
                    citation_id=passage.chunk.chunk_id,
                    status=ApplicabilityStatus.APPLIES,
                )
            )
            continue

        if product_class is not ProductClass.UNDETERMINED:
            applies = product_class in classes
            results.append(
                ProvisionApplicability(
                    citation_id=passage.chunk.chunk_id,
                    status=(
                        ApplicabilityStatus.APPLIES
                        if applies
                        else ApplicabilityStatus.NOT_INDICATED
                    ),
                )
            )
            continue

        # The class is not settled, so the provision's own class tells us which
        # fact would settle whether it reaches this reader.
        needs = [
            _DECIDING_FACT[cls]
            for cls in classes
            if cls in _DECIDING_FACT and facts.value(_DECIDING_FACT[cls]) is None
        ]
        results.append(
            ProvisionApplicability(
                citation_id=passage.chunk.chunk_id,
                status=ApplicabilityStatus.MAY_APPLY,
                needs_facts=list(dict.fromkeys(needs)),
            )
        )
    return results
