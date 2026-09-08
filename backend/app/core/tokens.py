"""Estimating token counts, in one place.

Two parts of the system need a token count and they must not disagree: the
context builder spends a budget in tokens, and the segmenter targets a chunk
size in tokens. A chunk sized by one estimator and budgeted by another is a
chunk that overflows the window it was sized to fit.

It is an estimate and is documented as one. Counting by whitespace words rather
than by any model's tokeniser is deliberate: the budget is a guard against
overflow, and a guard that needed the exact tokeniser of whichever model happens
to be configured would be a guard that breaks when the model changes.

The ratio is the conservative end of the range. English prose runs a little
under one token per word; Indic scripts run well over, because their tokenisers
split on marks this corpus is full of. Overestimating costs a little unused
budget; underestimating costs a truncated request.
"""

from __future__ import annotations

TOKENS_PER_WORD = 1.4


def estimate_tokens(text: str) -> int:
    return int(len(text.split()) * TOKENS_PER_WORD) + 1
