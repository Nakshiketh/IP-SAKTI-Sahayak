"""Member cards: which QR signs in as which member, and how a card is revoked.

**The card is the existing QR badge.** At the member's request (2026-09-26) the
one QR that already signs in — the Digital QR Badge, whose data does not decode
— stays the credential, rather than a new `IPSAKTI:v1:<token>` code. It has no
payload to hash, so its token is its pattern: the 29 x 29 module grid from
`app.core.badge`, written out row by row. `member_qr_tokens` stores the SHA-256
of that, exactly as it would for a random token, so issuing, revoking and
looking a card up all work the same way.

What that costs, stated plainly: the pattern is in this repository and in its
history, so the card is not a secret the way a fresh token is. Anyone with a
copy of the image holds the first factor. The second — the one-time code sent to
the member's email — is what keeps a copied card from being a way in.

A camera frame is matched to the pattern by `app.core.badge.is_badge`; a frame
that matches resolves to `BADGE_TOKEN`, and that is what gets looked up here.
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

import cv2
import numpy as np

from app.auth.hashing import token_hash
from app.auth.members import log_event, member_pk
from app.core import badge

#: The badge's token: its module pattern, one row per line.
BADGE_TOKEN = "\n".join(badge.BADGE)

#: Quiet zone and scale for the card image: 4 modules each side, and 17 px a
#: module, which makes (29 + 8) x 17 = 629 px square.
QUIET_ZONE = 4
MODULE_PX = 17


class UnknownMember(LookupError):
    pass


def issue_card(connection: sqlite3.Connection, member_id: str, raw_token: str = BADGE_TOKEN) -> int:
    """Revoke the member's active card, if any, and issue this one. Returns its row id."""
    member = member_pk(connection, member_id)
    if member is None:
        raise UnknownMember(member_id)

    now = time.time()
    digest = token_hash(raw_token)
    # A card held by another member is revoked from them first: a pattern can
    # only ever sign in as one person.
    connection.execute(
        "UPDATE member_qr_tokens SET revoked_at = ?, revoked_reason = 'reissued'"
        " WHERE revoked_at IS NULL AND (member_fk = ? OR token_hash = ?)",
        (now, member, digest),
    )
    cursor = connection.execute(
        "INSERT INTO member_qr_tokens (member_fk, token_hash, issued_at) VALUES (?, ?, ?)",
        (member, digest, now),
    )
    connection.commit()
    log_event(connection, "qr_issued", member)
    return int(cursor.lastrowid)


def revoke_card(connection: sqlite3.Connection, member_id: str, reason: str = "revoked") -> bool:
    """Revoke the member's active card. Returns False if there was none."""
    member = member_pk(connection, member_id)
    if member is None:
        raise UnknownMember(member_id)
    cursor = connection.execute(
        "UPDATE member_qr_tokens SET revoked_at = ?, revoked_reason = ?"
        " WHERE member_fk = ? AND revoked_at IS NULL",
        (time.time(), reason, member),
    )
    connection.commit()
    if cursor.rowcount:
        log_event(connection, "qr_revoked", member)
    return bool(cursor.rowcount)


def has_card_history(connection: sqlite3.Connection, member_id: str) -> bool:
    """Whether this member has ever been issued a card, revoked or not."""
    member = member_pk(connection, member_id)
    return (
        member is not None
        and connection.execute(
            "SELECT 1 FROM member_qr_tokens WHERE member_fk = ?", (member,)
        ).fetchone()
        is not None
    )


def render_badge_png(path: Path) -> Path:
    """Write the badge as a clean PNG: black on white, quiet zone, 629 px square.

    Drawn from the module grid rather than copied from a photograph, so it scans
    from a screen or a print without the glare and skew of the original image.
    The error-correction level is whatever the badge's own format bits say; it
    cannot be changed without changing the pattern, which is the credential.
    """
    grid = np.array([[cell == "#" for cell in row] for row in badge.BADGE], dtype=bool)
    padded = np.pad(grid, QUIET_ZONE, constant_values=False)
    pixels = np.where(padded, 0, 255).astype(np.uint8)
    image = np.kron(pixels, np.ones((MODULE_PX, MODULE_PX), dtype=np.uint8))
    path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(path), image):
        raise OSError(f"Could not write {path}")
    return path
