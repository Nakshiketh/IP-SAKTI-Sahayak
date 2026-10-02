"""What the server does for members when it starts.

The free host this runs on wipes its disk whenever it sleeps, and with it the
member table and the card's hash. So on every start, if a temporary password is
configured, the demo member is seeded (a no-op if present). DEMO_MEMBER_PASSWORD,
where set, is seeded instead and needs no change, so the member's password is
the same after every wake; on Render the temporary password is kept that way.
And if that member
has never been issued a card, their card is issued. A card that was revoked is
left revoked: history in the table means somebody decided, and a restart must
not undo it.

Nothing is printed except what happened.
"""

from __future__ import annotations

import logging

from app.auth import cards, durable
from app.auth.members import DEMO_MEMBER, seed_demo_member
from app.auth.store import connect
from app.core.settings import get_settings

#: Uvicorn's logger, so these lines appear in the server output.
log = logging.getLogger("uvicorn.error")


def bootstrap_members() -> None:
    settings = get_settings()
    temporary, permanent = settings.demo_member_temp_password, settings.kept_member_password
    with connect() as connection:
        if not (temporary or permanent):
            log.info("DEMO_MEMBER_TEMP_PASSWORD not set; demo member not seeded")
            return
        if seed_demo_member(connection, temporary, permanent):
            log.info("demo member seeded" + (" with the host's password" if permanent else ""))
        _restore_kept_passwords(connection)
        if not cards.has_card_history(connection, DEMO_MEMBER.member_id):
            cards.issue_card(connection, DEMO_MEMBER.member_id)
            log.info("demo member card issued")


def _restore_kept_passwords(connection) -> None:
    """Put back any password a member set before the disk was last wiped."""
    if not durable.enabled():
        return
    try:
        for row in connection.execute("SELECT member_id FROM members").fetchall():
            kept = durable.load(row["member_id"])
            if kept is None:
                continue
            connection.execute(
                "UPDATE members SET password_hash = ?, must_change_password = 0"
                " WHERE member_id = ?",
                (kept, row["member_id"]),
            )
            connection.commit()
            log.info("kept password restored for %s", row["member_id"])
    except durable.DurableUnavailable as error:
        log.warning("kept passwords not restored: %s", error)
