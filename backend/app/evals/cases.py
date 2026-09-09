"""Reading the gold set.

Every field on a case is a statement about the *question* — which jurisdiction it
belongs in, which rights it touches, whether it should be answered or declined,
which instrument an answer would have to rest on. None of them asserts what any
instrument says, which is what makes the set writable before anything is
ingested.

`reference_answer` is null on every case and the loader refuses one that is not.
That looks strange until you consider what a non-null one would be: a model
answer stating what the law requires, written by somebody who has not read the
source. The gate is there so a future contributor filling them in has to think
about where the text came from.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

BEHAVIOURS = frozenset({"answer", "abstain", "clarify"})


@dataclass(frozen=True)
class GoldCase:
    id: str
    question: str
    language: str
    jurisdiction: str
    expected_behaviour: str
    expected_abstain_reason: str | None = None
    expected_product_class: str | None = None
    expected_ip_rights: tuple[str, ...] = ()
    expected_regulatory_areas: tuple[str, ...] = ()
    must_cite_document_ids: tuple[str, ...] = ()
    must_not_claim: tuple[str, ...] = ()
    #: "some" | "none" | None. Set only on the records regression set.
    expected_related_records: str | None = None
    notes: str = ""
    #: Which file it came from, for the per-group breakdown in the report.
    group: str = ""

    @property
    def should_abstain(self) -> bool:
        """Clarifying is a kind of declining: it stops and asks rather than answering."""
        return self.expected_behaviour in ("abstain", "clarify")


@dataclass
class GoldSet:
    cases: list[GoldCase] = field(default_factory=list)

    def __len__(self) -> int:
        return len(self.cases)

    def by_group(self) -> dict[str, list[GoldCase]]:
        groups: dict[str, list[GoldCase]] = {}
        for case in self.cases:
            groups.setdefault(case.group, []).append(case)
        return groups

    def languages(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for case in self.cases:
            counts[case.language] = counts.get(case.language, 0) + 1
        return counts


def case_from_row(row: dict, group: str) -> GoldCase:
    behaviour = row["expected_behaviour"]
    if behaviour not in BEHAVIOURS:
        raise ValueError(row["id"] + " has an unknown expected_behaviour: " + behaviour)
    if row.get("reference_answer") is not None:
        raise ValueError(
            row["id"]
            + " carries a reference_answer. Writing one means stating what a source says; "
            "say where the text came from before filling this in."
        )
    return GoldCase(
        id=row["id"],
        question=row["question"],
        language=row.get("language", "en"),
        jurisdiction=row["jurisdiction"],
        expected_behaviour=behaviour,
        expected_abstain_reason=row.get("expected_abstain_reason"),
        expected_product_class=row.get("expected_product_class"),
        expected_ip_rights=tuple(row.get("expected_ip_rights") or ()),
        expected_regulatory_areas=tuple(row.get("expected_regulatory_areas") or ()),
        must_cite_document_ids=tuple(row.get("must_cite_document_ids") or ()),
        must_not_claim=tuple(row.get("must_not_claim") or ()),
        expected_related_records=row.get("expected_related_records"),
        notes=row.get("notes", ""),
        group=group,
    )


def load_gold(directory: Path, *, only: tuple[str, ...] = ()) -> GoldSet:
    if not directory.exists():
        raise FileNotFoundError(str(directory))

    cases: list[GoldCase] = []
    seen: set[str] = set()
    for path in sorted(directory.glob("*.jsonl")):
        group = path.stem
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(path.name + " line " + str(number) + ": " + str(error)) from error
            case = case_from_row(row, group)
            if case.id in seen:
                raise ValueError("duplicate case id: " + case.id)
            seen.add(case.id)
            cases.append(case)

    if only:
        wanted = set(only)
        cases = [case for case in cases if case.id in wanted or case.group in wanted]

    return GoldSet(cases=cases)
