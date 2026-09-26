"""What the server does for members when it starts.

The free host this runs on wipes its disk whenever it sleeps, and with it the
member table and the card's hash. So on every start, if a temporary password is
configured, the demo member is seeded (a no-op if present), and if that member
has never been issued a card, their card is issued. A card that was revoked is
left revoked: history in the table means somebody decided, and a restart must
not undo it.

Nothing is printed except what happened.
"""

from __future__ import annotations

import logging

from app.auth import cards
from app.auth.members import DEMO_MEMBER, seed_demo_member
from app.auth.store import connect
from app.core.settings import get_settings

#: Uvicorn's logger, so these lines appear in the server output.
log = logging.getLogger("uvicorn.error")


def bootstrap_members() -> None:
    temporary = get_settings().demo_member_temp_password
    with connect() as connection:
        if not temporary:
            log.info("DEMO_MEMBER_TEMP_PASSWORD not set; demo member not seeded")
            return
        if seed_demo_member(connection, temporary):
            log.info("demo member seeded")
        if not cards.has_card_history(connection, DEMO_MEMBER.member_id):
            cards.issue_card(connection, DEMO_MEMBER.member_id)
            log.info("demo member card issued")
