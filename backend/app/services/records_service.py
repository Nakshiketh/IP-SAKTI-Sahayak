"""The records service. Everything the product does with Layer 2.

Deliberately not part of the query pipeline. `app.services.pipeline` calls
`related_records` and nothing else here, and what it gets back travels beside an
answer rather than into it. The four orchestration rules are held in code:

1. **A record is never packed into the model's context as authority.**
   `build_context` takes `ScoredChunk` and there is no overload that takes a
   `Record`, so this is a type error rather than a policy. If record text ever
   does reach a model, `EVIDENCE_LABEL` is the prefix it must carry.
2. **Confidence is computed only from corpus passages.** `score_confidence` is
   not given records — see its signature — so this cannot be got wrong here.
3. **A corpus abstention is not rescued.** `related_records` is called for an
   abstention exactly as for an answer, and the caller attaches the result
   beside either. Nothing in this module can change an abstention.
4. **An aggregate never attaches to a claim about a specific product.**
   `landscape` reads a different table, is reachable only from its own endpoint,
   and nothing in the answer path calls it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path

from app.models.domain import Record
from app.records.manifest import RecordsManifest
from app.records.portal import PortalLink, links_for
from app.records.store import RecordsStore
from app.records.types import AggregateStatistic, RecordAccessMode

#: The only wrapper under which record text may ever reach a model. Unused
#: today, because no record reaches one; kept here so that if a later phase
#: packs one, the label is already written and already the right words.
EVIDENCE_LABEL = "EVIDENCE — a filed or granted record, not a statement of law"

#: A question is about the kind of thing that gets filed. Not a search — a
#: cheap test for whether offering records beside the answer makes sense.
_TRIGGER_WORDS = frozenset(
    {
        "patent",
        "patents",
        "formulation",
        "composition",
        "herb",
        "herbal",
        "prior",
        "art",
        "record",
        "records",
        "filed",
        "filing",
        "registration",
        "registered",
        "trademark",
        "brand",
        "geographical",
        "indication",
    }
)


@dataclass(frozen=True)
class RecordsStatus:
    available: bool
    record_count: int
    source_count: int
    records_version: str
    #: Sources whose licence has been read and which therefore may be ingested.
    ingestible_count: int
    portal_count: int


class RecordsService:
    def __init__(self, store: RecordsStore, manifest_path: Path) -> None:
        self._store = store
        self._manifest_path = manifest_path
        self._manifest: RecordsManifest | None = None

    @property
    def manifest(self) -> RecordsManifest:
        if self._manifest is None:
            self._manifest = RecordsManifest.load(self._manifest_path)
        return self._manifest

    @property
    def store(self) -> RecordsStore:
        return self._store

    def status(self) -> RecordsStatus:
        sources = self.manifest.sources
        return RecordsStatus(
            available=self._store.available,
            record_count=self._store.count(),
            source_count=len(sources),
            records_version=self.manifest.records_version,
            ingestible_count=sum(1 for source in sources if source.ingestible),
            portal_count=sum(
                1 for source in sources if source.access_mode is RecordAccessMode.PORTAL_LINK_ONLY
            ),
        )

    # -- reading -----------------------------------------------------------

    def search_records(
        self,
        query: str = "",
        *,
        match_any: bool = False,
        record_type: str | None = None,
        jurisdiction: str | None = None,
        status: str | None = None,
        filed_from: date | None = None,
        filed_to: date | None = None,
        limit: int = 20,
    ) -> list[Record]:
        return self._store.search(
            query,
            match_any=match_any,
            record_type=record_type,
            jurisdiction=jurisdiction,
            status=status,
            filed_from=filed_from,
            filed_to=filed_to,
            limit=max(1, min(limit, 100)),
        )

    def get_record(self, record_id: str) -> Record | None:
        return self._store.get(record_id)

    def landscape(
        self, field: str | None = None, period: str | None = None
    ) -> list[AggregateStatistic]:
        """Aggregates, for charts.

        Reachable only from its own endpoint. Nothing in the answer path calls
        this, and a count of what an industry filed says nothing about whether a
        particular reader's formulation is novel.
        """
        return self._store.aggregates(dimension=field, period=period)

    def portal_links(self, params: dict[str, str] | None = None) -> list[PortalLink]:
        return links_for(self.manifest.sources, params)

    def build_portal_link(self, source_id: str, params: dict[str, str] | None = None) -> str | None:
        source = self.manifest.by_id(source_id)
        if source is None:
            return None
        from app.records.portal import build_link

        return build_link(source, params)

    def sources(self) -> list[dict]:
        """Every source, with what the store knows about what was ingested."""
        ingested = {row["source_id"]: row for row in self._store.sources()}
        snapshots = {snapshot.source_id: snapshot for snapshot in reversed(self._store.snapshots())}
        out: list[dict] = []
        for source in self.manifest.sources:
            snapshot = snapshots.get(source.source_id)
            out.append(
                {
                    "source_id": source.source_id,
                    "name": source.name,
                    "publisher": source.publisher,
                    "jurisdiction": source.jurisdiction,
                    "record_type": source.record_type,
                    "access_mode": source.access_mode.value,
                    "licence": source.licence,
                    "licence_url": source.licence_url,
                    "attribution_text": source.attribution_text,
                    "terms_note": source.terms_note,
                    "citable_in_answers": False,
                    "ingested": source.source_id in ingested,
                    "record_count": self._store.count(source.source_id),
                    "last_snapshot_at": (
                        snapshot.taken_at.isoformat() if snapshot is not None else None
                    ),
                    "link_template_verified": bool(source.link_template),
                }
            )
        return out

    # -- what the answer surface gets --------------------------------------

    def related_records(
        self, question: str, jurisdiction: str, *, limit: int = 4
    ) -> tuple[Record, ...]:
        """Records adjacent to a question. Never part of an answer.

        Called for an abstention exactly as for an answer, because the rule that
        matters is that their presence changes nothing. Returns nothing when
        nothing has been ingested, which is the honest answer rather than a
        fixture standing in for a registry.
        """
        if not self._store.available:
            return ()
        tokens = {word.strip(".,?!:;()\"'").casefold() for word in question.split()}
        if not tokens & _TRIGGER_WORDS:
            return ()

        # Any of the question's distinctive words, not all of them. No filing's
        # title contains every word of somebody's question, and ANDing here
        # would return nothing however relevant the registry was.
        distinctive = " ".join(sorted(token for token in tokens if len(token) >= 4))
        return tuple(
            self.search_records(distinctive, match_any=True, jurisdiction=jurisdiction, limit=limit)
        )
