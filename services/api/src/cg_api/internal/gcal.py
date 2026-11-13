"""Live Google Calendar free/busy (CONTRACTS Decisions, live Google Calendar; P10 as amended).

linkConnectorAccount / connectorOAuthCallback on the loopback listener; the demo operator links a real Google
account for one demo user in the laptop browser. Only free/busy start/end are read (scope calendar.freebusy,
primary calendar), turned into the same `busy` connector records the seed has, and swapped in for that user's
seeded google_calendar records. Nothing is written to Google. Tokens live in memory + .cache/gcal_tokens.json
(0600, gitignored) and never reach a client or a log. Any failure keeps the current (seeded) records (D4).
"""

from __future__ import annotations

import hashlib
import html
import json
import logging
import os
import secrets
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from cg_api import seed
from cg_api.errors import ApiError
from cg_api.settings import get_settings
from cg_api.store import store
from cg_api.store.bridge import changed

router = APIRouter()
log = logging.getLogger("cg_api.gcal")

PROVIDER = "google_calendar"
# The URI registered in the Google console; fixed even when CG_INTERNAL_PORT differs (a second dev instance).
REDIRECT_URI = "http://127.0.0.1:9001/internal/v1/connectors/google_calendar/callback"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy"
SCOPE = "https://www.googleapis.com/auth/calendar.freebusy"
TOKENS = Path(__file__).resolve().parents[3] / ".cache" / "gcal_tokens.json"
STATE_TTL_S = 600

transport: httpx.AsyncBaseTransport | None = None  # tests swap in httpx.MockTransport
_tokens: dict[str, dict] | None = None  # uid -> {access_token, refresh_token, expires_at}
_states: dict[str, tuple[str, float]] = {}  # state nonce -> (uid, expiry monotonic); single use
_last: dict[str, float] = {}  # uid -> monotonic time of the last freeBusy read


def _live() -> bool:
    s = get_settings()
    return s.connectors_live and bool(s.google_client_id and s.google_client_secret)


def _load() -> dict[str, dict]:
    global _tokens
    if _tokens is None:
        try:
            _tokens = json.loads(TOKENS.read_text())
        except (OSError, ValueError):
            _tokens = {}
    return _tokens


