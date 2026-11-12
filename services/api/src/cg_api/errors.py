"""CONTRACTS §7 error envelope."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

_DEFAULT_CODES = {
    400: "validation_failed",
    401: "unauthenticated",
    403: "not_allowed",
    404: "not_found",
    405: "validation_failed",
    409: "conflict",
    422: "screened",
    429: "rate_limited",
    503: "unavailable",
}


_COPY = {
    400: "Something in that request isn't right.",
    401: "Pick a demo user to continue.",
    403: "That isn't available to you.",
    404: "That isn't here anymore.",
    405: "That isn't something you can do here.",
    409: "That changed a moment ago. Refresh and try again.",
    429: "That's a lot at once. Try again in a bit.",
    503: "That's unavailable right now. Try again in a moment.",
}


class UserMessage(ValueError):
    """Raise from a pydantic validator: its text becomes the 400 message, as final copy."""


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, retryable: bool = False, details: dict | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.retryable, self.details = status, code, message, retryable, details


def envelope(status: int, code: str, message: str, retryable: bool = False, details: dict | None = None):
    err = {"code": code, "message": message, "retryable": retryable}
    if details:
        err["details"] = details
    return JSONResponse({"error": err}, status_code=status)


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, e: ApiError):
        return envelope(e.status, e.code, e.message, e.retryable, e.details)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError):
        human = next(
            (str(x) for err in e.errors() if isinstance(x := err.get("ctx", {}).get("error"), UserMessage)), None
        )
        return envelope(400, "validation_failed", human or _COPY[400])

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        code = _DEFAULT_CODES.get(e.status_code, "internal")
        return envelope(e.status_code, code, _COPY.get(e.status_code, "Something went wrong. Try again."))

    @app.exception_handler(Exception)
    async def _crash(_: Request, e: Exception):
        return envelope(500, "internal", "Something went wrong. Try again.", retryable=True)
