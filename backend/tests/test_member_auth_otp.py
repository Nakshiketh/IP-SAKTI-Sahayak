"""Phase 3 of member authentication: the email service, the template, the code engine.

No test sends real email. `outbox` swaps `app.auth.email.send_email` for a list
with pytest's monkeypatch, which exists only inside a test run; there is no
switch in the application that could do the same.
"""

from __future__ import annotations

import re
import smtplib
import sqlite3
import time
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.auth import cli, email, otp
from app.auth.hashing import otp_hash
from app.auth.store import connect
from app.auth.templates import SUBJECT, ist, otp_email
from app.core.settings import get_settings

EMAIL = "member@example.org"


@pytest.fixture
def db(tmp_path: Path) -> sqlite3.Connection:
    connection = connect(tmp_path / "accounts.sqlite3")
    now = time.time()
    connection.execute(
        "INSERT INTO members (member_id, name, username, email, role, institution,"
        " password_hash, created_at, updated_at) VALUES"
        " ('IPS-T-1', 'One', 'one', ?, 'R', 'I', 'x', ?, ?),"
        " ('IPS-T-2', 'Two', 'two', 'two@example.org', 'R', 'I', 'x', ?, ?)",
        (EMAIL, now, now, now, now),
    )
    connection.commit()
    yield connection
    connection.close()


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, str]]:
    sent: list[dict[str, str]] = []

    def capture(*, to: str, subject: str, html: str, text: str) -> email.Sent:
        sent.append({"to": to, "subject": subject, "html": html, "text": text})
        return email.Sent(code=250, reply="OK queued")

    monkeypatch.setattr(email, "send_email", capture)
    return sent


def code_in(message: dict[str, str]) -> str:
    return re.search(r"^\s+(\d{6})$", message["text"], re.M).group(1)


def challenge(db: sqlite3.Connection, member: int | None = 1, purpose="login", now=None) -> str:
    return otp.create_challenge(db, member, purpose, now=now)


# -- the code itself -----------------------------------------------------------


