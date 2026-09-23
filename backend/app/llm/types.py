"""What a generator is asked for, and what it must return.

The response models are Pydantic rather than dataclasses because they are the
schema handed to the model as a structured-output format. One definition, used
both to constrain the model and to validate what came back.
"""

from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from app.models.domain import (
    AnswerBlockKind,
    IPRight,
    Jurisdiction,
    ProductClass,
    RegulatoryArea,
)
from app.services.context import Context


class GeneratedClaim(BaseModel):
    """One sentence, and the passages it rests on.

    An empty ``passage_ids`` is allowed and is not a failure: some sentences in
    an answer are framing rather than assertion ("work this out first"). The
    interface renders those as general explanation and marks them, which is why
    the model is told to leave the list empty rather than to attach the nearest
    passage.
    """

    model_config = ConfigDict(extra="forbid")

    text: str
    passage_ids: list[str] = Field(default_factory=list)


class GeneratedBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: AnswerBlockKind
    claims: list[GeneratedClaim] = Field(default_factory=list)


class GenerationResult(BaseModel):
    """The model's structured answer, before citations are verified.

    Nothing here is trusted yet. Every passage id is checked against what was
    actually packed, and claims naming an id that was not shown are dropped —
    see `app.services.citations`. This model is the shape of a proposal.
    """

    model_config = ConfigDict(extra="forbid")

    #: The model's own report that the passages do not support an answer. It is
    #: one input to the abstention decision, never the whole of it: the
    #: confidence rule can abstain over a model that was willing to answer.
    abstained: bool = False
    product_class: ProductClass = ProductClass.UNDETERMINED
    ip_rights: list[IPRight] = Field(default_factory=list)
    regulatory_areas: list[RegulatoryArea] = Field(default_factory=list)
    blocks: list[GeneratedBlock] = Field(default_factory=list)


class GenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True)

    question: str
    jurisdiction: Jurisdiction
    #: What the answer should be written in. Translation is a later stage; a
    #: model that can write the language directly saves a round trip.
    language: str = "en"
    product_class: ProductClass = ProductClass.UNDETERMINED
    context: Context
    #: True when every packed passage is demo. Decides which client may run.
    all_passages_are_demo: bool = False
    #: Set when the context is one whole procedure, in step order, so the
    #: answer can be written as numbered steps.
    procedure_id: str | None = None
    #: When set, the first this-many passages answer the question and the rest
    #: are related material.
    lead_passages: int | None = None


class LLMClient(Protocol):
    name: str

    @property
    def available(self) -> bool: ...

    def generate(self, request: GenerationRequest) -> GenerationResult: ...
