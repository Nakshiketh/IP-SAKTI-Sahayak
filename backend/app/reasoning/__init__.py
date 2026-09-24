"""Reasoning over what retrieval found: facts, category, issues, conflicts.

Sits between retrieval and composition. It changes no answer text — the prose
stays exactly what the cited passages say — and adds the reasoning beside it:
which issues the situation raises, what the rules could not settle, how sure the
product is about each issue separately, and who the reader should ask.

Everything here is decided by rules in `data/rules/*.yaml` or by metadata the
registry and the corpus carry. Nothing is decided by reading the wording of a
passage and forming a view about it.
"""

from app.reasoning.engine import abstain_code_for, analyse

__all__ = ["analyse", "abstain_code_for"]
