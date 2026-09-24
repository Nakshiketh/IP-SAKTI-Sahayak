"""The pipeline: one question in, one answer set out.

Every stage is its own module; this file is the order they run in and the
bookkeeping between them. It is written as a generator so the API can stream:
each stage yields an event as it finishes, the retrieval count goes out as soon
as it is known, and the finished result is the last event. The timings the
interface shows are the ones the stages actually took — there is no simulated
progress anywhere in this file.

Three decisions are made here rather than in a stage, because they are about how
the stages relate:

* A refusal short-circuits before retrieval. Whether a dosage question is
  refused must not depend on what happened to be in the corpus.
* A cross-border question runs the whole pipeline twice, once per namespace, and
  returns two results. Nothing merges them.
* Confidence is scored from the retrieval evidence, and can abstain over a
  generator that was perfectly willing to answer. The generator does not get a
  vote on its own confidence.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Iterator
from contextlib import suppress
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime

from app.core.errors import ApiError
from app.core.settings import Settings
from app.llm.types import GenerationRequest, GenerationResult, LLMClient
from app.models.domain import (
    AbstainReason,
    Analysis,
    Answer,
    Citation,
    Confidence,
    IPRight,
    Jurisdiction,
    ProductClass,
    Record,
    RegulatoryArea,
    VerificationStatus,
)
from app.reasoning import analyse
from app.registry.store import SourceRegistry, get_registry
from app.retrieval.store import Namespaces
from app.retrieval.types import RetrievalFilters, ScoredChunk
from app.services import citations as citation_service
from app.services import confidence as confidence_service
from app.services.audit import AuditLog, AuditRow, hash_question
from app.services.context import build_context
from app.services.guardrails import Refusal, classify_refusal
from app.services.language import Detection, detect_language
from app.services.parts import Part, merge_parts, split_question
from app.services.procedures import expand_procedure
from app.services.records_service import RecordsService
from app.services.retrieval import Retriever
from app.services.routing import Route, route
from app.services.translation import Translator
from app.services.understanding import Understanding, understand_query

#: The stages, in order, as the interface names them. `translate` runs last
#: because a translated answer still has to carry untranslated citations.
STAGE_IDS = (
    "detect",
    "understand",
    "route",
    "retrieve",
    "rerank",
    "reason",
    "context",
    "generate",
    "map",
    "translate",
)


def _first_known(*classes: ProductClass) -> ProductClass:
    for product_class in classes:
        if product_class is not ProductClass.UNDETERMINED:
            return product_class
    return ProductClass.UNDETERMINED


@dataclass
class StageTiming:
    id: str
    ms: int


class _Clock:
    """Wall-clock timing for the stages, in one place so it reads once."""

    def __init__(self) -> None:
        self.started = time.perf_counter()
        self._mark = self.started
        self.stages: list[StageTiming] = []

    def stage(self, stage_id: str) -> StageTiming:
        now = time.perf_counter()
        timing = StageTiming(id=stage_id, ms=max(0, round((now - self._mark) * 1000)))
        self._mark = now
        self.stages.append(timing)
        return timing

    @property
    def total_ms(self) -> int:
        return max(0, round((time.perf_counter() - self.started) * 1000))


@dataclass
class QueryRequest:
    question: str
    jurisdiction: Jurisdiction = Jurisdiction.IN
    language_in: str | None = None
    language_out: str | None = None
    product_class: ProductClass = ProductClass.UNDETERMINED
    session_id: str = "anonymous"
    ip_rights: tuple[IPRight, ...] = ()
    regulatory_areas: tuple[RegulatoryArea, ...] = ()
    document_types: tuple[str, ...] = ()


@dataclass
class QueryOutcome:
    """One jurisdiction's result. A cross-border question produces two."""

    query_id: str
    session_id: str
    question: str
    jurisdiction: Jurisdiction
    route_inferred: bool
    route_marker: str | None
    detection: Detection
    understanding: Understanding
    refusal: Refusal | None
    evidence: confidence_service.RetrievalEvidence
    confidence: confidence_service.ConfidenceResult
    answer: Answer | None
    related_records: tuple[Record, ...]
    follow_ups: tuple[str, ...]
    stages: tuple[StageTiming, ...]
    total_ms: int
    documents_searched: int
    corpus_version: str
    is_demo: bool
    translator: str
    translated: bool
    #: The parts a multi-part question was split into, and which part each
    #: passage answered. Empty for an ordinary one-part question.
    parts: tuple[Part, ...] = ()
    answered_parts: dict[str, str] = field(default_factory=dict)
    #: What the reasoning stage concluded. Present even on an abstention: the
    #: issues a question raises are worth reporting whether or not the corpus
    #: could answer them.
    analysis: Analysis | None = None
    #: Set when the question named a place the corpus does not cover.
    uncovered_jurisdiction: str | None = None
    passage_text: dict[str, str] = field(default_factory=dict)
    #: A citation for every passage considered, keyed by citation id. The
    #: abstention surface needs these: a conflict is only useful if the reader
    #: can see both sides of it, and there is no answer to read them off.
    sources: dict[str, Citation] = field(default_factory=dict)


