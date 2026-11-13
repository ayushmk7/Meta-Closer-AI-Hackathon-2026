"""Live Google Calendar: free/busy from a real account the demo operator linked (CONTRACTS P10, Decisions).

Off unless CONNECTORS_LIVE=1. A user without a linked account keeps the seeded `google_calendar` records.
Tokens live in services/api/.cache/tokens/ (gitignored) and never reach a client. Only busy start/end is read.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode

import httpx

from cg_api.settings import get_settings
from cg_api.store import store

log = logging.getLogger("cg_api.live_calendar")

PROVIDER = "google_calendar"
SCOPE = "https://www.googleapis.com/auth/calendar.freebusy"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy"
TOKEN_DIR = Path(__file__).resolve().parents[2] / ".cache" / "tokens" / PROVIDER
STATE_TTL_S = 600
TIMEOUT_S = 8.0

transport: httpx.AsyncBaseTransport | None = None  # tests swap in httpx.MockTransport
_states: dict[str, tuple[str, float]] = {}  # OAuth state -> (userId, created)
_last_refresh: dict[str, float] = {}
_locks: dict[str, asyncio.Lock] = {}


class LinkError(Exception):
    """A link or callback step failed; the message is safe to show on the laptop page."""


# ---------- configuration ----------
def enabled() -> bool:
    s = get_settings()
    return s.connectors_live and bool(s.google_client_id) and bool(s.google_client_secret)


def redirect_uri() -> str:
    s = get_settings()
    return f"http://{s.internal_host}:{s.internal_port}/internal/v1/connectors/{PROVIDER}/callback"


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=TIMEOUT_S, transport=transport)


# ---------- token storage ----------
def _token_path(uid: str) -> Path:
    return TOKEN_DIR / f"{uid}.json"


def linked(uid: str) -> bool:
    return enabled() and _token_path(uid).exists()


def _load(uid: str) -> dict | None:
    try:
        return json.loads(_token_path(uid).read_text())
    except (FileNotFoundError, ValueError):
        return None


def _save(uid: str, tok: dict) -> None:
    TOKEN_DIR.mkdir(parents=True, exist_ok=True)
    path = _token_path(uid)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(tok, f)


# ---------- OAuth ----------
def auth_url(uid: str) -> str:
    now = time.time()
    for k in [k for k, (_, t) in _states.items() if now - t > STATE_TTL_S]:
        del _states[k]
    state = secrets.token_urlsafe(24)
    _states[state] = (uid, now)
    q = {
        "client_id": get_settings().google_client_id,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",  # always returns a refresh token, also when re-linking
        "state": state,
    }
    return f"{AUTH_URL}?{urlencode(q)}"


def take_state(state: str) -> str:
    """The userId this state was issued for; each state works once and expires after STATE_TTL_S."""
    uid, created = _states.pop(state, (None, 0.0))
    if uid is None or time.time() - created > STATE_TTL_S:
        raise LinkError("This sign-in link expired or was already used. Open the link page again.")
    return uid


async def exchange(uid: str, code: str) -> None:
    s = get_settings()
    data = {
        "client_id": s.google_client_id,
        "client_secret": s.google_client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri(),
    }
    async with _client() as c:
        r = await c.post(TOKEN_URL, data=data)
    body = _json(r)
    if r.status_code != 200 or "refresh_token" not in body:
        log.warning("live calendar: token exchange failed for %s: HTTP %s %s", uid, r.status_code, body.get("error"))
        raise LinkError("Google didn't accept the sign-in. Open the link page and try again.")
    _save(uid, _token_record(body, body["refresh_token"]))
    log.info("live calendar: linked a Google account for %s", uid)


def _token_record(body: dict, refresh_token: str) -> dict:
    return {
        "refresh_token": refresh_token,
        "access_token": body.get("access_token", ""),
        "expires_at": time.time() + float(body.get("expires_in", 0)) - 60,
    }


async def _access_token(c: httpx.AsyncClient, uid: str) -> str | None:
    tok = _load(uid)
    if not tok or not tok.get("refresh_token"):
        return None
    if tok.get("access_token") and tok.get("expires_at", 0) > time.time():
        return tok["access_token"]
    s = get_settings()
    r = await c.post(
        TOKEN_URL,
        data={
            "client_id": s.google_client_id,
            "client_secret": s.google_client_secret,
            "refresh_token": tok["refresh_token"],
            "grant_type": "refresh_token",
        },
    )
    body = _json(r)
    if r.status_code != 200 or "access_token" not in body:
        # invalid_grant = the refresh token expired (7 days in Testing mode) or was revoked: link again.
        log.warning("live calendar: token refresh failed for %s (%s); link the account again", uid, body.get("error"))
        return None
    _save(uid, _token_record(body, body.get("refresh_token", tok["refresh_token"])))
    return body["access_token"]


def _json(r: httpx.Response) -> dict:
    try:
        body = r.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


# ---------- free/busy -> connector records ----------
def _z(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


async def fetch_busy(uid: str) -> list[dict] | None:
    """Busy blocks on the primary calendar for the next calendar.horizonDays, or None on any failure."""
    now = datetime.now(UTC)
    horizon = get_settings().params["calendar"]["horizonDays"]
    try:
        async with _client() as c:
            access = await _access_token(c, uid)
            if not access:
                return None
            r = await c.post(
                FREEBUSY_URL,
                headers={"Authorization": f"Bearer {access}"},
                json={"timeMin": _z(now), "timeMax": _z(now + timedelta(days=horizon)), "items": [{"id": "primary"}]},
            )
    except httpx.HTTPError as e:
        log.warning("live calendar: freeBusy request failed for %s: %s", uid, type(e).__name__)
        return None
    cal = _json(r).get("calendars", {}).get("primary", {})
    if r.status_code != 200 or cal.get("errors"):
        log.warning("live calendar: freeBusy error for %s: HTTP %s %s", uid, r.status_code, cal.get("errors"))
        return None
    return [{"start": b["start"], "end": b["end"]} for b in cal.get("busy", []) if b.get("start") and b.get("end")]


def _records(uid: str, busy: list[dict]) -> list[dict]:
    """connector_record.schema.json rows; recordId must match ^cr_[a-z0-9_]+$."""
    tag = "".join(ch if ch.isalnum() else "_" for ch in uid.lower())
    return [
        {
            "recordId": f"cr_live_{tag}_{i:03d}",
            "userId": uid,
            "provider": PROVIDER,
            "kind": "busy",
            "at": _z(datetime.fromisoformat(b["start"])),
            "end": _z(datetime.fromisoformat(b["end"])),
        }
        for i, b in enumerate(sorted(busy, key=lambda b: b["start"]), 1)
    ]


async def apply(uid: str) -> bool:
    """Replace the user's google_calendar records with live ones. False (records untouched) when not linked or
    on any failure, so seeded records stay until a fetch succeeds and the last good live data stays after one."""
    if not linked(uid) or uid not in store.users:
        return False
    _last_refresh[uid] = time.monotonic()
    busy = await fetch_busy(uid)
    if busy is None:
        log.warning("live calendar: keeping current google_calendar records for %s (fallback, D4)", uid)
        return False
    live = _records(uid, busy)
    others = [r for r in store.records.get(uid, []) if r["provider"] != PROVIDER]
    store.records[uid] = others + live
    log.info("live calendar: %d busy blocks for %s", len(live), uid)
    return True


def _connected(uid: str) -> bool:
    u = store.users.get(uid)
    return bool(u and u.get("optedIn") and PROVIDER in u.get("connectors", {}))


async def refresh(uid: str, *, force: bool = False) -> None:
    """Re-read a linked, connected calendar at most every calendar.liveRefreshMinS (unless force), re-derive, and
    let the ranking see it. Never raises: the feed must not fail because Google did."""
    if not _connected(uid) or not linked(uid):
        return
    lock = _locks.setdefault(uid, asyncio.Lock())
    async with lock:
        every = get_settings().params["calendar"].get("liveRefreshMinS", 60)
        last = _last_refresh.get(uid)
        if not force and last is not None and time.monotonic() - last < every:
            return
        try:
            before = sorted((b["start"], b["end"]) for b in store.users[uid]["busy"] if b["source"] == PROVIDER)
            if not await apply(uid):
                return
            from cg_api import seed

            await seed.derive(uid)
            after = sorted((b["start"], b["end"]) for b in store.users[uid]["busy"] if b["source"] == PROVIDER)
            if after != before:
                _invalidate_ranking(uid)
        except Exception:  # D4: log and keep the demo moving
            log.exception("live calendar: refresh failed for %s", uid)


def _invalidate_ranking(uid: str) -> None:
    """The plan ranking is cached until the World's event count changes; World.emit appends an event (and pushes
    me.updated, a contract event the app already handles) so plans that now clash drop out of the feed."""
    from cg_api.domain import world

    w = world.current
    if w is not None:
        w.emit(uid, "me.updated")


def reset_state() -> None:
    """Forget throttles and pending sign-ins (tests). Tokens on disk are kept."""
    _states.clear()
    _last_refresh.clear()
    _locks.clear()
