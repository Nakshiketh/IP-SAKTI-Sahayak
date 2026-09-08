"""Tokenising, for the lexical channel.

Unicode-aware and script-agnostic: the same function has to split an English
statute, a Hindi question and a Telugu heading. Python's ``str.isalnum`` already
knows about every script here, so the tokeniser is a scan over characters rather
than a regular expression built around ASCII word boundaries.

Then a small suffix folder, applied to Latin-script tokens only. It is not a
stemmer and does not try to be: a real one for English would still mangle every
Indic token it was never designed for, and a per-script stemmer set is a large
amount of machinery to get subtly wrong. What this does is collapse the
inflections that otherwise make a question miss the section it is asking about —
"manufacturing" against a heading reading "manufacture", "labelling" against
"label" — and nothing else. Everything beyond that is the dense channel's job,
and, for terms of art, the lexicon in `app.services.understanding`.

The same folding runs over the query and over the indexed text. A folder applied
to one side only would be worse than none.
"""

from __future__ import annotations

import unicodedata

#: Words carrying no retrieval signal in either a question or a statute. Kept
#: short on purpose: an over-eager stop list removes "act" and "rules", which
#: are the two most useful words in this corpus.
_STOPWORD_TEXT = """
    a an the and or of in on at to for from by with without is are was were be been being
    do does did what which who whom how why when where can could may might shall should
    will would must our your their this that these those it its as if then than there here
    i we you they he she them us me my have has had
"""

STOPWORDS: frozenset[str] = frozenset(_STOPWORD_TEXT.split())

#: Below this a token is noise in every script this corpus uses.
MIN_TOKEN_LENGTH = 2

#: Combining marks, and the two joiners. ``str.isalnum`` is false for all of
#: them, so a scan that trusted it alone would cut "औषधि" after the consonant
#: and drop the vowel sign, and cut "மருந்து" at the virama. Every Indic word in
#: this corpus contains at least one, so this is not an edge case — it is most
#: of the text.
_JOINERS = frozenset("‌‍")


def _is_word_character(character: str) -> bool:
    return (
        character.isalnum()
        or character in _JOINERS
        or unicodedata.category(character) in {"Mn", "Mc", "Me"}
    )


def _is_latin(token: str) -> bool:
    return token.isascii() and token.isalpha()


def fold(token: str) -> str:
    """Collapse an English inflection. Returns non-Latin tokens untouched.

    The trailing-vowel and doubled-consonant steps are what make the pairs meet
    in the middle: "manufacturing" loses "ing" and "manufacture" loses "e", and
    both arrive at "manufactur"; "labelling" loses "ing" and then one "l".
    """
    if not _is_latin(token) or len(token) < 4:
        return token

    if token.endswith("ies") and len(token) >= 5:
        token = token[:-3] + "y"
    elif token.endswith("ing") and len(token) >= 6:
        token = token[:-3]
    elif token.endswith(("ed", "es")) and len(token) >= 5:
        token = token[:-2]
    elif token.endswith("s") and not token.endswith("ss") and len(token) >= 4:
        token = token[:-1]

    if len(token) >= 4 and token.endswith("e"):
        token = token[:-1]
    if len(token) >= 4 and token[-1] == token[-2] and token[-1] not in "aeiou":
        token = token[:-1]

    return token


def tokenize(text: str, *, drop_stopwords: bool = True, fold_suffixes: bool = True) -> list[str]:
    raw: list[str] = []
    current: list[str] = []

    for character in text.casefold():
        if _is_word_character(character):
            current.append(character)
            continue
        if current:
            raw.append("".join(current))
            current = []
    if current:
        raw.append("".join(current))

    tokens: list[str] = []
    for token in raw:
        if len(token) < MIN_TOKEN_LENGTH:
            continue
        if drop_stopwords and token in STOPWORDS:
            continue
        tokens.append(fold(token) if fold_suffixes else token)
    return tokens
