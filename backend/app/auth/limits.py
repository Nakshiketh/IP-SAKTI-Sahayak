"""Rate limits for the auth endpoints, per client address.

Separate buckets from the question limiter in `app.api.deps`, which is keyed on
a client-chosen session header and says so. These are keyed on the address
`deps.client_ip` resolves, and they are one layer: the per-account lockout in
`members` is the other, and it does not depend on where a request came from.

In process memory, like the question limiter: one process, one set of buckets,
and a restart clears them.
"""

from __future__ import annotations

from functools import lru_cache

from app.core.ratelimit import RateLimiter


@lru_cache
def login_per_ip() -> RateLimiter:
    """Password login: 20 attempts a minute from one address."""
    return RateLimiter(20, 60)


@lru_cache
def badge_per_ip() -> RateLimiter:
    """QR sign-in frames: generous, because the scanner sends several a second."""
    return RateLimiter(240, 60)


def reset_all() -> None:
    """For tests: empty every bucket."""
    for limiter in (login_per_ip(), badge_per_ip()):
        limiter.reset()
