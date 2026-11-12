"""Request dependencies shared by every slice."""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import Depends, Header

from cg_api.errors import ApiError

_USER_ID = re.compile(r"^u_[a-z0-9]+$")

# Set by the store once a seed is loaded (slice A M1); None = accept any well-formed id (M0 / tests).
known_user = None  # callable[[str], bool] | None


def current_user(x_cg_user: Annotated[str | None, Header()] = None) -> str:
    """Demo identity (CONTRACTS §2). Missing, malformed or unknown -> 401."""
    if not x_cg_user or not _USER_ID.match(x_cg_user) or (known_user is not None and not known_user(x_cg_user)):
        raise ApiError(401, "unauthenticated", "Pick a demo user to continue.")
    return x_cg_user


User = Annotated[str, Depends(current_user)]
