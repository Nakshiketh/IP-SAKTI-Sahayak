"""Phase 1 of member authentication: the tables, the demo member and the card.

Every test works on a database under `tmp_path`; the repository's own
`data/accounts.sqlite3` is never opened.
"""

from __future__ import annotations

import sqlite3
from functools import partial
from pathlib import Path

import cv2
import pytest

from app.auth import cards, cli
from app.auth.hashing import otp_hash, same, token_hash, verify_password
from app.auth.members import DEMO_MEMBER, SeedRefused, mask_email, seed_demo_member
from app.auth.store import SCHEMA_VERSION, connect
from app.core import badge

TEMP = "Temp-pass-for-tests-1"


@pytest.fixture
def db(tmp_path: Path) -> sqlite3.Connection:
    connection = connect(tmp_path / "accounts.sqlite3")
    yield connection
    connection.close()


@pytest.fixture
def seeded(db: sqlite3.Connection) -> sqlite3.Connection:
    seed_demo_member(db, TEMP)
    return db


def active_cards(db: sqlite3.Connection) -> list[sqlite3.Row]:
    return db.execute("SELECT * FROM member_qr_tokens WHERE revoked_at IS NULL").fetchall()


class TestSchema:
    def test_every_table_exists(self, db: sqlite3.Connection) -> None:
        tables = {
            row["name"] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        assert {
            "members",
            "member_qr_tokens",
            "auth_challenges",
            "otp_codes",
            "sessions",
            "auth_events",
            "auth_schema",
        } <= tables

    def test_connecting_twice_is_harmless(self, tmp_path: Path) -> None:
        path = tmp_path / "accounts.sqlite3"
        connect(path).close()
        again = connect(path)
        assert [tuple(row) for row in again.execute("SELECT version FROM auth_schema")] == [
            (SCHEMA_VERSION,)
        ]

    def test_lives_beside_the_old_accounts_table(self, tmp_path: Path) -> None:
        """One accounts database, not a second one."""
        path = tmp_path / "accounts.sqlite3"
        old = sqlite3.connect(path)
        old.execute("CREATE TABLE accounts (username TEXT PRIMARY KEY)")
        old.commit()
        old.close()
        tables = {row[0] for row in connect(path).execute("SELECT name FROM sqlite_master")}
        assert {"accounts", "members"} <= tables

    def test_challenge_purpose_is_constrained(self, db: sqlite3.Connection) -> None:
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(
                "INSERT INTO auth_challenges (id, purpose, created_at, expires_at)"
                " VALUES ('x', 'anything', 0, 0)"
            )


class TestSeed:
    def test_creates_the_demo_member(self, seeded: sqlite3.Connection) -> None:
        row = seeded.execute("SELECT * FROM members").fetchone()
        assert row["member_id"] == "IPS-2026-0001"
        assert row["name"] == "Nakshiketh"
        assert row["username"] == "nakshiketh28"
        assert row["email"] == "nakshiketh28@gmail.com"
        assert row["role"] == "Student / Researcher"
        assert row["institution"] == "MGIT"
        assert row["must_change_password"] == 1
        assert row["is_active"] == 1

    def test_stores_an_argon2id_hash_not_the_password(self, seeded: sqlite3.Connection) -> None:
        stored = seeded.execute("SELECT password_hash FROM members").fetchone()[0]
        assert stored.startswith("$argon2id$")
        assert TEMP not in stored
        assert verify_password(stored, TEMP)
        assert not verify_password(stored, TEMP + "x")

    def test_is_idempotent_and_never_resets_a_password(self, seeded: sqlite3.Connection) -> None:
        before = seeded.execute("SELECT password_hash FROM members").fetchone()[0]
        assert seed_demo_member(seeded, "A-different-temp-2") is False
        after = seeded.execute("SELECT password_hash FROM members").fetchone()[0]
        assert before == after
        assert seeded.execute("SELECT count(*) FROM members").fetchone()[0] == 1

    def test_refuses_without_a_temporary_password(self, db: sqlite3.Connection) -> None:
        with pytest.raises(SeedRefused):
            seed_demo_member(db, "")
        assert db.execute("SELECT count(*) FROM members").fetchone()[0] == 0


class TestHashing:
    def test_an_unknown_account_still_fails(self) -> None:
        assert verify_password(None, "anything") is False

    def test_otp_hash_is_keyed_and_bound_to_its_challenge(self) -> None:
        code = "042817"
        one = otp_hash("secret-a", "challenge-1", code)
        assert one != otp_hash("secret-b", "challenge-1", code)
        assert one != otp_hash("secret-a", "challenge-2", code)
        assert same(one, otp_hash("secret-a", "challenge-1", code))

    def test_otp_hash_refuses_an_empty_secret(self) -> None:
        with pytest.raises(RuntimeError):
            otp_hash("", "challenge", "000000")


class TestMask:
    def test_the_demo_member(self) -> None:
        assert mask_email(DEMO_MEMBER.email) == "n**********8@gmail.com"

    @pytest.mark.parametrize(
        ("email", "masked"),
        [("ab@x.org", "**@x.org"), ("abc@x.org", "a*c@x.org"), ("a@x.org", "*@x.org")],
    )
    def test_short_local_parts(self, email: str, masked: str) -> None:
        assert mask_email(email) == masked


class TestCards:
    def test_issuing_stores_only_the_hash(self, seeded: sqlite3.Connection) -> None:
        cards.issue_card(seeded, "IPS-2026-0001")
        (row,) = active_cards(seeded)
        assert row["token_hash"] == token_hash(cards.BADGE_TOKEN)
        assert cards.BADGE_TOKEN not in str(dict(row))

    def test_member_id_is_case_insensitive(self, seeded: sqlite3.Connection) -> None:
        cards.issue_card(seeded, "ips-2026-0001")
        assert len(active_cards(seeded)) == 1

    def test_reissuing_revokes_the_previous_card(self, seeded: sqlite3.Connection) -> None:
        cards.issue_card(seeded, "IPS-2026-0001")
        cards.issue_card(seeded, "IPS-2026-0001")
        rows = seeded.execute("SELECT * FROM member_qr_tokens ORDER BY id").fetchall()
        assert len(rows) == 2
        assert rows[0]["revoked_reason"] == "reissued" and rows[0]["revoked_at"] is not None
        assert rows[1]["revoked_at"] is None

    def test_only_one_active_card_per_member_even_by_hand(self, seeded: sqlite3.Connection) -> None:
        cards.issue_card(seeded, "IPS-2026-0001")
        with pytest.raises(sqlite3.IntegrityError):
            seeded.execute(
                "INSERT INTO member_qr_tokens (member_fk, token_hash, issued_at)"
                " VALUES (1, 'another', 0)"
            )

    def test_revoking(self, seeded: sqlite3.Connection) -> None:
        cards.issue_card(seeded, "IPS-2026-0001")
        assert cards.revoke_card(seeded, "IPS-2026-0001", "lost") is True
        assert active_cards(seeded) == []
        assert cards.revoke_card(seeded, "IPS-2026-0001") is False
        reason = seeded.execute("SELECT revoked_reason FROM member_qr_tokens").fetchone()[0]
        assert reason == "lost"

    def test_unknown_member(self, db: sqlite3.Connection) -> None:
        with pytest.raises(cards.UnknownMember):
            cards.issue_card(db, "IPS-0000-0000")

    def test_events_are_logged_without_secrets(self, seeded: sqlite3.Connection) -> None:
        cards.issue_card(seeded, "IPS-2026-0001")
        cards.revoke_card(seeded, "IPS-2026-0001")
        events = [row["event"] for row in seeded.execute("SELECT event FROM auth_events")]
        assert events == ["qr_issued", "qr_revoked"]

    def test_the_card_image_is_the_badge(self, tmp_path: Path) -> None:
        """The PNG the card script writes must sign in: it is the credential."""
        path = cards.render_badge_png(tmp_path / "card.png")
        image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        assert image.shape[0] == image.shape[1] >= 600
        assert badge.is_badge(path.read_bytes()) is True


class TestCli:
    @pytest.fixture
    def wired(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
        monkeypatch.setattr(cli, "connect", partial(connect, tmp_path / "accounts.sqlite3"))
        monkeypatch.setattr(cli, "CARDS_DIR", tmp_path / "cards")
        monkeypatch.setattr(cli.get_settings(), "demo_member_temp_password", TEMP)
        return tmp_path

    def test_seed_issue_revoke_print_no_secret(
        self, wired: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        assert cli.main(["seed"]) == 0
        assert cli.main(["seed"]) == 0
        assert cli.main(["issue-card", "--member", "IPS-2026-0001"]) == 0
        assert (wired / "cards" / "IPS-2026-0001-qr.png").is_file()
        assert cli.main(["revoke-card", "--member", "IPS-2026-0001"]) == 0
        out = capsys.readouterr()
        printed = out.out + out.err
        assert TEMP not in printed
        assert cards.BADGE_TOKEN not in printed
        assert token_hash(cards.BADGE_TOKEN) not in printed

    def test_seed_refuses_without_the_variable(
        self, wired: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(cli.get_settings(), "demo_member_temp_password", "")
        assert cli.main(["seed"]) == 2

    def test_issue_for_an_unknown_member(self, wired: Path) -> None:
        assert cli.main(["issue-card", "--member", "IPS-0000-0000"]) == 2

    def test_gen_secrets(self, capsys: pytest.CaptureFixture[str]) -> None:
        assert cli.main(["gen-secrets"]) == 0
        lines = [line for line in capsys.readouterr().out.splitlines() if "=" in line]
        values = dict(line.split("=", 1) for line in lines)
        assert set(values) == {"SESSION_SECRET", "OTP_SECRET"}
        assert all(len(bytes.fromhex(value)) == 32 for value in values.values())
        assert values["SESSION_SECRET"] != values["OTP_SECRET"]
