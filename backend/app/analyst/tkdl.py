"""The public parts of the Traditional Knowledge Digital Library, and nothing else.

`corpus/guidance/tkdl.json` holds what the official TKDL website publishes openly:
page references, and the lists of classical books TKDL transcribes (title, author,
edition). It holds no TKDL formulation records. The full database is proprietary
to the Government of India and open only to patent offices under the TKDL Access
Agreement, so it is never searched from here.

What this module does with the book lists: when someone says their formulation
comes from a classical text, it recognises whether that text is one TKDL has
transcribed. A formulation documented in such a text is traditional knowledge
and prior art, whether or not its TKDL record can be seen.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.core.settings import REPO_ROOT

TKDL_PATH = REPO_ROOT / "corpus" / "guidance" / "tkdl.json"

#: Volume, part and edition suffixes, stripped so every volume names one work.
_SUFFIX = re.compile(r"\s*(?:[-,]\s*)?(?:vol(?:ume)?\.?|part)\b.*$|\s*\([^)]*\)\s*$", re.IGNORECASE)
#: Shorter work names are too likely to occur inside ordinary words or phrases.
_MIN_LENGTH = 8


def fold(text: str) -> str:
    """Lower case, no diacritics, punctuation as spaces, single-spaced."""
    decomposed = unicodedata.normalize("NFKD", text)
    plain = "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", plain).split())


def work_name(title: str) -> str:
    """ "Charaka Samhita - Vol.-I" -> "Charaka Samhita"."""
    previous = None
    name = title.strip()
    while previous != name:
        previous = name
        name = _SUFFIX.sub("", name).strip(" -,")
    return name


def _variants(name: str) -> set[str]:
    """Spellings a reader is likely to type: Hridaya / Hridayam, Rasamritam / Rasamrita."""
    variants: set[str] = set()
    # "Kashyapa Samhita or Vriddhajivakiya Tantra" is known by either name.
    for part in re.split(r"\s+or\s+", name, flags=re.IGNORECASE):
        folded = fold(part)
        variants.add(folded)
        if folded.endswith("am"):
            variants.add(folded[:-1])
        elif folded.endswith("a"):
            variants.add(folded + "m")
    return {v for v in variants if len(v) >= _MIN_LENGTH}


@dataclass(frozen=True)
class TkdlWork:
    name: str
    system: str
    author: str | None
    volumes: int
    list_url: str


@dataclass(frozen=True)
class TkdlPage:
    id: str
    title: str
    url: str


@dataclass(frozen=True)
class TkdlReference:
    retrieved_on: str
    home_url: str
    pages: tuple[TkdlPage, ...]
    works: tuple[TkdlWork, ...]
    book_count: int
    _index: tuple[tuple[str, int], ...]

    def page(self, page_id: str) -> TkdlPage:
        return next(p for p in self.pages if p.id == page_id)

    def find(self, text: str) -> list[TkdlWork]:
        """Works TKDL transcribes that are named in `text`, longest name first."""
        folded = " " + fold(text) + " "
        found: list[TkdlWork] = []
        for variant, index in self._index:
            work = self.works[index]
            if " " + variant + " " in folded and work not in found:
                found.append(work)
                folded = folded.replace(" " + variant + " ", "  ")
        return found


def load_tkdl(path: Path = TKDL_PATH) -> TkdlReference:
    raw = json.loads(path.read_text(encoding="utf-8"))
    list_urls = {entry["system"]: entry["url"] for entry in raw["book_lists"]}
    works: dict[tuple[str, str], TkdlWork] = {}
    count = 0
    for system, rows in raw["books"].items():
        for row in rows:
            count += 1
            name = work_name(row["title"])
            key = (system, fold(name))
            existing = works.get(key)
            works[key] = TkdlWork(
                name=name,
                system=system,
                author=row.get("author") or (existing.author if existing else None),
                volumes=(existing.volumes if existing else 0) + 1,
                list_url=list_urls[system],
            )
    ordered = tuple(works.values())
    index = sorted(
        ((variant, i) for i, work in enumerate(ordered) for variant in _variants(work.name)),
        key=lambda item: -len(item[0]),
    )
    return TkdlReference(
        retrieved_on=raw["retrieved_on"],
        home_url=raw["home_url"],
        pages=tuple(TkdlPage(**page) for page in raw["pages"]),
        works=ordered,
        book_count=count,
        _index=tuple(index),
    )


@lru_cache
def get_tkdl() -> TkdlReference:
    return load_tkdl()