class TestCode:
    def test_six_digits_zero_padded(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(otp.secrets, "randbelow", lambda n: 42)
        assert otp.generate_code() == "000042"

    def test_drawn_uniformly_from_a_million(self, monkeypatch: pytest.MonkeyPatch) -> None:
        asked: list[int] = []
        monkeypatch.setattr(otp.secrets, "randbelow", lambda n: asked.append(n) or 0)
        otp.generate_code()
        assert asked == [1_000_000]

    def test_challenge_ids_are_long_and_random(self, db: sqlite3.Connection) -> None:
        ids = {challenge(db) for _ in range(20)}
        assert len(ids) == 20
        assert all(len(value) >= 32 for value in ids)  # 24 bytes, base64url


# -- issuing -------------------------------------------------------------------


class TestIssue:
    def test_emails_the_member_and_stores_only_a_keyed_hash(self, db, outbox) -> None:
        cid = challenge(db)
        otp.issue_code(db, cid, ip="1.2.3.4")
        (message,) = outbox
        assert message["to"] == EMAIL
        code = code_in(message)
        (row,) = db.execute("SELECT * FROM otp_codes").fetchall()
        assert code not in repr(dict(row))
        assert row["code_hash"] == otp_hash(get_settings().otp_secret, cid, code)
        assert row["expires_at"] - row["created_at"] == 300
        assert row["max_attempts"] == 5

    def test_a_new_code_invalidates_the_previous_one(self, db, outbox) -> None:
        cid = challenge(db)
        start = time.time()
        otp.issue_code(db, cid, ip="1.2.3.4", now=start)
        first = code_in(outbox[0])
        otp.issue_code(db, cid, ip="1.2.3.4", now=start + 61)
        with pytest.raises(otp.OtpIncorrect):
            otp.verify_code(db, cid, first, purpose="login", now=start + 62)

    def test_sixty_seconds_between_sends(self, db, outbox) -> None:
        cid = challenge(db)
        start = time.time()
        otp.issue_code(db, cid, ip="1.2.3.4", now=start)
        with pytest.raises(otp.OtpCooldown) as raised:
            otp.issue_code(db, cid, ip="1.2.3.4", now=start + 30)
        assert 29 <= raised.value.details["retry_after"] <= 31

    def test_five_sends_an_hour_per_member(self, db, outbox) -> None:
        start = time.time()
        for index in range(5):
            otp.issue_code(db, challenge(db, now=start), ip=f"10.0.0.{index}", now=start + index)
        with pytest.raises(otp.OtpSendLimit):
            otp.issue_code(db, challenge(db, now=start), ip="10.0.0.9", now=start + 10)
        # Another member is unaffected.
        otp.issue_code(db, challenge(db, member=2, now=start), ip="10.0.0.9", now=start + 11)

    def test_twenty_sends_an_hour_per_address(self, db, outbox) -> None:
        start = time.time()
        for index in range(20):
            cid = challenge(db, member=None, purpose="password_reset", now=start)
            otp.issue_code(db, cid, ip="9.9.9.9", now=start + index)
        with pytest.raises(otp.OtpSendLimit):
            otp.issue_code(db, challenge(db, member=2, now=start), ip="9.9.9.9", now=start + 30)

    def test_an_expired_challenge_cannot_be_sent_to(self, db, outbox) -> None:
        start = time.time()
        cid = challenge(db, now=start)
        with pytest.raises(otp.ChallengeExpired):
            otp.issue_code(db, cid, ip=None, now=start + 601)

    def test_a_failed_send_invalidates_the_code_and_says_so(
        self, db, monkeypatch, capsys, caplog
    ) -> None:
        seen: list[str] = []

        def refuse(**message: str) -> email.Sent:
            seen.append(message["text"])
            raise email.EmailFailed("SMTPAuthenticationError (SMTP 535)")

        monkeypatch.setattr(email, "send_email", refuse)
        cid = challenge(db)
        with pytest.raises(otp.OtpSendFailed):
            otp.issue_code(db, cid, ip="1.2.3.4")
        (row,) = db.execute("SELECT * FROM otp_codes").fetchall()
        assert row["invalidated_at"] is not None
        # No fallback: the code went nowhere but the refused message.
        code = code_in({"text": seen[0]})
        out = capsys.readouterr()
        assert code not in out.out + out.err + caplog.text
        with pytest.raises(otp.OtpExpired):
            otp.verify_code(db, cid, code, purpose="login")

    def test_unconfigured_email_is_a_failed_send_too(self, db, monkeypatch) -> None:
        settings = get_settings()
        monkeypatch.setattr(settings, "email_user", "")
        with pytest.raises(otp.OtpSendFailed):
            otp.issue_code(db, challenge(db), ip=None)

    def test_a_decoy_challenge_sends_nothing(self, db, outbox) -> None:
        cid = challenge(db, member=None, purpose="password_reset")
        otp.issue_code(db, cid, ip="1.2.3.4")
        assert outbox == []
        assert db.execute("SELECT count(*) FROM otp_codes").fetchone()[0] == 1

    def test_sends_are_logged_without_the_code(self, db, outbox) -> None:
        otp.issue_code(db, challenge(db), ip="1.2.3.4")
        events = [dict(row) for row in db.execute("SELECT * FROM auth_events")]
        assert [event["event"] for event in events] == ["otp_sent"]
        assert code_in(outbox[0]) not in repr(events)


# -- checking ------------------------------------------------------------------


class TestVerify:
    def test_the_right_code_once(self, db, outbox) -> None:
        cid = challenge(db)
        otp.issue_code(db, cid, ip=None)
        code = code_in(outbox[0])
        assert otp.verify_code(db, cid, code, purpose="login") == 1
        with pytest.raises(otp.ChallengeExpired):
            otp.verify_code(db, cid, code, purpose="login")

    def test_wrong_codes_count_down_then_lock(self, db, outbox) -> None:
        cid = challenge(db)
        otp.issue_code(db, cid, ip=None)
        code = code_in(outbox[0])
        wrong = f"{(int(code) + 1) % 1_000_000:06d}"
        for remaining in (4, 3, 2, 1):
            with pytest.raises(otp.OtpIncorrect) as raised:
                otp.verify_code(db, cid, wrong, purpose="login")
            assert raised.value.details["attempts_remaining"] == remaining
        with pytest.raises(otp.OtpLocked):
            otp.verify_code(db, cid, wrong, purpose="login")
        # Locked means locked: the right code no longer works either.
        with pytest.raises(otp.OtpLocked):
            otp.verify_code(db, cid, code, purpose="login")

    def test_an_expired_code(self, db, outbox) -> None:
        start = time.time()
        cid = challenge(db, now=start)
        otp.issue_code(db, cid, ip=None, now=start)
        with pytest.raises(otp.OtpExpired):
            otp.verify_code(db, cid, code_in(outbox[0]), purpose="login", now=start + 301)

    def test_an_expired_challenge(self, db, outbox) -> None:
        start = time.time()
        cid = challenge(db, now=start)
        otp.issue_code(db, cid, ip=None, now=start)
        with pytest.raises(otp.ChallengeExpired):
            otp.verify_code(db, cid, code_in(outbox[0]), purpose="login", now=start + 601)

    def test_a_login_code_never_resets_a_password(self, db, outbox) -> None:
        cid = challenge(db, purpose="login")
        otp.issue_code(db, cid, ip=None)
        with pytest.raises(otp.ChallengeExpired):
            otp.verify_code(db, cid, code_in(outbox[0]), purpose="password_reset")

    def test_a_code_is_bound_to_its_own_challenge(self, db, outbox) -> None:
        mine, theirs = challenge(db), challenge(db, member=2)
        otp.issue_code(db, mine, ip=None)
        otp.issue_code(db, theirs, ip=None)
        with pytest.raises(otp.OtpIncorrect):
            otp.verify_code(db, theirs, code_in(outbox[0]), purpose="login")

    def test_a_decoy_never_verifies(self, db, outbox, monkeypatch) -> None:
        monkeypatch.setattr(otp.secrets, "randbelow", lambda n: 111111)
        cid = challenge(db, member=None, purpose="password_reset")
        otp.issue_code(db, cid, ip=None)
        with pytest.raises(otp.OtpIncorrect):
            otp.verify_code(db, cid, "111111", purpose="password_reset")

    @pytest.mark.parametrize("junk", ["", "12345", "1234567", "abcdef", " 12 34 "])
    def test_malformed_codes_are_simply_wrong(self, db, outbox, junk: str) -> None:
        cid = challenge(db)
        otp.issue_code(db, cid, ip=None)
        with pytest.raises(otp.OtpIncorrect):
            otp.verify_code(db, cid, junk, purpose="login")

    def test_an_unknown_challenge(self, db) -> None:
        with pytest.raises(otp.ChallengeExpired):
            otp.verify_code(db, "no-such-challenge", "000000", purpose="login")


# -- the template ----------------------------------------------------------------


class TestTemplate:
    MOMENT = datetime(2026, 9, 26, 10, 35, tzinfo=UTC)

    def test_the_code_is_not_in_the_subject(self) -> None:
        rendered = otp_email("402817", "login", self.MOMENT)
        assert rendered.subject == SUBJECT == "Your IP-SAKTI Sahayak verification code"
        assert "402817" not in rendered.subject

    @pytest.mark.parametrize("part", ["html", "text"])
    def test_both_parts_say_everything(self, part: str) -> None:
        body = getattr(otp_email("402817", "login", self.MOMENT), part)
        for line in (
            "IP-SAKTI Sahayak",
            "Member verification code",
            "You asked to log in",
            "Your verification code is:",
            "This code expires in 5 minutes.",
            "26 September 2026, 4:05 pm IST",
            "If you did not request this verification, please ignore this email.",
        ):
            assert line in body, line
        assert "402817" in body.replace(" ", "")

    def test_the_reset_purpose(self) -> None:
        rendered = otp_email("000001", "password_reset", self.MOMENT)
        assert "You asked to reset your password" in rendered.text

    def test_nothing_remote_and_no_tracking(self) -> None:
        html = otp_email("402817", "login", self.MOMENT).html
        assert "<img" not in html.lower()
        assert "http://" not in html and "https://" not in html
        assert "<script" not in html.lower()
        assert "max-width:600px" in html
        assert "<table" in html and "style=" in html
        assert "#1D4B36" in html

    def test_a_test_message_says_so(self) -> None:
        rendered = otp_email("123456", "login", self.MOMENT, test=True)
        assert rendered.subject.startswith("[Test]")
        assert "not valid for signing in" in rendered.text
        assert "not valid for signing in" in rendered.html

    def test_ist_has_no_daylight_saving(self) -> None:
        assert ist(datetime(2026, 1, 1, 0, 0, tzinfo=UTC)) == "1 January 2026, 5:30 am IST"
        assert ist(datetime(2026, 7, 1, 18, 30, tzinfo=UTC)) == "2 July 2026, 12:00 am IST"

    def test_refuses_something_that_is_not_a_code(self) -> None:
        with pytest.raises(ValueError):
            otp_email("12ab56", "login", self.MOMENT)


# -- the transport ---------------------------------------------------------------


class FakeSMTP:
    instances: list[FakeSMTP] = []

    def __init__(self, host, port, timeout=None, context=None) -> None:
        self.host, self.port, self.context = host, port, context
        self.calls: list[str] = []
        FakeSMTP.instances.append(self)

    def ehlo(self):
        self.calls.append("ehlo")

    def ehlo_or_helo_if_needed(self):
        self.calls.append("ehlo?")

    def starttls(self, context=None):
        self.calls.append("starttls")

    def login(self, user, password):
        self.calls.append("login")

    def mail(self, sender):
        return 250, b"ok"

    def rcpt(self, to):
        return 250, b"ok"

    def data(self, body):
        self.body = body
        return 250, b"2.0.0 OK queued as ABC123"

    def quit(self):
        self.calls.append("quit")


class FakeSMTPSSL(FakeSMTP):
    pass


@pytest.fixture
def smtp(monkeypatch: pytest.MonkeyPatch):
    FakeSMTP.instances.clear()
    settings = get_settings()
    monkeypatch.setattr(settings, "email_host", "smtp.example.org")
    monkeypatch.setattr(settings, "email_user", "sender@example.org")
    monkeypatch.setattr(settings, "email_password", "app-password-never-shown")
    monkeypatch.setattr(settings, "email_from", "")
    monkeypatch.setattr(email.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(email.smtplib, "SMTP_SSL", FakeSMTPSSL)
    return settings


class TestTransport:
    def test_port_465_is_implicit_tls(self, smtp, monkeypatch) -> None:
        monkeypatch.setattr(smtp, "email_port", 465)
        monkeypatch.setattr(smtp, "email_secure", True)
        sent = email.send_email(to=EMAIL, subject="s", html="<p>h</p>", text="t")
        (server,) = FakeSMTP.instances
        assert isinstance(server, FakeSMTPSSL) and server.context is not None
        assert "starttls" not in server.calls
        assert sent.code == 250 and "queued" in sent.reply

    def test_port_587_upgrades_with_starttls(self, smtp, monkeypatch) -> None:
        monkeypatch.setattr(smtp, "email_port", 587)
        monkeypatch.setattr(smtp, "email_secure", False)
        email.send_email(to=EMAIL, subject="s", html="<p>h</p>", text="t")
        (server,) = FakeSMTP.instances
        assert not isinstance(server, FakeSMTPSSL)
        assert server.calls.index("starttls") < server.calls.index("login")

    def test_the_message_has_both_parts(self, smtp) -> None:
        email.send_email(to=EMAIL, subject="Subject here", html="<p>html</p>", text="plain")
        body = FakeSMTP.instances[0].body.decode()
        assert "text/plain" in body and "text/html" in body
        assert "Subject: Subject here" in body
        assert "app-password-never-shown" not in body

    def test_a_refusal_is_described_without_credentials(self, smtp, monkeypatch) -> None:
        def refuse(self, user, password):
            raise smtplib.SMTPAuthenticationError(535, b"bad credentials for " + password.encode())

        monkeypatch.setattr(FakeSMTPSSL, "login", refuse)
        with pytest.raises(email.EmailFailed) as raised:
            email.send_email(to=EMAIL, subject="s", html="h", text="t")
        assert "app-password-never-shown" not in str(raised.value)
        assert "SMTPAuthenticationError" in str(raised.value) and "535" in str(raised.value)

    def test_unconfigured(self, smtp, monkeypatch) -> None:
        monkeypatch.setattr(smtp, "email_password", "")
        with pytest.raises(email.EmailNotConfigured):
            email.send_email(to=EMAIL, subject="s", html="h", text="t")

    def test_startup_check_logs_only_the_outcome(self, smtp, caplog) -> None:
        caplog.set_level("INFO", logger="uvicorn.error")
        assert email.verify_transport() is True
        assert "email transport ready" in caplog.text
        assert "app-password-never-shown" not in caplog.text

    def test_startup_check_reports_a_failure_by_type(self, smtp, monkeypatch, caplog) -> None:
        def refuse(self, user, password):
            raise smtplib.SMTPAuthenticationError(535, password.encode())

        monkeypatch.setattr(FakeSMTPSSL, "login", refuse)
        assert email.verify_transport() is False
        assert "SMTPAuthenticationError" in caplog.text
        assert "app-password-never-shown" not in caplog.text


class TestTestEmailCommand:
    def test_prints_the_server_reply_and_no_credentials(self, smtp, capsys) -> None:
        assert cli.main(["test-email"]) == 0
        out = capsys.readouterr()
        printed = out.out + out.err
        assert "250 2.0.0 OK queued as ABC123" in printed
        assert "app-password-never-shown" not in printed
        body = FakeSMTP.instances[0].body.decode()
        assert "[Test]" in body and "nakshiketh28@gmail.com" in body

    def test_reports_a_failure(self, smtp, monkeypatch, capsys) -> None:
        def refuse(self, user, password):
            raise smtplib.SMTPAuthenticationError(535, password.encode())

        monkeypatch.setattr(FakeSMTPSSL, "login", refuse)
        assert cli.main(["test-email"]) == 1
        out = capsys.readouterr()
        assert "SMTPAuthenticationError" in out.err
        assert "app-password-never-shown" not in out.out + out.err

    def test_says_what_is_missing(self, smtp, monkeypatch, capsys) -> None:
        monkeypatch.setattr(smtp, "email_user", "")
        assert cli.main(["test-email"]) == 2
        assert "EMAIL_USER" in capsys.readouterr().err
