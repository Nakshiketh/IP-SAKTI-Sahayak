"""What already exists: commercial products, traditional knowledge, filed records.

Three searches, three kinds of evidence, never merged:

* products come from `corpus/products/products.json`, a fetched and dated reference
  set. A product is evidence that something is sold, not that it is patented.
* traditional knowledge is the shared vocabulary's traditional-use list and classical
  formulations. It is a reference list, not a search of any database, and the
  Traditional Knowledge Digital Library is never searched from here.
* prior art is the records store (Layer 2). When nothing is loaded, the finding says
  so and lists the registries a person has to search instead.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.analyst.lexicon import find_form, same_family, use_terms
from app.analyst.models import (
    Amount,
    ClassicalHit,
    ComparisonRow,
    Invention,
    KnowledgeFinding,
    KnowledgeIngredient,
    PatentMatch,
    PriorArtFinding,
    ProductMatch,
    ProductsFinding,
    Reason,
    Registry,
    Source,
)
from app.analyst.vocabulary import Term, Vocabulary
from app.core.settings import REPO_ROOT

PRODUCTS_PATH = REPO_ROOT / "corpus" / "products" / "products.json"
PATENT_TYPES = {"patent_application", "patent_grant"}
LEVEL_RANK = {"high": 0, "moderate": 1, "low": 2}


def to_grams(amount: Amount | None) -> float | None:
    if amount is None:
        return None
    return {"g": amount.value, "mg": amount.value / 1000, "kg": amount.value * 1000}.get(
        amount.unit
    )


def describe_amount(amount: Amount | None) -> str | None:
    if amount is None:
        return None
    value = int(amount.value) if amount.value.is_integer() else amount.value
    return f"{value} {amount.unit}"


# -- products ------------------------------------------------------------------


@dataclass(frozen=True)
class ProductIngredient:
    as_published: str
    term: Term | None
    amount: Amount | None
    is_base: bool


@dataclass(frozen=True)
class Product:
    id: str
    name: str
    brand: str | None
    manufacturer: str | None
    form: str
    category: str
    stated_use: tuple[str, ...]
    uses: frozenset[str]
    scope: str
    basis_grams: float | None
    ingredients: tuple[ProductIngredient, ...]
    sources: tuple[Source, ...]

    @property
    def actives(self) -> dict[str, ProductIngredient]:
        return {i.term.id: i for i in self.ingredients if i.term and not i.is_base}

    @property
    def unrecognised_actives(self) -> list[str]:
        return [i.as_published for i in self.ingredients if i.term is None and not i.is_base]

    @property
    def base(self) -> list[str]:
        return [i.as_published for i in self.ingredients if i.is_base]


@dataclass(frozen=True)
class ProductSet:
    version: str
    retrieved_at: str
    products: tuple[Product, ...]


def load_products(vocabulary: Vocabulary, path: Path = PRODUCTS_PATH) -> ProductSet:
    raw = json.loads(path.read_text(encoding="utf-8"))
    products = []
    for row in raw["products"]:
        basis = re.search(r"(\d+(?:\.\d+)?)\s*g\b", row.get("composition_basis") or "")
        ingredients = []
        for item in row["ingredients"]:
            term = vocabulary.recognise(item.get("reads_as") or item["as_published"])
            amount = Amount(**item["amount"]) if item.get("amount") else None
            role = item.get("role")
            is_base = role == "base" or (role is None and term is not None and term.excipient)
            ingredients.append(ProductIngredient(item["as_published"], term, amount, is_base))
        products.append(
            Product(
                id=row["product_id"],
                name=row["name"],
                brand=row.get("brand"),
                manufacturer=row.get("manufacturer"),
                form=row["product_form"],
                category=row["category"],
                stated_use=tuple(row.get("stated_use") or ()),
                uses=frozenset(use_terms(" ".join(row.get("stated_use") or ()))),
                scope=row["ingredient_list_scope"],
                basis_grams=float(basis.group(1)) if basis else None,
                ingredients=tuple(ingredients),
                sources=tuple(
                    Source(**{k: s[k] for k in Source.model_fields}) for s in row["sources"]
                ),
            )
        )
    return ProductSet(raw["version"], raw["retrieved_at"], tuple(products))


@lru_cache
def get_products() -> ProductSet:
    from app.analyst.vocabulary import get_vocabulary

    return load_products(get_vocabulary())


def _level(shared: int, users: int, same_form: bool, shared_uses: bool) -> str | None:
    coverage = shared / users if users else 0
    if shared >= 3 and coverage >= 0.6 and same_form and shared_uses:
        return "high"
    if shared >= 2 and (same_form or shared_uses):
        return "moderate"
    if shared >= 1 and same_form:
        return "low"
    return None


def compare_product(invention: Invention, product: Product) -> ProductMatch | None:
    user = invention.ingredients
    actives = product.actives
    shared = [ingredient.key for ingredient in user if ingredient.key in actives]
    same_form = same_family(invention.form, product.form)
    shared_uses = [use for use in invention.use_terms if use in product.uses]
    level = _level(len(shared), len(user), same_form, bool(shared_uses))
    if level is None:
        return None

    rows: list[ComparisonRow] = []
    differing: list[str] = []
    any_product_percent = False
    for ingredient in user:
        published = actives.get(ingredient.key)
        if published is None:
            continue
        grams = to_grams(published.amount)
        product_percent = (
            round(grams / product.basis_grams * 100, 2) if grams and product.basis_grams else None
        )
        difference = None
        if product_percent is not None and ingredient.effective_percent is not None:
            any_product_percent = True
            gap = ingredient.effective_percent - product_percent
            difference = "same" if abs(gap) < 0.5 else ("higher" if gap > 0 else "lower")
            if difference != "same":
                differing.append(ingredient.name)
        elif ingredient.effective_percent is not None:
            difference = "unknown"
        rows.append(
            ComparisonRow(
                key=ingredient.key,
                label=published.term.label if published.term else ingredient.name,
                status="common",
                user_name=ingredient.name,
                user_percent=ingredient.effective_percent,
                user_amount=describe_amount(ingredient.amount),
                product_name=published.as_published,
                product_percent=product_percent,
                product_amount=describe_amount(published.amount),
                difference=difference,
            )
        )
    added = [ingredient for ingredient in user if ingredient.key not in actives]
    for ingredient in added:
        rows.append(
            ComparisonRow(
                key=ingredient.key,
                label=ingredient.label or ingredient.name,
                status="added",
                user_name=ingredient.name,
                user_percent=ingredient.effective_percent,
                user_amount=describe_amount(ingredient.amount),
            )
        )
    user_keys = {ingredient.key for ingredient in user}
    removed = [(key, item) for key, item in actives.items() if key not in user_keys]
    for key, item in removed:
        rows.append(
            ComparisonRow(
                key=key,
                label=item.term.label if item.term else item.as_published,
                status="removed",
                product_name=item.as_published,
                product_amount=describe_amount(item.amount),
            )
        )
    for name in product.unrecognised_actives:
        rows.append(
            ComparisonRow(key="custom:" + name, label=name, status="removed", product_name=name)
        )

    notes: list[Reason] = []
    if not added:
        notes.append(Reason(code="no_new_ingredient", basis="evidence"))
    else:
        notes.append(
            Reason(code="user_adds", params={"names": [i.name for i in added]}, basis="evidence")
        )
    extra = len(removed) + len(product.unrecognised_actives)
    if extra:
        names = [item.as_published for _, item in removed][:4] + product.unrecognised_actives[:2]
        notes.append(
            Reason(
                code="product_has_more",
                params={"count": extra, "names": names[:4]},
                basis="evidence",
            )
        )
    if product.scope != "full":
        notes.append(
            Reason(
                code="partial_list" if product.scope == "partial_named" else "title_only",
                basis="evidence",
            )
        )
    if any_product_percent:
        notes.append(
            Reason(code="ratios_differ", params={"names": differing}, basis="evidence")
            if differing
            else Reason(code="ratios_match", basis="evidence")
        )
    else:
        notes.append(Reason(code="ratios_unpublished", basis="evidence"))
    if product.base:
        notes.append(
            Reason(code="base_ingredients", params={"count": len(product.base)}, basis="evidence")
        )
    notes.append(Reason(code="process_unpublished", basis="evidence"))
    if not added:
        notes.append(Reason(code="significance_no_new"))
    elif shared:
        notes.append(
            Reason(code="significance_known_combination", params={"names": [i.name for i in added]})
        )

    return ProductMatch(
        product_id=product.id,
        name=product.name,
        brand=product.brand,
        manufacturer=product.manufacturer,
        product_form=product.form,
        stated_use=list(product.stated_use),
        ingredient_list_scope=product.scope,
        level=level,  # type: ignore[arg-type]
        shared=shared,
        shared_count=len(shared),
        user_count=len(user),
        product_active_count=len(actives) + len(product.unrecognised_actives),
        base_ingredients=product.base,
        same_form=same_form,
        shared_uses=shared_uses,
        rows=rows,
        notes=notes,
        sources=list(product.sources),
    )


def find_products(invention: Invention, product_set: ProductSet) -> ProductsFinding:
    found = [m for p in product_set.products if (m := compare_product(invention, p)) is not None]
    found.sort(
        key=lambda m: (
            LEVEL_RANK[m.level],
            -m.shared_count,
            -m.shared_count / max(1, m.product_active_count),
        )
    )
    return ProductsFinding(
        state="searched",
        dataset_size=len(product_set.products),
        dataset_version=product_set.version,
        retrieved_at=product_set.retrieved_at,
        matches=[m for m in found if m.level != "low"][:6],
        weaker=[m for m in found if m.level == "low"][:6],
    )


# -- traditional knowledge -----------------------------------------------------


def check_knowledge(invention: Invention, vocabulary: Vocabulary) -> KnowledgeFinding:
    rows = []
    for ingredient in invention.ingredients:
        term = vocabulary.get(ingredient.vocabulary_id) if ingredient.vocabulary_id else None
        recognised = (
            "unrecognised" if term is None else ("traditional" if term.traditional else "material")
        )
        rows.append(
            KnowledgeIngredient(
                key=ingredient.key,
                name=ingredient.name,
                label=term.label if term else None,
                recognised=recognised,  # type: ignore[arg-type]
            )
        )
    text = " ".join(
        [
            invention.title or "",
            *[i.name for i in invention.ingredients],
            *invention.distinctive_features,
        ]
    )
    ids = {i.vocabulary_id for i in invention.ingredients if i.vocabulary_id}
    classical = [
        ClassicalHit(id=m.formulation.id, label=m.formulation.label, via=m.via)
        for m in vocabulary.classical_matches(text, ids)
    ]
    traditional = sum(1 for row in rows if row.recognised == "traditional")
    notes = [
        Reason(code="reference_not_database", basis="evidence"),
        Reason(code="tkdl_not_searched", basis="evidence"),
    ]
    if traditional and traditional == len(rows) and len(rows) >= 2:
        notes.append(Reason(code="all_traditional", params={"count": traditional}))
    elif traditional:
        notes.append(
            Reason(code="some_traditional", params={"count": traditional, "total": len(rows)})
        )
    return KnowledgeFinding(
        reference_size=vocabulary.traditional_count,
        formulation_count=len(vocabulary.classical),
        ingredients=rows,
        traditional_count=traditional,
        classical=classical,
        notes=notes,
    )


# -- prior art -----------------------------------------------------------------


def search_prior_art(invention: Invention, records, vocabulary: Vocabulary) -> PriorArtFinding:
    registries = [
        Registry(
            name=link.name,
            publisher=link.publisher,
            jurisdiction=link.jurisdiction,
            record_type=link.record_type,
        )
        for link in records.portal_links()
        if link.record_type in PATENT_TYPES or link.record_type == "design"
    ]
    terms: list[str] = []
    for ingredient in invention.ingredients:
        term = vocabulary.get(ingredient.vocabulary_id) if ingredient.vocabulary_id else None
        terms.append(term.common_name if term else ingredient.name.lower())
    terms = list(dict.fromkeys(terms))[:10]

    status = records.status()
    if not status.available or status.record_count == 0:
        return PriorArtFinding(
            state="not_loaded",
            record_count=0,
            searched_terms=terms,
            matches=[],
            registries_not_searched=registries,
        )
    try:
        found = records.search_records(" ".join(terms), match_any=True, limit=100)
    except Exception:
        return PriorArtFinding(
            state="failed",
            record_count=status.record_count,
            searched_terms=terms,
            matches=[],
            registries_not_searched=registries,
        )

    user_keys = {i.key for i in invention.ingredients}
    matches: list[PatentMatch] = []
    for record in found:
        if record.record_type.value not in PATENT_TYPES:
            continue
        text = " ".join(filter(None, [record.title, record.abstract_text, record.goods_or_field]))
        hit_ids = list(
            dict.fromkeys(h.term.id for h in vocabulary.find(text) if h.term.id in user_keys)
        )
        uses = [u for u in use_terms(text) if u in invention.use_terms]
        form = find_form(text)
        same = bool(form and same_family(form.id, invention.form))
        if len(hit_ids) >= 3 and (same or uses):
            level = "high"
        elif len(hit_ids) >= 2:
            level = "moderate"
        elif hit_ids and (same or uses):
            level = "low"
        else:
            continue
        labels = [vocabulary.get(i).label for i in hit_ids if vocabulary.get(i)]
        why = [Reason(code="record_shares_ingredients", params={"names": labels}, basis="evidence")]
        if uses:
            why.append(Reason(code="record_shares_use", params={"uses": uses}, basis="evidence"))
        if same:
            why.append(Reason(code="record_same_form", basis="evidence"))
        matches.append(
            PatentMatch(
                record_id=record.record_id,
                title=record.title,
                record_type=record.record_type.value,
                jurisdiction=record.jurisdiction.value,
                applicant=record.applicant,
                filing_date=record.filing_date.isoformat() if record.filing_date else None,
                publication_date=record.publication_date.isoformat()
                if record.publication_date
                else None,
                status=record.status,
                abstract=record.abstract_text,
                level=level,  # type: ignore[arg-type]
                matched_ingredients=hit_ids,
                matched_uses=uses,
                why=why,
            )
        )
    matches.sort(key=lambda m: (LEVEL_RANK[m.level], -len(m.matched_ingredients)))
    return PriorArtFinding(
        state="searched",
        record_count=status.record_count,
        searched_terms=terms,
        matches=matches[:10],
        registries_not_searched=registries,
    )
