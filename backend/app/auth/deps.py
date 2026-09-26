"""What a request is, for member authentication: who sent it, from where, and whether it may.

**Who.** `require_member` is attached to every protected router in `app.main`,
so a route added to one of those routers is protected without anyone
remembering to protect it. `require_session` is the weaker form the auth
endpoints use: a restricted session (temporary password not yet changed)
passes it, and nothing else does.

**CSRF.** The session is a cookie, and the browser attaches cookies to
cross-site requests. So every state-changing request must carry the
`X-Sahayak-CSRF: 1` header, which a cross-site form cannot set and a
cross-origin script cannot send without a CORS preflight this API refuses. If
the request names an `Origin`, the origin must be one this deployment serves.

**From where.** The socket's address, unless the socket is loopback: then the
request came through the local proxy (Vite in development, `serve-public.mjs`
when deployed), and the rightmost `X-Forwarded-For` entry is the one that proxy
wrote. Entries further left came from the client and are ignored.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from app.auth import sessions
from app.auth.store import connect
from app.core.errors import ApiError
from app.core.settings import get_settings

CSRF_HEADER = "x-sahayak-csrf"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
LOOPBACK = {"127.0.0.1", "::1", "localhost", "testclient"}


@dataclass(frozen=True)
class CurrentMember:
    pk: int
    member_id: str
    username: str
    name: str
    role: str
    institution: str
    restricted: bool


def client_ip(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    if peer in LOOPBACK:
        forwarded = request.headers.get("x-forwarded-for", "")
        hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
        if hops:
            return hops[-1][:64]
    return peer


def user_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


def _allowed_origins(request: Request) -> set[str]:
    settings = get_settings()
    allowed = {origin.rstrip("/") for origin in settings.cors_origin_list}
    if settings.app_base_url:
        allowed.add(settings.app_base_url.rstrip("/"))
    # The origin the request was addressed to. Behind the local proxy that is
    # what the proxy says it received; otherwise it is this request's own host.
    behind_proxy = (request.client.host if request.client else "") in LOOPBACK
    host = (behind_proxy and request.headers.get("x-forwarded-host")) or request.headers.get("host")
    if host:
        scheme = (behind_proxy and request.headers.get("x-forwarded-proto")) or request.url.scheme
        allowed.add(f"{scheme}://{host}")
    return allowed


def check_csrf(request: Request) -> None:
    """Refuse a state-changing request that could have come from another site."""
    if request.method in SAFE_METHODS:
        return
    if request.headers.get(CSRF_HEADER) != "1":
        raise ApiError(
            "csrf_failed", "This request was refused. Reload the page and try again.", 403
        )
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in _allowed_origins(request):
        raise ApiError(
            "csrf_failed", "This request was refused. Reload the page and try again.", 403
        )


def current_session(request: Request) -> CurrentMember | None:
    raw = request.cookies.get(sessions.COOKIE_NAME, "")
    if not raw:
        return None
    with connect() as connection:
        row = sessions.lookup(connection, raw)
    if row is None:
        return None
    return CurrentMember(
        pk=int(row["member_pk"]),
        member_id=row["member_id"],
        username=row["username"],
        name=row["name"],
        role=row["role"],
        institution=row["institution"],
        restricted=bool(row["restricted"]),
    )


def require_session(request: Request) -> CurrentMember:
    """Any live session, restricted or not. For the auth endpoints only."""
    member = current_session(request)
    if member is None:
        raise ApiError("not_authenticated", "Your session has expired. Log in again.", 401)
    # After the session check: a request with no session can change nothing,
    # and "log in" is the more useful answer to give it.
    check_csrf(request)
    return member


def require_member(request: Request) -> CurrentMember:
    """A full session. Attached to every protected router."""
    member = require_session(request)
    if member.restricted:
        raise ApiError(
            "password_change_required",
            "Your account uses a temporary password. Set a new one to continue.",
            403,
        )
    return member


Member = Annotated[CurrentMember, Depends(require_member)]
Session = Annotated[CurrentMember, Depends(require_session)]
