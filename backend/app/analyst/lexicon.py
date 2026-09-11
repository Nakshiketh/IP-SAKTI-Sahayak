"""What kind of product something is, what it is for, and how it is made.

Three small vocabularies, read the same way on both sides of every comparison: an
inventor's message and a product page's stated use are put through the same
`use_terms`, so "oil absorption" and "remove excess oil" meet at the same id rather
than at two strings that happen to differ.

Nothing here is a claim about a product. These are the words people use.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.analyst.vocabulary import fold


@dataclass(frozen=True)
class Form:
    id: str
    category: str
    #: Forms in one family are compared with each other: a face pack and an ubtan
    #: powder are the same kind of thing to the person using them.
    family: str
    names: tuple[str, ...]


FORMS: tuple[Form, ...] = (
    Form(
        "face_pack",
        "skin",
        "face_pack",
        (
            "face pack",
            "face packs",
            "face pack formulation",
            "facepack",
            "face mask",
            "face masque",
            "clay mask",
            "clay pack",
            "mud pack",
            "ubtan",
            "uptan",
            "ubtan powder",
            "lepa",
            "mask",
            "pack powder",
        ),
    ),
    Form("face_scrub", "skin", "face_pack", ("scrub", "face scrub", "body scrub")),
    Form("face_wash", "skin", "cleanser", ("face wash", "facewash", "cleanser", "face cleanser")),
    Form(
        "cream",
        "skin",
        "leave_on",
        ("cream", "face cream", "skin cream", "moisturiser", "moisturizer", "ointment"),
    ),
    Form("lotion", "skin", "leave_on", ("lotion", "body lotion")),
    Form("gel", "skin", "leave_on", ("gel", "face gel")),
    Form("serum", "skin", "leave_on", ("serum", "face serum")),
    Form("balm", "skin", "leave_on", ("balm", "lip balm")),
    Form("soap", "skin", "cleanser", ("soap", "bathing bar", "soap bar")),
    Form("hair_oil", "hair", "hair_oil", ("hair oil", "scalp oil", "keshya taila")),
    Form("shampoo", "hair", "cleanser", ("shampoo", "hair wash", "hair cleanser")),
    Form("hair_pack", "hair", "face_pack", ("hair pack", "hair mask", "henna pack")),
    Form("massage_oil", "body", "oil", ("massage oil", "body oil", "taila", "tailam")),
    Form("churna", "medicine", "oral_solid", ("churna", "choorna", "churan")),
    Form(
        "tablet",
        "medicine",
        "oral_solid",
        ("tablet", "tablets", "vati", "vatika", "gutika", "pill", "pills"),
    ),
    Form("capsule", "medicine", "oral_solid", ("capsule", "capsules")),
    Form(
        "syrup",
        "medicine",
        "oral_liquid",
        ("syrup", "asava", "arishta", "kadha", "decoction", "kashayam", "kwath", "tonic"),
    ),
    Form("tea", "food", "food", ("herbal tea", "tea", "infusion")),
    Form(
        "food",
        "food",
        "food",
        ("health food", "nutraceutical", "dietary supplement", "ayurveda aahar", "ayurveda aahara"),
    ),
    Form(
        "tooth_powder",
        "oral",
        "oral_care",
        ("tooth powder", "toothpaste", "tooth paste", "dant manjan", "dantmanjan"),
    ),
)

FORMS_BY_ID = {form.id: form for form in FORMS}

_FORM_INDEX: list[tuple[tuple[str, ...], Form]] = sorted(
    ((tuple(fold(name).split()), form) for form in FORMS for name in form.names),
    key=lambda item: -len(item[0]),
)


def find_form(text: str) -> Form | None:
    """The most specific product form named in `text`."""
    words = fold(text).split()
    best: tuple[int, int, Form] | None = None
    for name, form in _FORM_INDEX:
        size = len(name)
        for start in range(len(words) - size + 1):
            if tuple(words[start : start + size]) == name:
                candidate = (size, -start, form)
                if best is None or candidate[:2] > best[:2]:
                    best = candidate
                break
    return best[2] if best else None


def same_family(first: str | None, second: str | None) -> bool:
    if not first or not second:
        return False
    a, b = FORMS_BY_ID.get(first), FORMS_BY_ID.get(second)
    return a is not None and b is not None and a.family == b.family


# -- what it is for ------------------------------------------------------------

USES: dict[str, tuple[str, ...]] = {
    "cleansing": (r"\bclean", r"\bpurif", r"\bdetox", r"\bimpurit", r"\bdirt\b"),
    "oil_control": (
        r"\boil absorp",
        r"\babsorb\w* (?:excess )?oil",
        r"\bexcess (?:oil|sebum)",
        r"\boily\b",
        r"\bsebum",
        r"\boil control",
        r"\bgreas",
    ),
    "acne": (r"\bacne", r"\bpimple", r"\bbreakout", r"\beruption"),
    "pores": (r"\bpores?\b", r"\bblackhead", r"\bwhitehead", r"\bclogged", r"\bunclog"),
    "soothing": (
        r"\bsooth",
        r"\bcalm",
        r"\bcooling\b",
        r"\birritat",
        r"\binflamm",
        r"\bredness",
        r"\bsunburn",
    ),
    "brightening": (
        r"\bbright",
        r"\bglow",
        r"\bradian",
        r"\bcomplexion",
        r"\bskin tone",
        r"\billuminat",
        r"\bdull",
    ),
    "exfoliation": (r"\bexfoliat", r"\bdead skin", r"\bscrub"),
    "tan_pigmentation": (
        r"\btan\b",
        r"\bde tan",
        r"\bpigment",
        r"\bdark spots?",
        r"\bblemish",
        r"\bscars?\b",
    ),
    "hydration": (r"\bhydrat", r"\bmoistur", r"\bdryness", r"\bdry skin", r"\bnourish", r"\brough"),
    "anti_ageing": (
        r"\bage?ing\b",
        r"\bwrinkle",
        r"\bfine lines",
        r"\btighten",
        r"\bfirm(?:ing|ness)?\b",
    ),
    "antimicrobial": (
        r"\banti ?bacter",
        r"\bantisept",
        r"\bbacteri",
        r"\bgerms?\b",
        r"\bantimicrob",
        r"\bantifung",
    ),
    "skin_care": (r"\bskin ?care\b", r"\bskin health", r"\bhealthy skin"),
    "hair_removal": (r"\bunwanted (?:facial )?hair", r"\bsuperfl\w* hair", r"\bhair removal"),
    "hair_fall": (r"\bhair ?fall", r"\bhair loss", r"\bthinning"),
    "dandruff": (r"\bdandruff", r"\bflak"),
    "hair_growth": (r"\bhair growth", r"\bregrowth"),
    "digestion": (r"\bdigest", r"\bconstipat", r"\bacidity", r"\bbloat"),
    "immunity": (r"\bimmun",),
    "joint_pain": (r"\bjoints?\b", r"\barthrit", r"\bpain\b"),
    "stress_sleep": (r"\bstress", r"\banxiet", r"\bsleep", r"\binsomnia"),
    "respiratory": (r"\bcough", r"\bcongest", r"\bthroat"),
    "oral_care": (r"\bgums?\b", r"\bteeth", r"\btooth", r"\bbreath", r"\bplaque"),
}

_USE_PATTERNS = {
    use: tuple(re.compile(pattern) for pattern in patterns) for use, patterns in USES.items()
}

#: Uses that describe treating a condition rather than caring for a body. They bring
#: the exclusion for methods of treatment into view, and the regulatory question of
#: whether the product is a cosmetic at all.
THERAPEUTIC_USES = frozenset(
    {"acne", "antimicrobial", "digestion", "immunity", "joint_pain", "respiratory", "stress_sleep"}
)


def use_terms(text: str | None) -> list[str]:
    """Use ids named in `text`, in the order `USES` lists them."""
    if not text:
        return []
    folded = fold(text)
    return [
        use for use, patterns in _USE_PATTERNS.items() if any(p.search(folded) for p in patterns)
    ]


# -- how it is made ------------------------------------------------------------

PROCESS_VERB = re.compile(
    r"\b(mix(?:ed|es|ing)?|blend(?:ed|s|ing)?|grind(?:s|ing)?|ground|pulveri[sz](?:e|ed|ing)|"
    r"powder(?:ed|ing)|siev(?:e|ed|es|ing)|sift(?:ed|s|ing)?|dr(?:y|ied|ies|ying)|sun[- ]dried|"
    r"shade[- ]dried|heat(?:ed|s|ing)?|boil(?:ed|s|ing)?|extract(?:ed|s|ing)|macerat(?:e|ed|ing)|"
    r"triturat(?:e|ed|ing)|ferment(?:ed|s|ing)?|filter(?:ed|s|ing)|cool(?:ed|s)?|stor(?:e|ed|es|ing)|"
    r"steam(?:ed|s|ing)?|soak(?:ed|s|ing)?|roast(?:ed|s|ing)?|distil(?:led|s|ling)?|"
    r"homogeni[sz](?:e|ed|ing)|stir(?:red|s|ring)?|knead(?:ed|s|ing)?|compress(?:ed|ing)|"
    r"granulat(?:e|ed|ing)|decoct(?:ed|ion)?|wash(?:ed|es)|weigh(?:ed|s|ing)?|pack(?:ed|aged) (?:in|into))\b",
    re.IGNORECASE,
)

PARAMETERS = (
    re.compile(
        r"\b\d+(?:\.\d+)?\s*(?:°\s*c|º\s*c|degrees?\s*(?:c|celsius)?|deg\s*c)\b", re.IGNORECASE
    ),
    re.compile(
        r"\b\d+(?:\.\d+)?\s*(?:-\s*\d+(?:\.\d+)?\s*)?(?:minutes?|mins?|hours?|hrs?|days?|seconds?|weeks?)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b\d+\s*(?:mesh|#)\s*(?:sieve)?\b|\bsieve\s*(?:no\.?\s*)?\d+\b", re.IGNORECASE),
    re.compile(r"\b\d+\s*rpm\b", re.IGNORECASE),
    re.compile(r"\bph\s*(?:of\s*)?\d+(?:\.\d+)?\b", re.IGNORECASE),
)


def find_parameters(text: str) -> list[str]:
    found: list[str] = []
    for pattern in PARAMETERS:
        for match in pattern.finditer(text):
            value = " ".join(match.group(0).split())
            if value not in found:
                found.append(value)
    return found
