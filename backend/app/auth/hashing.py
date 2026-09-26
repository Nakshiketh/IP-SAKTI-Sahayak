"""Every hash member authentication stores, and how each is compared.

Three secrets, three treatments, because they differ in how much guessing they
can withstand:

* **Passwords** are chosen by people and are guessable, so they get argon2id: a
  deliberately slow, memory-hard KDF.
* **Card tokens** carry their own entropy, so a fast SHA-256 is enough. Nobody
  enumerates a 29 x 29 module pattern or a 256-bit token.
* **One-time codes** have six digits: a million possibilities, which a plain
  SHA-256 gives up offline in well under a second. They are keyed with
  `OTP_SECRET` and bound to their challenge, so a stolen table is useless
  without the key and a code cannot be moved to another challenge.

Every comparison here is constant-time.
"""

from __future__ import annotations

import hashlib
import hmac

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

#: argon2-cffi's defaults: argon2id, RFC 9106's low-memory profile.
_PASSWORDS = PasswordHasher()

#: Verified against when an identifier matches no member, so an unknown account
#: costs the same time as a wrong password. Its password is thrown away.
_DUMMY_HASH = _PASSWORDS.hash("not a password anyone holds")


def hash_password(password: str) -> str:
    return _PASSWORDS.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """True if the password matches. An absent hash still costs a full verify."""
    try:
        return _PASSWORDS.verify(password_hash or _DUMMY_HASH, password) and bool(password_hash)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def token_hash(raw: str) -> str:
    """SHA-256 of a card token, hex. The raw token is never stored."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def otp_hash(secret: str, challenge_id: str, code: str) -> str:
    """HMAC-SHA256 over the code and the challenge it belongs to."""
    if not secret:
        raise RuntimeError("OTP_SECRET is not set.")
    message = f"{challenge_id}:{code}".encode()
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def same(left: str, right: str) -> bool:
    """Constant-time equality for hex digests and tokens."""
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))
