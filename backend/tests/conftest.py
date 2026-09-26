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

# -- member authentication ---------------------------------------------------
# Throwaway secrets, so `create_app` starts, and a members database in a temp
# directory, so no test ever writes to the repository's `data/accounts.sqlite3`.
import secrets as _secrets  # noqa: E402
import tempfile as _tempfile  # noqa: E402

os.environ.setdefault("SESSION_SECRET", _secrets.token_hex(32))
os.environ.setdefault("OTP_SECRET", _secrets.token_hex(32))
os.environ.setdefault(
    "SAHAYAK_MEMBERS_DB_OVERRIDE",
    os.path.join(_tempfile.mkdtemp(prefix="sahayak-members-"), "accounts.sqlite3"),
)
os.environ.pop("DEMO_MEMBER_TEMP_PASSWORD", None)

import pytest  # noqa: E402

from app.auth.deps import CurrentMember, require_member  # noqa: E402

#: Who a feature test is signed in as. Tests about signing in are marked
#: `real_auth` and go through the real session check instead.
TEST_MEMBER = CurrentMember(
    pk=0,
    member_id="IPS-TEST-0000",
    username="test-member",
    name="Test Member",
    role="Tester",
    institution="Test",
    restricted=False,
)


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "real_auth: run against the real session check")


@pytest.fixture(autouse=True)
def _signed_in_member(request: pytest.FixtureRequest):
    """Sign feature tests in, with FastAPI's own dependency override."""
    from app.auth import limits
    from app.main import app

    limits.reset_all()
    if request.node.get_closest_marker("real_auth"):
        yield
        return
    app.dependency_overrides[require_member] = lambda: TEST_MEMBER
    yield
    app.dependency_overrides.pop(require_member, None)
