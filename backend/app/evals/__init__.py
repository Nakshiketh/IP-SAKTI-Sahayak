"""The evaluation harness.

Runs the gold set through the real pipeline and scores what comes back. The
machinery lives here rather than in `/evals` so it can be tested; `evals/score.py`
is a thin CLI over it.

Two rules run through the whole thing.

**A metric that cannot be computed says so, with the reason.** Two of the
metrics the build document asks for need something this repository does not have:
`answer_accuracy` needs reference answers, and nobody has written any because
writing 170 model statements of Indian and international law from memory is
exactly the fabrication this product exists to prevent. `multilingual_quality`
needs a native speaker. Both are reported as not measured, naming what is
missing. A number invented to fill a row is worse than an empty row, because a
number gets quoted.

**The report says what the numbers are about.** Today they are measured against
a demonstration corpus of a handful of illustrative documents, so most questions
abstain for want of anything to answer from. That measures the machinery, not
the product's coverage, and the report leads with it — otherwise "abstention
precision 31%" reads as a fault in the abstention rule rather than as the honest
consequence of an empty corpus.
"""

from app.evals.cases import GoldCase, load_gold
from app.evals.report import render_markdown, render_summary
from app.evals.runner import CaseResult, run_gold
from app.evals.score import MetricResult, Scores, score_results

__all__ = [
    "CaseResult",
    "GoldCase",
    "MetricResult",
    "Scores",
    "load_gold",
    "render_markdown",
    "render_summary",
    "run_gold",
    "score_results",
]