@dataclass
class StageEvent:
    stage: StageTiming


@dataclass
class RetrievedEvent:
    passages: int
    documents: int


@dataclass
class ResultEvent:
    outcome: QueryOutcome


PipelineEvent = StageEvent | RetrievedEvent | ResultEvent


class Pipeline:
    def __init__(
        self,
        *,
        settings: Settings,
        namespaces: Namespaces,
        llm: LLMClient,
        translator: Translator,
        retriever: Retriever | None = None,
        audit: AuditLog | None = None,
        records: RecordsService | None = None,
        registry: SourceRegistry | None = None,
    ) -> None:
        self._settings = settings
        self._namespaces = namespaces
        self._llm = llm
        self._translator = translator
        self._records = records
        self._retriever = retriever or Retriever(fusion_k=settings.fusion_k)
        self._audit = audit or AuditLog(settings.audit_db_path, enabled=settings.audit_enabled)
        self._registry = registry if registry is not None else get_registry()

    # -- routing -----------------------------------------------------------

    def routes(self, request: QueryRequest) -> tuple[Route, ...]:
        return route(request.question, request.jurisdiction).routes

    def run(self, request: QueryRequest) -> Iterator[PipelineEvent]:
        """Stream one jurisdiction's run. Callers loop over `routes` themselves."""
        yield from self._run_route(request, self.routes(request)[0])

    def run_route(self, request: QueryRequest, chosen: Route) -> Iterator[PipelineEvent]:
        yield from self._run_route(request, chosen)

    # -- the run itself ----------------------------------------------------

    def _run_route(self, request: QueryRequest, chosen: Route) -> Iterator[PipelineEvent]:
        clock = _Clock()
        query_id = uuid.uuid4().hex
        today = datetime.now(UTC).date()

        detection = detect_language(request.question)
        language_in = request.language_in or (detection.language if detection.decided else "en")
        language_out = request.language_out or language_in
        yield StageEvent(clock.stage("detect"))

        refusal = classify_refusal(request.question)
        understanding = understand_query(request.question, product_class=request.product_class)
        yield StageEvent(clock.stage("understand"))

        if refusal is not None:
            outcome = self._refused(
                request,
                chosen,
                query_id,
                detection,
                understanding,
                refusal,
                clock,
                language_in,
                language_out,
            )
            self._record(outcome, refusal=refusal)
            yield ResultEvent(outcome)
            return

        routing = route(request.question, request.jurisdiction)
        yield StageEvent(clock.stage("route"))

        if routing.uncovered:
            # There is no namespace to send this to. Retrieval could only return
            # passages about somewhere the reader did not ask about, so it does
            # not run: the evidence is empty and the confidence rule reaches
            # "nothing relevant" on its own.
            empty = self._evidence(chosen.jurisdiction, [], (), today, needs_more_facts=False)
            scored_empty = confidence_service.score_confidence(empty)
            yield RetrievedEvent(passages=0, documents=0)
            uncovered_analysis = self._analyse(
                request, chosen, understanding, [], (), None, routing
            )
            for stage_id in (
                "retrieve",
                "rerank",
                "reason",
                "context",
                "generate",
                "map",
                "translate",
            ):
                yield StageEvent(clock.stage(stage_id))
            outcome = self._finish(
                request,
                chosen,
                query_id,
                detection,
                understanding,
                None,
                empty,
                scored_empty,
                None,
                (),
                clock,
                0,
                [],
                language_in,
                language_out,
                translated=False,
                uncovered=routing.uncovered,
                analysis=uncovered_analysis,
            )
            self._record(outcome)
            yield ResultEvent(outcome)
            return

        store = self._namespaces.store(chosen.jurisdiction)
        filters = RetrievalFilters(
            effective_on=today,
            document_types=frozenset(request.document_types),
            ip_rights=frozenset(request.ip_rights),
            regulatory_areas=frozenset(request.regulatory_areas),
        )
        # A question with several numbered parts is retrieved for one part at
        # a time. Scoring a passage against all seven parts at once is what
        # made the hardest questions retrieve nothing at all.
        parts = split_question(request.question)
        retrieved, answered_parts = self._retrieve_parts(
            parts, understanding, request, store, filters, today
        )
        # Retrieval and reranking are one call into the retriever; the split
        # below reports them as the two stages a reader sees, with the fused
        # candidate work attributed to retrieval.
        yield StageEvent(clock.stage("retrieve"))
        yield StageEvent(clock.stage("rerank"))

        passages = self._citable(list(retrieved.passages))
        evidence = self._evidence(
            chosen.jurisdiction,
            passages,
            retrieved.contradictions,
            today,
            needs_more_facts=understanding.clarification_needed is not None,
        )
        candidates = [
            p for p in evidence.passages if p.rerank_score >= confidence_service.RERANK_FLOOR
        ]
        yield RetrievedEvent(
            passages=len(candidates),
            documents=len({p.document_id for p in candidates}),
        )

        governing = self._governing_documents(request, chosen, routing, passages, filters, today)
        analysis = self._analyse(
            request,
            chosen,
            understanding,
            passages,
            retrieved.contradictions,
            store,
            routing,
            governing=governing,
        )
        yield StageEvent(clock.stage("reason"))

        scored = self._cap_for_provenance(confidence_service.score_confidence(evidence), passages)

        if scored.level is Confidence.ABSTAIN:
            # Nothing is packed and nothing is generated. An abstention that ran
            # the generator anyway would be paying for an answer it discards,
            # and would leave a generated answer sitting in memory beside a
            # surface that says there is none.
            for stage_id in ("context", "generate", "map", "translate"):
                yield StageEvent(clock.stage(stage_id))
            outcome = self._finish(
                request,
                chosen,
                query_id,
                detection,
                understanding,
                None,
                evidence,
                scored,
                None,
                (),
                clock,
                retrieved.documents_searched,
                passages,
                language_in,
                language_out,
                translated=False,
                analysis=analysis,
            )
            self._record(outcome)
            yield ResultEvent(outcome)
            return

        # Only candidates are packed. A passage below the retrieval floor is not
        # a candidate, and packing it would leave the generator free to hang a
        # claim on something the confidence rule has already discounted.
        floor = confidence_service.RERANK_FLOOR
        cited_passages = [p for p in passages if (p.rerank_score or 0.0) >= floor]
        # A procedural question that landed on a procedure gets every step of
        # it, in order. Confidence was scored above, from retrieval alone.
        expansion = expand_procedure(request.question, cited_passages, store, floor=floor)
        if expansion.passages is not cited_passages:
            cited_passages = expansion.passages
            known = {p.chunk.chunk_id for p in cited_passages}
            passages = cited_passages + [p for p in passages if p.chunk.chunk_id not in known]
        context = build_context(
            cited_passages,
            token_budget=self._settings.context_token_budget,
            max_share_per_document=self._settings.context_max_share_per_document,
        )
        yield StageEvent(clock.stage("context"))

        all_demo = bool(cited_passages) and all(
            p.chunk.verification_status is VerificationStatus.DEMO for p in cited_passages
        )
        generated: GenerationResult = self._llm.generate(
            GenerationRequest(
                question=request.question,
                jurisdiction=chosen.jurisdiction,
                language=language_out,
                product_class=request.product_class,
                context=context,
                all_passages_are_demo=all_demo,
                procedure_id=expansion.procedure_id,
                lead_passages=expansion.lead,
            )
        )
        yield StageEvent(clock.stage("generate"))

        built = citation_service.build_citations(
            cited_passages, as_of=today, registry=self._registry
        )
        mapped = citation_service.map_citations(
            generated, citations=built, supplied_ids=set(context.chunk_ids)
        )
        yield StageEvent(clock.stage("map"))

        if generated.abstained or mapped.collapsed:
            # The generator declined, or too little survived citation checking
            # for what is left to be the answer that was written. Either way the
            # honest report is that nothing in these passages answers this.
            scored = confidence_service.ConfidenceResult(
                level=Confidence.ABSTAIN,
                reason_key=confidence_service.ReasonKey.ABSTAIN_NOTHING,
                reason_vars=scored.reason_vars,
                abstain_reason=AbstainReason.NOTHING_RELEVANT,
            )
            yield StageEvent(clock.stage("translate"))
            outcome = self._finish(
                request,
                chosen,
                query_id,
                detection,
                understanding,
                None,
                evidence,
                scored,
                None,
                mapped.dropped_claims,
                clock,
                retrieved.documents_searched,
                passages,
                language_in,
                language_out,
                translated=False,
                analysis=analysis,
            )
            self._record(
                outcome, dropped=len(mapped.dropped_claims), neutralised=context.neutralised_spans
            )
            yield ResultEvent(outcome)
            return

        translated = self._translate(mapped, language_in, language_out)
        yield StageEvent(clock.stage("translate"))

        analysis = self._analyse(
            request,
            chosen,
            understanding,
            passages,
            retrieved.contradictions,
            store,
            routing,
            dropped_claims=len(mapped.dropped_claims),
            governing=governing,
        )
        answer = self._assemble(
            request,
            chosen,
            query_id,
            generated,
            mapped,
            scored,
            clock,
            language_out=language_out,
            as_of=today,
            is_demo=all_demo,
            analysis=analysis,
        )
        outcome = self._finish(
            request,
            chosen,
            query_id,
            detection,
            understanding,
            None,
            evidence,
            scored,
            answer,
            mapped.dropped_claims,
            clock,
            retrieved.documents_searched,
            passages,
            language_in,
            language_out,
            translated=translated,
            analysis=analysis,
            parts=parts if len(parts) > 1 else (),
            answered_parts=answered_parts,
        )
        self._record(
            outcome, dropped=len(mapped.dropped_claims), neutralised=context.neutralised_spans
        )
        yield ResultEvent(outcome)

    # -- helpers -----------------------------------------------------------

    def _governing_documents(self, request, chosen, routing, passages, filters, today):
        """The top document on each side of a cross-border question.

        The other jurisdiction is searched only for the identity of its leading
        document, so the conflict can name both sides. Its passages are never
        returned and never reach this answer's context — the two analyses stay
        separate, which is the rule this product is built on.
        """
        here = passages[0].chunk.document_id if passages else None
        others = [
            r.jurisdiction for r in routing.routes if r.jurisdiction is not chosen.jurisdiction
        ]
        if not others:
            return (here, None)
        try:
            found = self._retriever.retrieve(
                request.question,
                self._namespaces.store(others[0]),
                filters=filters,
                candidates=self._settings.retrieval_candidates,
                keep=1,
                on=today,
            )
        except Exception:  # noqa: BLE001 - naming the other side is a nicety, never a failure
            return (here, None)
        there = found.passages[0].chunk.document_id if found.passages else None
        return (here, there)

    def _retrieve_parts(self, parts, understanding, request, store, filters, today):
        """Retrieve once per part of the question, then merge the results.

        One part is the ordinary case and goes straight through, so nothing
        changes for the great majority of questions.
        """
        if len(parts) <= 1:
            text = understanding.expanded_query or request.question
            return (
                self._retriever.retrieve(
                    text,
                    store,
                    filters=filters,
                    candidates=self._settings.retrieval_candidates,
                    keep=self._settings.rerank_keep,
                    on=today,
                ),
                {},
            )

        results: list[tuple[Part, list[ScoredChunk]]] = []
        last = None
        contradictions: list[tuple[str, str]] = []
        searched = 0
        for part in parts:
            expanded = understand_query(part.text).expanded_query or part.text
            last = self._retriever.retrieve(
                expanded,
                store,
                filters=filters,
                candidates=self._settings.retrieval_candidates,
                keep=self._settings.rerank_keep,
                on=today,
            )
            results.append((part, list(last.passages)))
            contradictions.extend(last.contradictions)
            searched = max(searched, last.documents_searched)

        passages, answered = merge_parts(results)
        assert last is not None
        merged = replace(
            last,
            passages=tuple(passages),
            contradictions=tuple(dict.fromkeys(contradictions)),
            documents_searched=searched,
        )
        return merged, answered

    def _analyse(
        self,
        request,
        chosen,
        understanding,
        passages,
        contradictions,
        store,
        routing,
        *,
        dropped_claims: int = 0,
        refusal: Refusal | None = None,
        governing: tuple[str | None, str | None] = (None, None),
    ) -> Analysis:
        """Run the reasoning stage over what retrieval found.

        Given the store rather than the retrieved passages for the corpus set:
        a classification rule is backed by a document being in the corpus, not
        by this particular question having retrieved it.
        """
        other = tuple(route.jurisdiction for route in routing.routes) if routing else ()
        uncovered = (routing.uncovered,) if routing and routing.uncovered else ()
        corpus_ids = (
            frozenset(chunk.document_id for chunk in store.chunks()) if store else frozenset()
        )
        pending = any(
            (record := self._registry.get(p.chunk.document_id)) is not None
            and record.provenance_pending
            for p in passages
        )
        return analyse(
            request.question,
            passages=list(passages),
            jurisdiction=chosen.jurisdiction,
            ip_rights=understanding.ip_rights,
            regulatory_areas=understanding.regulatory_areas,
            contradiction_pairs=tuple(contradictions),
            corpus_document_ids=corpus_ids,
            registry=self._registry,
            dropped_claims=dropped_claims,
            provenance_pending=pending,
            other_jurisdictions=other,
            unsupported_jurisdictions=uncovered,
            governing_here=governing[0],
            governing_there=governing[1],
            refusal=refusal,
        )

    def _citable(self, passages: list[ScoredChunk]) -> list[ScoredChunk]:
        """Drop passages whose source the registry says may not be cited.

        The registry can only speak about what it has registered. A passage
        from a document it does not hold — a demo fixture, a sample corpus, an
        index built elsewhere — passes through untouched; silently emptying
        those answers would be a worse failure than the one this guards
        against. Tightening that to "registered or nothing" waits until the
        registry covers every corpus, in Phase 2.
        """
        known = self._registry.all()
        if not known:
            return passages
        return [
            p
            for p in passages
            if (record := known.get(p.chunk.document_id)) is None or record.usable
        ]

    def _cap_for_provenance(
        self, scored: confidence_service.ConfidenceResult, passages: list[ScoredChunk]
    ) -> confidence_service.ConfidenceResult:
        """A source awaiting provenance review holds an answer below high."""
        if scored.level is not Confidence.HIGH:
            return scored
        pending = any(
            (record := self._registry.get(p.chunk.document_id)) is not None
            and record.provenance_pending
            for p in passages
        )
        if not pending:
            return scored
        return confidence_service.ConfidenceResult(
            level=Confidence.MODERATE,
            reason_key=confidence_service.ReasonKey.MODERATE_PROVENANCE_PENDING,
            reason_vars=scored.reason_vars,
            abstain_reason=None,
        )

    def _translate(self, mapped: citation_service.MappedAnswer, source: str, target: str) -> bool:
        """Translate the blocks in place. Citation metadata is never touched."""
        if source == target:
            return False
        texts = [block.text for block in mapped.blocks]
        result = self._translator.translate(texts, source=source, target=target)
        if not result.translated:
            return False
        for block, text in zip(mapped.blocks, result.texts, strict=False):
            block.text = text
        return True

    def _evidence(
        self,
        jurisdiction: Jurisdiction,
        passages: list[ScoredChunk],
        contradictions: tuple[tuple[str, str], ...],
        today: date,
        *,
        needs_more_facts: bool,
    ) -> confidence_service.RetrievalEvidence:
        return confidence_service.RetrievalEvidence(
            jurisdiction=jurisdiction,
            passages=tuple(
                confidence_service.RetrievedPassage(
                    citation_id=p.chunk.chunk_id,
                    document_id=p.chunk.document_id,
                    retrieval_score=round(p.retrieval_score, 4),
                    rerank_score=round(p.rerank_score or 0.0, 4),
                    within_effective_window=p.chunk.within_effective_window(today),
                )
                for p in passages
            ),
            contradictions=contradictions,
            out_of_scope=False,
            needs_more_facts=needs_more_facts,
        )

    def _refused(
        self,
        request,
        chosen,
        query_id,
        detection,
        understanding,
        refusal,
        clock,
        language_in,
        language_out,
    ) -> QueryOutcome:
        evidence = confidence_service.RetrievalEvidence(
            jurisdiction=chosen.jurisdiction, passages=(), out_of_scope=True
        )
        scored = confidence_service.score_confidence(evidence)
        return self._finish(
            request,
            chosen,
            query_id,
            detection,
            understanding,
            refusal,
            evidence,
            scored,
            None,
            (),
            clock,
            0,
            [],
            language_in,
            language_out,
            translated=False,
            # A refusal is still worth reasoning about. The reader is told which
            # issues their situation raises and who to take them to, even though
            # this product will not answer the question they asked.
            analysis=self._analyse(
                request, chosen, understanding, [], (), None, None, refusal=refusal
            ),
        )

    def _finish(
        self,
        request,
        chosen,
        query_id,
        detection,
        understanding,
        refusal,
        evidence,
        scored,
        answer,
        dropped,
        clock,
        documents_searched,
        passages,
        language_in,
        language_out,
        *,
        translated: bool,
        uncovered: str | None = None,
        analysis: Analysis | None = None,
        parts: tuple[Part, ...] = (),
        answered_parts: dict[str, str] | None = None,
    ) -> QueryOutcome:
        return QueryOutcome(
            query_id=query_id,
            session_id=request.session_id,
            question=request.question,
            jurisdiction=chosen.jurisdiction,
            route_inferred=chosen.inferred,
            route_marker=chosen.marker,
            uncovered_jurisdiction=uncovered,
            detection=detection,
            understanding=understanding,
            refusal=refusal,
            evidence=evidence,
            confidence=scored,
            answer=answer,
            analysis=analysis,
            parts=parts,
            answered_parts=dict(answered_parts or {}),
            related_records=self._related_records(request, chosen.jurisdiction),
            follow_ups=self._follow_ups(request, chosen, answer, understanding),
            stages=tuple(clock.stages),
            total_ms=clock.total_ms,
            documents_searched=documents_searched,
            corpus_version=self._namespaces.corpus_version(),
            # Demo-ness follows the passages the reader can see, not the kind of
            # store they came out of. A built index of illustrative documents
            # still puts illustrative sources on the screen.
            is_demo=self._namespaces.store(chosen.jurisdiction).is_demo
            or any(p.chunk.verification_status is VerificationStatus.DEMO for p in passages),
            translator=self._translator.name,
            translated=translated,
            passage_text={p.chunk.chunk_id: p.chunk.text for p in passages},
            sources=citation_service.build_citations(
                passages, as_of=datetime.now(UTC).date(), registry=self._registry
            ),
        )

    def _assemble(
        self,
        request,
        chosen,
        query_id,
        generated,
        mapped,
        scored,
        clock,
        *,
        language_out: str,
        as_of: date,
        is_demo: bool,
        analysis: Analysis | None = None,
    ) -> Answer:
        return Answer(
            answer_id=query_id + "-" + chosen.jurisdiction.value.lower(),
            query_id=query_id,
            jurisdiction=chosen.jurisdiction,
            language=language_out,
            # What the reader said they are wins; then what the rules decided
            # from their stated facts; the composer's reading of the passages is
            # the last resort, because it is the only one of the three that was
            # not decided by a rule.
            product_class=_first_known(
                request.product_class,
                analysis.product_class if analysis else ProductClass.UNDETERMINED,
                generated.product_class,
            ),
            ip_rights=list(generated.ip_rights),
            regulatory_areas=list(generated.regulatory_areas),
            blocks=list(mapped.blocks),
            citations=list(mapped.citations),
            # Records sit beside an answer, never inside it. Leaving this empty
            # is rule 7 held at the one place a record could sneak in.
            related_records=[],
            confidence=scored.level,
            abstained=False,
            abstain_reason=None,
            escalation_offered=True,
            as_of_date=as_of,
            corpus_version=self._namespaces.corpus_version(),
            latency_ms=clock.total_ms,
            is_demo=is_demo,
            analysis=analysis,
        )

    def _related_records(
        self, request: QueryRequest, jurisdiction: Jurisdiction
    ) -> tuple[Record, ...]:
        """Records the question is adjacent to. Never part of the answer.

        Attached beside an abstention exactly as beside an answer, because the
        rule that matters is that their presence changes nothing — it cannot
        raise confidence, which is not given records at all, and it cannot
        rescue a decline, which was already decided by the time this runs.

        The real store is asked first. Where nothing has been ingested, the demo
        fixture stands in, and only while the corpus itself is the demo fixture:
        a real corpus with no records loaded returns nothing, which is the
        truth rather than a fixture pretending to be a registry.
        """
        if self._records is not None:
            found = self._records.related_records(request.question, jurisdiction.value)
            if found:
                return found

        store = self._namespaces.store(jurisdiction)
        if not store.is_fixture or jurisdiction is not Jurisdiction.IN:
            return ()
        from app.services.demo_records import demo_records

        return demo_records(request.question, self._settings.fixtures_dir)

    @staticmethod
    def _follow_ups(request, chosen, answer, understanding) -> tuple[str, ...]:
        """What the answer left open, derived rather than listed.

        An unknown product class is the gap that matters most; a question that
        reached across a border is the next.
        """
        if answer is None:
            return ()
        keys: list[str] = []
        if answer.product_class is ProductClass.UNDETERMINED:
            keys.append("classify")
        if chosen.marker is not None or chosen.inferred:
            keys.append(
                "switchToExport" if chosen.jurisdiction is Jurisdiction.IN else "switchToIndia"
            )
        if RegulatoryArea.ABS_COMPLIANCE in answer.regulatory_areas:
            keys.append("abs")
        if IPRight.PATENT in answer.ip_rights:
            keys.append("priorArt")
        return tuple(keys[:3])

    def _record(
        self,
        outcome: QueryOutcome,
        *,
        refusal: Refusal | None = None,
        dropped: int = 0,
        neutralised: int = 0,
    ) -> None:
        # An audit row that cannot be written must not take the answer with it.
        # The failure is visible in the absence of the row.
        with suppress(OSError, ApiError):
            self._audit.record(
                AuditRow(
                    event="query",
                    session_id=outcome.session_id,
                    query_id=outcome.query_id,
                    question_hash=hash_question(outcome.question),
                    jurisdiction=outcome.jurisdiction.value,
                    language_in=outcome.detection.language,
                    language_out=outcome.answer.language if outcome.answer else None,
                    passage_ids=[p.citation_id for p in outcome.evidence.passages],
                    model=self._llm.name,
                    prompt_version=self._settings.prompt_version,
                    corpus_version=outcome.corpus_version,
                    translator=outcome.translator,
                    confidence=outcome.confidence.level.value,
                    abstained=outcome.answer is None,
                    abstain_reason=(
                        outcome.confidence.abstain_reason.value
                        if outcome.confidence.abstain_reason
                        else None
                    ),
                    refusal_kind=refusal.kind.value if refusal else None,
                    neutralised_spans=neutralised,
                    dropped_claims=dropped,
                    latency_ms=outcome.total_ms,
                )
            )


def citations_by_id(citations: list[Citation]) -> dict[str, Citation]:
    return {citation.citation_id: citation for citation in citations}
