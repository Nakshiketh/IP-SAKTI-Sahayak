"""BM25, in the standard library.

Written out rather than pulled from a package because it is forty lines, it has
to run over Devanagari as readily as over English, and a dependency that pins a
tokeniser would take that choice away from `tokenize.py`.

Okapi BM25 with the usual constants: k1 controls how quickly term frequency
saturates, b how strongly length is normalised. Statutory sections vary enormously
in length — a definition clause against a whole schedule — so b is left at the
full 0.75 rather than lowered, or the schedules win everything.
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass

from app.retrieval.tokenize import tokenize

K1 = 1.5
B = 0.75


@dataclass
class Bm25Index:
    """An in-memory BM25 index over a fixed set of documents.

    Built once from a chunk store and queried per request. Rebuilding it per
    query would be the obvious mistake; the store hands one of these to the
    retrieval stage already built.
    """

    doc_ids: list[str]
    term_frequencies: list[Counter[str]]
    lengths: list[int]
    document_frequency: Counter[str]
    average_length: float

    @classmethod
    def build(cls, documents: list[tuple[str, str]]) -> Bm25Index:
        """``documents`` is a list of (id, text)."""
        doc_ids: list[str] = []
        term_frequencies: list[Counter[str]] = []
        lengths: list[int] = []
        document_frequency: Counter[str] = Counter()

        for doc_id, text in documents:
            tokens = tokenize(text)
            counts = Counter(tokens)
            doc_ids.append(doc_id)
            term_frequencies.append(counts)
            lengths.append(len(tokens))
            document_frequency.update(counts.keys())

        average = sum(lengths) / len(lengths) if lengths else 0.0
        return cls(doc_ids, term_frequencies, lengths, document_frequency, average)

    def __len__(self) -> int:
        return len(self.doc_ids)

    def _idf(self, term: str) -> float:
        """Robertson-Sparck-Jones idf, floored at zero.

        The unfloored form goes negative for a term in more than half the
        documents, which would make a common word actively push a passage down.
        In a corpus where every document says "Ayurvedic" that is not a
        theoretical concern.
        """
        n = len(self.doc_ids)
        df = self.document_frequency.get(term, 0)
        return max(0.0, math.log(1.0 + (n - df + 0.5) / (df + 0.5)))

    def search(self, query: str, limit: int) -> list[tuple[str, float]]:
        terms = tokenize(query)
        if not terms or not self.doc_ids:
            return []

        idfs = {term: self._idf(term) for term in set(terms)}
        scored: list[tuple[str, float]] = []

        for index, counts in enumerate(self.term_frequencies):
            length = self.lengths[index]
            total = 0.0
            for term in terms:
                frequency = counts.get(term, 0)
                if frequency == 0:
                    continue
                denominator = frequency + K1 * (
                    1 - B + B * (length / self.average_length if self.average_length else 1.0)
                )
                total += idfs[term] * (frequency * (K1 + 1)) / denominator
            if total > 0.0:
                scored.append((self.doc_ids[index], total))

        scored.sort(key=lambda pair: (-pair[1], pair[0]))
        return scored[:limit]
