"""FastAPI application entry point."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import classify, feedback, health, query, sources
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


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        description=(
            "Source-cited guidance on intellectual property and regulation for "
            "Ayurvedic products. Information, not legal advice."
        ),
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
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
    app.include_router(feedback.router)
    return app


app = create_app()
