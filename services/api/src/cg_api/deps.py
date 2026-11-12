"""Request dependencies shared by every slice."""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import Depends, Header, Request

from cg_api.errors import ApiError
from cg_api.store import Store, store

_USER_ID = re.compile(r"^u_[a-z0-9]+$")


def current_user(x_cg_user: Annotated[str | None, Header()] = None) -> str:
    """Demo identity (CONTRACTS §2). Missing, malformed or unknown -> 401."""
    if not x_cg_user or not _USER_ID.match(x_cg_user) or x_cg_user not in store.users:
        raise ApiError(401, "unauthenticated", "Pick a demo user to continue.")
    return x_cg_user


def base_url(request: Request) -> str:
    """Host the phone used, for static URLs (works on the LAN, not just localhost)."""
    return str(request.base_url)


User = Annotated[str, Depends(current_user)]
Base = Annotated[str, Depends(base_url)]


def get_world() -> Store:
    """The single in-memory world (cg_api.store.store). Depend on this instead of importing the global."""
    return store


World = Annotated[Store, Depends(get_world)]
