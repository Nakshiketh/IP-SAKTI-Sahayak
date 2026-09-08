"""The generator, behind an interface.

An `LLMClient` is given a question and a set of packed passages and returns a
structured answer: four blocks, each a list of claims, each claim naming the
passage ids that support it. It never returns prose for something else to parse.
Parsing prose is where a citation goes missing quietly, and a citation that goes
missing quietly is the failure this whole product is built to prevent.

Two implementations, and the choice between them is not a performance tradeoff:

* `FixtureLLMClient` writes only over demo passages. Hand it a real retrieved
  passage and it refuses, because a checked-in answer sitting on top of a real
  document would be indistinguishable from retrieval that worked.
* `AnthropicLLMClient` calls a hosted model with a schema-constrained response.

A refusal to generate is an error, not an abstention. Abstaining means the
evidence was too thin; erroring means nothing was configured that is allowed to
write. Conflating them would blame the corpus for a deployment gap.
"""

from app.llm.types import (
    GeneratedBlock,
    GeneratedClaim,
    GenerationRequest,
    GenerationResult,
    LLMClient,
)

__all__ = [
    "GeneratedBlock",
    "GeneratedClaim",
    "GenerationRequest",
    "GenerationResult",
    "LLMClient",
]
