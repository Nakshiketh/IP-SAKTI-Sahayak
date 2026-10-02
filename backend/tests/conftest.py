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
# The test client speaks plain http, which drops Secure cookies. A deployed
# `backend/.env` sets COOKIE_SECURE=true, so pin it off for the suite.
os.environ["COOKIE_SECURE"] = "false"
os.environ.setdefault(
    "SAHAYAK_MEMBERS_DB_OVERRIDE",
    os.path.join(_tempfile.mkdtemp(prefix="sahayak-members-"), "accounts.sqlite3"),
)
os.environ.pop("DEMO_MEMBER_TEMP_PASSWORD", None)
os.environ.pop("DEMO_MEMBER_PASSWORD", None)
os.environ.pop("RENDER", None)
os.environ.pop("DATABASE_URL", None)

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
    # Send limits are counted from the codes table, so each test starts with
    # none: otherwise the suite's own earlier sends would count against it.
    # This is the throwaway members database set above, never the real one.
    from app.auth.store import connect

    with connect() as connection:
        connection.execute("DELETE FROM otp_codes")
        connection.execute("DELETE FROM reset_tokens")
        connection.execute("DELETE FROM auth_challenges")
        connection.commit()
    if request.node.get_closest_marker("real_auth"):
        yield
        return
    app.dependency_overrides[require_member] = lambda: TEST_MEMBER
    yield
    app.dependency_overrides.pop(require_member, None)


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, str]]:
    """Capture email instead of sending it. Exists only inside a test run.

    Swaps `app.auth.email.send_email` with pytest's monkeypatch; the application
    has no switch that could do the same, so there is no way to reach this in
    development or production.
    """
    from app.auth import email

    sent: list[dict[str, str]] = []

    def capture(*, to: str, subject: str, html: str, text: str) -> email.Sent:
        sent.append({"to": to, "subject": subject, "html": html, "text": text})
        return email.Sent(code=250, reply="OK queued (test)")

    monkeypatch.setattr(email, "send_email", capture)
    return sent


def code_from(message: dict[str, str]) -> str:
    """The six-digit code in a captured verification email."""
    import re

    return re.search(r"^\s+(\d{6})$", message["text"], re.M).group(1)
