"""Member administration from the command line.

    cd backend
    .venv/Scripts/python.exe -m app.auth.cli seed
    .venv/Scripts/python.exe -m app.auth.cli issue-card --member IPS-2026-0001
    .venv/Scripts/python.exe -m app.auth.cli revoke-card --member IPS-2026-0001
    .venv/Scripts/python.exe -m app.auth.cli gen-secrets
    .venv/Scripts/python.exe -m app.auth.cli test-email

Nothing here prints a password, a code, a token or a secret. `gen-secrets` is
the exception by design: it prints two fresh random values for you to paste into
`backend/.env` yourself, and they are not stored anywhere.
"""

from __future__ import annotations

import argparse
import secrets
import sys
from datetime import UTC, datetime

from app.auth import cards, email
from app.auth.members import DEMO_MEMBER, SeedRefused, seed_demo_member
from app.auth.store import connect
from app.auth.templates import otp_email
from app.core.settings import REPO_ROOT, get_settings

CARDS_DIR = REPO_ROOT / "demo" / "cards"


def _seed(_: argparse.Namespace) -> int:
    with connect() as connection:
        try:
            created = seed_demo_member(connection, get_settings().demo_member_temp_password)
        except SeedRefused as error:
            print(f"Refused: {error}", file=sys.stderr)
            return 2
    print("Demo member created." if created else "Demo member already exists; left unchanged.")
    return 0


def _issue(args: argparse.Namespace) -> int:
    with connect() as connection:
        try:
            cards.issue_card(connection, args.member)
        except cards.UnknownMember:
            print(f"No member with Member ID {args.member}. Run `seed` first.", file=sys.stderr)
            return 2
    path = cards.render_badge_png(CARDS_DIR / f"{args.member.upper()}-qr.png")
    print(f"Card issued. QR image: {path}")
    return 0


def _revoke(args: argparse.Namespace) -> int:
    with connect() as connection:
        try:
            revoked = cards.revoke_card(connection, args.member, args.reason)
        except cards.UnknownMember:
            print(f"No member with Member ID {args.member}.", file=sys.stderr)
            return 2
    print("Card revoked." if revoked else "That member has no active card.")
    return 0


def _secrets(_: argparse.Namespace) -> int:
    print("# Paste into backend/.env. Each is 32 random bytes, hex.")
    print(f"SESSION_SECRET={secrets.token_hex(32)}")
    print(f"OTP_SECRET={secrets.token_hex(32)}")
    return 0


#: The dummy code in a test email. Marked as a test in the subject and the body,
#: and never stored, so it cannot sign anyone in.
TEST_CODE = "123456"


def _test_email(args: argparse.Namespace) -> int:
    rendered = otp_email(TEST_CODE, "login", datetime.now(UTC), test=True)
    settings = get_settings()
    print(
        f"Sending a test message to {args.to} through {settings.email_host}:{settings.email_port}"
    )
    try:
        sent = email.send_email(
            to=args.to, subject=rendered.subject, html=rendered.html, text=rendered.text
        )
    except email.EmailNotConfigured as error:
        print(f"Not sent: {error}", file=sys.stderr)
        return 2
    except email.EmailFailed as error:
        print(f"Not sent: {error}", file=sys.stderr)
        return 1
    print(f"Accepted by the server: {sent.code} {sent.reply}")
    print("Check the inbox (and the spam folder) of the address above.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.auth.cli", description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("seed", help="create the demo member if missing").set_defaults(run=_seed)

    issue = commands.add_parser("issue-card", help="issue a member's card and write its QR image")
    issue.add_argument("--member", required=True, help="Member ID, e.g. IPS-2026-0001")
    issue.set_defaults(run=_issue)

    revoke = commands.add_parser("revoke-card", help="revoke a member's active card")
    revoke.add_argument("--member", required=True)
    revoke.add_argument("--reason", default="revoked", help="e.g. lost")
    revoke.set_defaults(run=_revoke)

    commands.add_parser(
        "gen-secrets", help="print fresh SESSION_SECRET and OTP_SECRET"
    ).set_defaults(run=_secrets)

    test = commands.add_parser("test-email", help="send one marked test verification email")
    test.add_argument("--to", default=DEMO_MEMBER.email, help="recipient (default: demo member)")
    test.set_defaults(run=_test_email)

    args = parser.parse_args(argv)
    return args.run(args)


if __name__ == "__main__":
    raise SystemExit(main())
