"""What the API says when it cannot answer.

An error is not an abstention and the two must never be confused. Abstaining is
the system working: it retrieved, it judged the evidence too thin, and it says
so on the answer surface with a reason a reader can act on. An error is the
system not working — no model configured, the request too large, too many
requests. Those arrive as HTTP errors carrying a machine ``code``, and the
interface renders them as a failure, never as "I could not find anything".

The ``code`` is what the frontend keys its message off. The ``message`` is for a
developer reading a log or a response body; it is never shown to a reader
untranslated.
"""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ApiErrorBody(BaseModel):
    code: str
    message: str


class ApiError(Exception):
    """Raised anywhere in the pipeline; rendered by the handler below."""

    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class GenerationUnavailable(ApiError):
    """No generator can honestly produce an answer from these passages.

    Deliberately not an abstention. Passages were retrieved and they may well
    support an answer; there is simply nothing configured that is allowed to
    write one. Reporting that as "nothing relevant" would blame the corpus for a
    deployment gap.
    """

    def __init__(self, message: str) -> None:
        super().__init__(code="generation_unavailable", message=message, status_code=503)


class RateLimited(ApiError):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__(
            code="rate_limited",
            message=f"Too many requests. Retry in {retry_after_seconds} seconds.",
            status_code=429,
        )
        self.retry_after_seconds = retry_after_seconds


class RequestTooLarge(ApiError):
    def __init__(self, limit_bytes: int) -> None:
        super().__init__(
            code="request_too_large",
            message=f"Request body exceeds {limit_bytes} bytes.",
            status_code=413,
        )


async def api_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    error = exc if isinstance(exc, ApiError) else ApiError("internal", "Unhandled error", 500)
    headers = {}
    if isinstance(error, RateLimited):
        headers["Retry-After"] = str(error.retry_after_seconds)
    return JSONResponse(
        status_code=error.status_code,
        content=ApiErrorBody(code=error.code, message=error.message).model_dump(),
        headers=headers,
    )
