"""The rules a new password has to meet, enforced here and nowhere else.

The frontend shows the same four rules as a checklist, but that is a courtesy:
this is the check that counts.
"""

from __future__ import annotations

import re

from app.auth.hashing import verify_password

MIN_LENGTH = 8
MAX_LENGTH = 128


def problems(
    new: str,
    confirm: str,
    *,
    username: str,
    member_id: str,
    current_hash: str,
) -> list[str]:
    """Codes for every rule the password breaks. Empty means it is acceptable."""
    found: list[str] = []
    if not MIN_LENGTH <= len(new) <= MAX_LENGTH:
        found.append("password_length")
    if not re.search(r"[A-Z]", new):
        found.append("password_uppercase")
    if not re.search(r"[a-z]", new):
        found.append("password_lowercase")
    if not re.search(r"[0-9]", new):
        found.append("password_number")
    if new.lower() in {username.lower(), member_id.lower()}:
        found.append("password_is_identifier")
    # The current password is the temporary one on a first login, so this also
    # covers "must not equal the temporary password".
    if new and verify_password(current_hash, new):
        found.append("password_unchanged")
    if new != confirm:
        found.append("password_mismatch")
    return found
