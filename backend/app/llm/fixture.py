"""The offline generator. Writes only over demo passages.

This is what makes an unconfigured install demoable without making it dishonest.
It holds one checked-in answer per jurisdiction and refuses to run unless every
passage it was given is marked demo — hand it a real retrieved passage and it
raises, because a checked-in answer sitting on top of a real document would be
indistinguishable, to a reader, from retrieval that worked.

It is not a stub in the "returns a constant" sense. The claims it returns are
filtered against what retrieval actually produced: a claim whose supporting
passage did not come back is dropped, a block left with no claims is dropped,
and an answer with no answer block left is an abstention. So the fixture answer
genuinely varies with retrieval, and the parts of the pipeline downstream of it —
citation mapping, confidence, the abstention surface — are exercised for real.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.core.errors import GenerationUnavailable
from app.llm.types import GeneratedBlock, GeneratedClaim, GenerationRequest, GenerationResult
from app.models.domain import AnswerBlockKind, IPRight, ProductClass, RegulatoryArea


@lru_cache(maxsize=4)
def _load(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


class FixtureLLMClient:
    name = "fixture"

    def __init__(self, fixtures_dir: Path) -> None:
        self._path = fixtures_dir / "demo-answers.json"

    @property
    def available(self) -> bool:
        return self._path.exists()

    def generate(self, request: GenerationRequest) -> GenerationResult:
        if not request.all_passages_are_demo:
            raise GenerationUnavailable(
                "No model is configured, and the retrieved passages are not demo passages. "
                "Set SAHAYAK_LLM_PROVIDER and SAHAYAK_LLM_API_KEY to answer from a real corpus."
            )
        if not self.available:
            raise GenerationUnavailable("The demo answer fixture is missing.")

        raw = _load(str(self._path))
        source = raw["answers"].get(request.jurisdiction.value)
        if source is None:
            raise GenerationUnavailable(
                "No demo answer exists for " + request.jurisdiction.value + "."
            )

        supplied = set(request.context.chunk_ids)
        blocks: list[GeneratedBlock] = []
        for block in source["blocks"]:
            claims: list[GeneratedClaim] = []
            for claim in block["claims"]:
                wanted = list(claim["passage_ids"])
                kept = [passage_id for passage_id in wanted if passage_id in supplied]
                # A claim that was written to rest on a passage, whose passage
                # did not come back, is dropped. A claim that never rested on
                # one — framing rather than assertion — is kept as it is.
                if wanted and not kept:
                    continue
                claims.append(GeneratedClaim(text=claim["text"], passage_ids=kept))
            if claims:
                blocks.append(GeneratedBlock(kind=AnswerBlockKind(block["kind"]), claims=claims))

        has_answer = any(block.kind is AnswerBlockKind.ANSWER for block in blocks)
        supported = any(claim.passage_ids for block in blocks for claim in block.claims)
        if not has_answer or not supported:
            return GenerationResult(abstained=True)

        return GenerationResult(
            abstained=False,
            product_class=ProductClass(source["product_class"]),
            ip_rights=[IPRight(value) for value in source["ip_rights"]],
            regulatory_areas=[RegulatoryArea(value) for value in source["regulatory_areas"]],
            blocks=blocks,
        )
