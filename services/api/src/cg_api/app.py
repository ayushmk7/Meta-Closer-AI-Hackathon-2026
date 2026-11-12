"""App factory: two apps (public, internal), routes auto-discovered, spec examples for everything unhandled.

Slices add handlers as modules exposing `router = APIRouter()` in cg_api/routes/ (public) or
cg_api/internal/ (internal). Give each route `operation_id=<spec operationId>`; any operation without a
handler falls through to its openapi example. Nobody edits this file after M0.
"""

from __future__ import annotations

import importlib
import logging
import pkgutil

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.responses import JSONResponse

from cg_api import contracts, errors, ports
from cg_api.deps import current_user
from cg_api.settings import get_settings

log = logging.getLogger("cg_api")


def _discover(package: str) -> list[APIRouter]:
    pkg = importlib.import_module(package)
    mods = [importlib.import_module(f"{package}.{m.name}") for m in pkgutil.iter_modules(pkg.__path__)]
    return [m.router for m in mods if isinstance(getattr(m, "router", None), APIRouter)]


def _handled(routers: list[APIRouter]) -> set[str]:
    return {getattr(r, "operation_id", None) or getattr(r, "name", None) for rt in routers for r in rt.routes}


def _fallthrough(op: contracts.Operation):
    status, _ = op.success
    body = contracts.example(op)

    async def handler(request: Request):
        if op.public_needs_user:
            current_user(request.headers.get("x-cg-user"))
        log.info("example fallthrough: %s %s (%s)", op.method.upper(), op.path, op.operation_id)
        return Response(status_code=status) if body is None else JSONResponse(body, status_code=status)

    return handler


def _build(spec: str, package: str, title: str) -> FastAPI:
    app = FastAPI(title=title, openapi_url=None, docs_url=None, redoc_url=None)
    errors.install(app)
    routers = _discover(package)
    for router in routers:
        app.include_router(router)
    done = _handled(routers)
    for op in contracts.operations(spec):
        if op.operation_id in done or op.success[0] == 101:  # WebSocket lives in routes/system.py
            continue
        app.add_api_route(op.path, _fallthrough(op), methods=[op.method.upper()], operation_id=op.operation_id)
    return app


def create_apps() -> tuple[FastAPI, FastAPI]:
    """(public, internal). Refuses to build unless DEMO_MODE=1 (CONTRACTS §2)."""
    if not get_settings().demo_mode:
        raise SystemExit("cg-api: refusing to start without DEMO_MODE=1 (v2 has no real authentication)")
    ports.install_providers()
    public = _build(contracts.PUBLIC, "cg_api.routes", "Common Ground public API")
    internal = _build(contracts.INTERNAL, "cg_api.internal", "Common Ground internal API")
    return public, internal
