"""The offline generator for the verified guidance corpus.

With no model configured, an answer is composed from the passages themselves:
every sentence in it is the text of a verified passage that retrieval packed,
cited to that passage. Nothing is paraphrased, summarised or invented at query
time, so the answer can say no more than its sources do — which is the property
a model is instructed to have and this generator has by construction.

What it adds is order. A procedural question whose context holds a procedure is
answered as numbered steps in the order they happen, each step titled and each
passage within it cited; related passages follow as things to check. Any other
question is answered from the best passages first.

Demo passages are handed to the fixture generator, unchanged, so an install
still on the demo fixture behaves exactly as before.
"""

from __future__ import annotations

from pathlib import Path

from app.llm.fixture import FixtureLLMClient
from app.llm.types import GeneratedBlock, GeneratedClaim, GenerationRequest, GenerationResult
from app.models.domain import AnswerBlockKind, IPRight, RegulatoryArea
from app.retrieval.store import KnowledgeBase, load_knowledge_base

#: Passages in a non-procedural answer block, and in the block after it.
ANSWER_PASSAGES = 3
FOLLOW_ON_PASSAGES = 2
#: Passages of other topics shown under a procedure.
BESIDE_PROCEDURE = 2
#: A procedure is rendered as steps only when at least this many of its
#: passages were packed; fewer is a passing match, not the procedure.
MIN_PROCEDURE_PASSAGES = 3


class GroundedComposerClient:
    name = "grounded-composer"

    def __init__(self, knowledge_path: Path, fixtures_dir: Path) -> None:
        self._path = knowledge_path
        self._fixture = FixtureLLMClient(fixtures_dir)

    @property
    def available(self) -> bool:
        return self._path.exists() or self._fixture.available

    def generate(self, request: GenerationRequest) -> GenerationResult:
        if request.all_passages_are_demo:
            return self._fixture.generate(request)
        if not self._path.exists():
            return GenerationResult(abstained=True)

        knowledge = load_knowledge_base(str(self._path))
        packed = [cid for cid in request.context.chunk_ids if cid in knowledge.meta]
        if not packed:
            return GenerationResult(abstained=True)

        blocks = (
            self._procedure_blocks(knowledge, packed, request.procedure_id)
            if request.procedure_id
            else []
        ) or self._topic_blocks(packed, knowledge, request.lead_passages)
        if not blocks:
            return GenerationResult(abstained=True)

        rights, areas = self._tags(knowledge, packed)
        return GenerationResult(
            abstained=False, ip_rights=rights, regulatory_areas=areas, blocks=blocks
        )

    # -- composition -------------------------------------------------------

    @staticmethod
    def _text(knowledge: KnowledgeBase, chunk_id: str) -> str:
        for _document, row in knowledge.chunks:
            if row["chunk_id"] == chunk_id:
                return row["text"]
        return ""

    def _procedure_blocks(
        self, knowledge: KnowledgeBase, packed: list[str], procedure_id: str
    ) -> list[GeneratedBlock]:
        count = sum(1 for cid in packed if knowledge.meta[cid].procedure == procedure_id)
        if count < MIN_PROCEDURE_PASSAGES:
            return []

        in_procedure = [cid for cid in packed if knowledge.meta[cid].procedure == procedure_id]
        in_procedure.sort(key=lambda cid: (knowledge.meta[cid].step or 0, packed.index(cid)))

        claims: list[GeneratedClaim] = []
        seen_steps: dict[int, int] = {}
        for chunk_id in in_procedure:
            meta = knowledge.meta[chunk_id]
            step = meta.step or 0
            text = self._text(knowledge, chunk_id)
            if step not in seen_steps:
                seen_steps[step] = len(seen_steps) + 1
                number = seen_steps[step]
                prefix = (
                    f"Step {number} — {meta.step_title}." if meta.step_title else f"Step {number}."
                )
                text = prefix + " " + text
            claims.append(GeneratedClaim(text=text, passage_ids=[chunk_id]))

        blocks = [GeneratedBlock(kind=AnswerBlockKind.ANSWER, claims=claims)]
        beside = [cid for cid in packed if knowledge.meta[cid].procedure != procedure_id]
        if beside:
            blocks.append(
                GeneratedBlock(
                    kind=AnswerBlockKind.WHAT_TO_CHECK,
                    claims=[
                        GeneratedClaim(text=self._text(knowledge, cid), passage_ids=[cid])
                        for cid in beside[:BESIDE_PROCEDURE]
                    ],
                )
            )
        caveat = knowledge.procedures.get(procedure_id)
        if caveat is not None and caveat.caveat:
            blocks.append(
                GeneratedBlock(
                    kind=AnswerBlockKind.CAVEAT,
                    claims=[GeneratedClaim(text=caveat.caveat, passage_ids=[])],
                )
            )
        return blocks

    def _topic_blocks(
        self, packed: list[str], knowledge: KnowledgeBase, lead: int | None
    ) -> list[GeneratedBlock]:
        if lead:
            first, rest = packed[:lead], packed[lead : lead + FOLLOW_ON_PASSAGES]
        else:
            # The best passage sets the topic. A passage from a different
            # procedure (a trade mark step under a patent question) is related
            # material at most, never part of the answer.
            topic = knowledge.meta[packed[0]].procedure
            on_topic = [cid for cid in packed if knowledge.meta[cid].procedure in (None, topic)]
            off_topic = [cid for cid in packed if cid not in on_topic]
            first = on_topic[:ANSWER_PASSAGES]
            rest = (on_topic[ANSWER_PASSAGES:] + off_topic)[:FOLLOW_ON_PASSAGES]
        blocks = [
            GeneratedBlock(
                kind=AnswerBlockKind.ANSWER,
                claims=[
                    GeneratedClaim(text=self._text(knowledge, cid), passage_ids=[cid])
                    for cid in first
                ],
            )
        ]
        if rest:
            blocks.append(
                GeneratedBlock(
                    kind=AnswerBlockKind.WHAT_TO_CHECK,
                    claims=[
                        GeneratedClaim(text=self._text(knowledge, cid), passage_ids=[cid])
                        for cid in rest
                    ],
                )
            )
        return blocks

    @staticmethod
    def _tags(
        knowledge: KnowledgeBase, packed: list[str]
    ) -> tuple[list[IPRight], list[RegulatoryArea]]:
        rights: dict[IPRight, None] = {}
        areas: dict[RegulatoryArea, None] = {}
        wanted = set(packed)
        for _document, row in knowledge.chunks:
            if row["chunk_id"] not in wanted:
                continue
            rights.update((IPRight(value), None) for value in row.get("ip_rights", ()))
            areas.update((RegulatoryArea(value), None) for value in row.get("regulatory_areas", ()))
        return list(rights), list(areas)
