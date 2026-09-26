"""A per-session request limit.

This limiter, for questions, is keyed on the session id the client sends, never
on an address or a member: question traffic should not tie a question to a
person. The sign-in routes are different, and limit per address and per account
(`app.auth.limits`, and the lockout in `app.api.auth`); this class is the bucket
both use.

A session id is client-supplied and therefore trivially rotated. That is
accepted: this limit exists to keep one open tab from hammering a model, not to
stop a determined caller, and the honest thing is to say so rather than imply a
security property it does not have. A deployment that needs more puts a real
gateway in front.

The bucket is in process memory. One process, one bucket; restart clears it.
"""

from __future__ import annotations

import time
from collections import deque
from threading import Lock


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = Lock()

    def check(self, key: str, now: float | None = None) -> int:
        """Record a request. Returns 0 if allowed, else seconds until it is."""
        moment = time.monotonic() if now is None else now
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            cutoff = moment - self.window_seconds
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= self.limit:
                return max(1, int(hits[0] + self.window_seconds - moment) + 1)
            hits.append(moment)
            if not hits:
                self._hits.pop(key, None)
            return 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
