"""FastAPI application entry point."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import classify, feedback, health, privacy, query, records, sources
from app.core.errors import ApiError, RequestTooLarge, api_error_handler
from app.core.settings import get_settings


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Refuse a body larger than the cap, before anything reads it.

    Checked on the declared length rather than by counting bytes as they
    arrive: a client that lies about the length still has to get past the
    endpoint's own question-length check, and rejecting on the header costs
    nothing on every honest request.
    """

    def __init__(self, app, max_bytes: int) -> None:
        super().__init__(app)
        self._max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next) -> Response:
        declared = request.headers.get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > self._max_bytes:
            error = RequestTooLarge(self._max_bytes)
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
    #: This product has no camera, microphone, location or payment feature. The
    #: header says so, so a future dependency cannot quietly acquire one.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
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


def create_app() -> FastAPI:
    settings = get_settings()
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
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestSizeLimitMiddleware, max_bytes=settings.max_request_bytes)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.add_exception_handler(ApiError, api_error_handler)

    app.include_router(health.router)
    app.include_router(query.router)
    app.include_router(classify.router)
    app.include_router(sources.router)
    app.include_router(records.router)
    app.include_router(feedback.router)
    app.include_router(privacy.router)
    return app


app = create_app()
