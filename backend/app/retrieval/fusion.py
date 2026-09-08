"""Reciprocal rank fusion.

Two channels that score on incomparable scales still agree about order, so the
fusion reads rank and discards score. A passage the lexical channel ranks third
and the dense channel ranks second is a better candidate than one either channel
ranks first alone, and this is the cheapest way to say that without inventing a
weighting nobody can defend.

`k` damps the top of each list: without it, rank 1 in a channel that returned
noise would outrank a passage both channels liked.
"""

from __future__ import annotations

from collections.abc import Sequence


def reciprocal_rank_fusion(
    rankings: dict[str, Sequence[str]],
    *,
    k: int = 60,
    limit: int | None = None,
) -> list[tuple[str, float, tuple[str, ...]]]:
    """``rankings`` maps a channel name to its ordered ids.

    Returns (id, fused score, contributing channels), best first. The channels
    come back with the result because the audit trail records which channel
    proposed a passage, and reconstructing that afterwards is guesswork.
    """
    scores: dict[str, float] = {}
    contributors: dict[str, list[str]] = {}

    for channel, ordered in rankings.items():
        for position, identifier in enumerate(ordered, start=1):
            scores[identifier] = scores.get(identifier, 0.0) + 1.0 / (k + position)
            contributors.setdefault(identifier, []).append(channel)

    fused = [
        (identifier, score, tuple(contributors[identifier])) for identifier, score in scores.items()
    ]
    fused.sort(key=lambda row: (-row[1], row[0]))
    return fused[:limit] if limit is not None else fused
