"""FastAPI application entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import (
    analyst,
    auth,
    classify,
    demo,
    documents,
    feedback,
    health,
    insight,
    privacy,
    query,
    records,
    sources,
)
from app.auth.bootstrap import bootstrap_members
from app.auth.deps import require_member
from app.core.errors import ApiError, RequestTooLarge, api_error_handler
from app.core.settings import get_settings

#: Paths allowed a larger body. Listed here rather than inferred from a name
#: so that adding an upload route is a deliberate edit somebody reviews, not
#: something that happens because a path happened to contain "upload".
UPLOAD_PATHS = ("/api/v1/documents/",)


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Refuse a body larger than the cap, before anything reads it.

    Checked on the declared length rather than by counting bytes as they
    arrive: a client that lies about the length still has to get past the
    endpoint's own question-length check, and rejecting on the header costs
    nothing on every honest request.

    The cap is small — a question is a sentence, and nothing else this API
    takes is large. `upload_paths` names the exceptions, because a document
    upload is measured in megabytes and a single global limit would have to be
    either useless for questions or useless for files. The exemption raises the
    ceiling for those paths and nothing more: `services.documents` still
    enforces its own limit on the bytes actually received, which is the only
    number the sender does not write.
    """

    def __init__(
        self, app, max_bytes: int, upload_bytes: int, upload_paths: tuple[str, ...]
    ) -> None:
        super().__init__(app)
        self._max_bytes = max_bytes
        self._upload_bytes = upload_bytes
        self._upload_paths = upload_paths

    def _limit_for(self, path: str) -> int:
        if any(path.startswith(prefix) for prefix in self._upload_paths):
            return self._upload_bytes
        return self._max_bytes

    async def dispatch(self, request: Request, call_next) -> Response:
        limit = self._limit_for(request.url.path)
        declared = request.headers.get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            error = RequestTooLarge(limit)
            return JSONResponse(
                status_code=error.status_code,
                content={"code": error.code, "message": error.message},
            )
        return await call_next(request)


#: Sent on every API response. The API returns JSON and nothing else, so the
#: policy is the most restrictive one there is: no script, no style, no frame,
#: no connection. If a response from here is ever rendered as a document — a
#: browser opening an endpoint directly, an error page, a content-type
#: mismatch — there is nothing in it a policy this tight would allow to run.
#:
#: The web app's own policy is separate and stricter about different things; it
#: is set on the document in `frontend/index.html`, because the app is served as
#: static files by something that is not this process.
SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    ),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    #: The camera is used by one feature, badge sign-in, and only by this origin.
    #: Microphone, location and payment stay off, so a future dependency cannot
    #: quietly acquire one.
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=()",
}


#: The interactive documentation is the one thing this process serves that is a
#: document rather than JSON, and it loads its viewer from a CDN. It is served
#: only in development (see `create_app`), and it gets a policy of its own
#: rather than an exemption from having one.
DOCS_PATHS = ("/api/docs", "/api/redoc")
DOCS_CSP = (
    "default-src 'none'; script-src 'self' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach `SECURITY_HEADERS` to every response, including error responses.

    Middleware rather than per-route, because the responses most worth covering
    are the ones no route wrote: a 404 from the router, a 429 from the limiter,
    a 500 from something unforeseen.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if request.url.path in DOCS_PATHS:
            response.headers["Content-Security-Policy"] = DOCS_CSP
        return response


class MissingAuthSettings(RuntimeError):
    """Raised at startup, naming the absent keys and never their values."""


@asynccontextmanager
async def lifespan(_app: FastAPI):
    bootstrap_members()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    missing = settings.missing_auth_settings()
    if missing:
        raise MissingAuthSettings(
            "Missing or too short in backend/.env: "
            + ", ".join(missing)
            + ". Each needs at least 32 random characters. Generate them with:"
            " cd backend && .venv/Scripts/python.exe -m app.auth.cli gen-secrets"
        )
    # The interactive documentation lists every endpoint and its shape, which is
    # a map of the attack surface and a page that loads third-party script. It
    # is worth having while building and is not worth serving anywhere else.
    development = settings.environment == "development"
    app = FastAPI(
        title=settings.app_name,
        description=(
            "Source-cited guidance on intellectual property and regulation for "
            "Ayurvedic products. Information, not legal advice."
        ),
        version="0.1.0",
        docs_url="/api/docs" if development else None,
        redoc_url="/api/redoc" if development else None,
        openapi_url="/api/openapi.json" if development else None,
        lifespan=lifespan,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        RequestSizeLimitMiddleware,
        max_bytes=settings.max_request_bytes,
        upload_bytes=settings.max_upload_bytes,
        upload_paths=UPLOAD_PATHS,
    )
    app.add_middleware(
        CORSMiddleware,
        # An explicit list, never "*": the session is a cookie now. Both
        # deployments are same-origin, so this only matters for a caller
        # somebody deliberately lists.
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type", "X-Sahayak-CSRF", "X-Session-Id"],
    )
    app.add_exception_handler(ApiError, api_error_handler)

    # Open: sign-in, and health (which protects its own corpus-version route).
    app.include_router(auth.router)
    app.include_router(health.router)

    # Everything else needs a full member session. Attached here, per router,
    # so a route added to any of these is protected without anyone remembering
    # to protect it. `tests/test_member_auth_routes.py` walks every registered
    # route and fails if one outside the open list answers without a session.
    protected = [Depends(require_member)]
    for router in (
        analyst.router,
        query.router,
        classify.router,
        sources.router,
        records.router,
        feedback.router,
        privacy.router,
        demo.router,
        insight.router,
        documents.router,
    ):
        app.include_router(router, dependencies=protected)
    return app


app = create_app()