def _save() -> None:
    TOKENS.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(TOKENS, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(_load(), f)
    os.chmod(TOKENS, 0o600)  # O_CREAT's mode is ignored for an existing file


def linked(uid: str) -> bool:
    return _live() and uid in _load()


def _page(title: str, body: str, status: int = 200) -> HTMLResponse:
    return HTMLResponse(
        f"<!doctype html><meta charset=utf-8><title>{html.escape(title)}</title><p>{body}</p>", status_code=status
    )


@router.get("/internal/v1/connectors/{provider}/link", operation_id="linkConnectorAccount")
def link(provider: str, userId: str):
    if provider != PROVIDER or userId not in store.users or not _live():
        raise ApiError(404, "not_found", "No live link for that app or user (CONNECTORS_LIVE=1 and Google keys?).")
    now = time.monotonic()
    for k in [k for k, (_, exp) in _states.items() if exp < now]:
        del _states[k]
    state = secrets.token_urlsafe(24)
    _states[state] = (userId, now + STATE_TTL_S)
    q = {
        "client_id": get_settings().google_client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    url = html.escape(f"{AUTH_URL}?{urlencode(q)}")
    return HTMLResponse(
        f'<!doctype html><meta charset=utf-8><meta http-equiv="refresh" content="0;url={url}">'
        f"<title>Link Google Calendar</title>"
        f'<p>Linking Google Calendar for {html.escape(userId)}. <a href="{url}">Continue to Google</a></p>'
    )


@router.get("/internal/v1/connectors/{provider}/callback", operation_id="connectorOAuthCallback")
async def callback(provider: str, state: str, code: str | None = None, error: str | None = None):
    entry = _states.pop(state, None)  # popped first: a state works once, even if the rest fails
    if provider != PROVIDER or entry is None or entry[1] < time.monotonic():
        raise ApiError(400, "validation_failed", "That link expired or was already used. Open the link page again.")
    uid = entry[0]
    if error or not code:
        return _page("Not linked", f"Google didn't link {html.escape(uid)}. Open the link page to try again.", 400)
    try:
        tok = await _token({"grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT_URI})
    except (httpx.HTTPError, ValueError, KeyError) as e:
        log.warning("google token exchange failed for %s: %s", uid, type(e).__name__)
        return _page("Not linked", "Google didn't accept that sign-in. Open the link page to try again.", 502)
    _load()[uid] = tok
    _save()
    log.info("linked google_calendar for %s", uid)
    if PROVIDER in store.users.get(uid, {}).get("connectors", {}):
        await refresh(uid, force=True)
    return _page("Linked", f"Linked {html.escape(uid)}. Connected. You can close this tab.")


async def _token(form: dict) -> dict:
    """POST the token endpoint; returns the stored shape. A refresh keeps the old refresh_token."""
    s = get_settings()
    async with httpx.AsyncClient(transport=transport, timeout=10) as c:
        r = await c.post(
            TOKEN_URL, data={**form, "client_id": s.google_client_id, "client_secret": s.google_client_secret}
        )
    r.raise_for_status()
    j = r.json()
    return {
        "access_token": j["access_token"],
        "refresh_token": j.get("refresh_token") or form.get("refresh_token"),
        "expires_at": time.time() + int(j.get("expires_in", 3600)),
    }


def _z(s: str) -> str:
    return datetime.fromisoformat(s).astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


async def fetch_busy(uid: str) -> list[dict]:
    """The user's real busy blocks as seed-shaped connector records. Raises on any Google/network error."""
    tokens = _load()
    tok = tokens[uid]
    if tok["expires_at"] < time.time() + 60:
        if not tok.get("refresh_token"):
            raise ValueError("token expired and no refresh_token")
        tokens[uid] = tok = await _token({"grant_type": "refresh_token", "refresh_token": tok["refresh_token"]})
        _save()
    start = datetime.now(UTC)
    end = start + timedelta(days=get_settings().params["calendar"]["horizonDays"])
    body = {"timeMin": _z(start.isoformat()), "timeMax": _z(end.isoformat()), "items": [{"id": "primary"}]}
    async with httpx.AsyncClient(transport=transport, timeout=10) as c:
        r = await c.post(FREEBUSY_URL, json=body, headers={"Authorization": f"Bearer {tok['access_token']}"})
    r.raise_for_status()
    cal = r.json()["calendars"]["primary"]
    if cal.get("errors"):
        raise ValueError(f"freeBusy errors: {[e.get('reason') for e in cal['errors']]}")
    out = []
    for b in cal.get("busy", []):  # start/end only; freeBusy carries no titles or attendees (P10)
        at, e = _z(b["start"]), _z(b["end"])
        rid = "cr_gcal_" + hashlib.sha256(f"{uid}|{at}|{e}".encode()).hexdigest()[:10]
        out.append({"recordId": rid, "userId": uid, "provider": PROVIDER, "kind": "busy", "at": at, "end": e})
    return out


async def refresh(uid: str, force: bool = False) -> bool:
    """Swap the user's google_calendar records for live ones (at most every calendar.liveRefreshMinS unless
    force) and re-derive if connected. False, with one log line, when it kept what was there."""
    if not linked(uid) or uid not in store.users:
        return False
    now = time.monotonic()
    if not force and now - _last.get(uid, -1e9) < get_settings().params["calendar"]["liveRefreshMinS"]:
        return False
    _last[uid] = now
    try:
        recs = await fetch_busy(uid)
    except (httpx.HTTPError, ValueError, KeyError) as e:
        log.warning("google calendar read failed for %s (%s); keeping seeded busy records", uid, type(e).__name__)
        return False
    # ponytail: after a later failure the last live records stay (not the seed); fine for a demo session
    store.records[uid] = [r for r in store.records.get(uid, []) if r["provider"] != PROVIDER] + recs
    if PROVIDER in store.users[uid]["connectors"]:
        await seed.derive(uid)
        changed(uid, "signals.updated", "me.updated")
    log.info("google calendar: %d live busy blocks for %s", len(recs), uid)
    return True


async def reapply_all() -> None:
    """After resetDemo: the snapshot holds seeded records, so put the live ones back for every linked user."""
    for uid in list(_load()):
        await refresh(uid, force=True)
