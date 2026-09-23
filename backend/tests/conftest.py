"""Test-wide setup.

Two things, both about keeping a test run from leaving anything behind.

The audit log is switched off before any settings are read. Running the suite
should not append hundreds of rows to the repository's own `data/audit.sqlite3`
— a test that wants to assert on auditing builds its own log against `tmp_path`,
which `test_stages.py` does.

The environment is set here rather than in a fixture because `get_settings` is
cached on first call, and the first call happens while a test module is being
imported.
"""

from __future__ import annotations

import os

os.environ.setdefault("SAHAYAK_AUDIT_ENABLED", "false")

# The pipeline's own tests run over the demo fixture, whose answers and
# passages they assert on. The verified guidance corpus the site serves is
# tested on its own in `test_knowledge_base.py`, which builds its pipeline
# against the real file.
os.environ.setdefault(
    "SAHAYAK_KNOWLEDGE_BASE_OVERRIDE", os.path.join(os.path.dirname(__file__), "no-knowledge-base")
)
