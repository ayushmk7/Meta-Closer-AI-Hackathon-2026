"""linkConnectorAccount, connectorOAuthCallback: link a real Google Calendar on the laptop (CONTRACTS Decisions).

Internal listener only (loopback, P9). Both answer with a small HTML page for the operator's browser.
"""

from __future__ import annotations

from html import escape

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from cg_api import live_calendar
from cg_api.errors import ApiError
from cg_api.settings import get_settings
from cg_api.store import store

router = APIRouter()


def _page(title: str, body: str, head: str = "") -> HTMLResponse:
    return HTMLResponse(
        f'<!doctype html><html><head><meta charset="utf-8"><title>{escape(title)}</title>{head}</head>'
        f'<body style="font-family:system-ui;max-width:32rem;margin:3rem auto;line-height:1.5">{body}</body></html>'
    )


def _check(provider: str) -> None:
    if provider != live_calendar.PROVIDER or not live_calendar.enabled():
        raise ApiError(404, "not_found", "No live mode for that app (set CONNECTORS_LIVE=1 and the Google client).")


@router.get("/internal/v1/connectors/{provider}/link", operation_id="linkConnectorAccount")
def link_connector_account(provider: str, userId: str):
    _check(provider)
    if userId not in store.users:
        raise ApiError(404, "not_found", "We don't know that user.")
    url = escape(live_calendar.auth_url(userId), quote=True)
    return _page(
        "Link Google Calendar",
        f"<p>Taking you to Google to link a calendar for <b>{escape(userId)}</b>.</p>"
        f'<p><a href="{url}">Continue to Google</a></p>',
        head=f'<meta http-equiv="refresh" content="0;url={url}">',
    )


@router.get("/internal/v1/connectors/{provider}/callback", operation_id="connectorOAuthCallback")
async def connector_oauth_callback(provider: str, state: str, code: str | None = None, error: str | None = None):
    _check(provider)
    try:
        uid = live_calendar.take_state(state)
        if error or not code:
            raise live_calendar.LinkError(f"Google didn't link the account ({error or 'no code'}).")
        await live_calendar.exchange(uid, code)
    except live_calendar.LinkError as e:
        raise ApiError(400, "validation_failed", str(e)) from None
    await live_calendar.refresh(uid, force=True)
    connected = live_calendar.PROVIDER in store.users[uid].get("connectors", {})
    busy = sum(b["source"] == live_calendar.PROVIDER for b in store.users[uid]["busy"])
    days = get_settings().params["calendar"]["horizonDays"]
    note = (
        f"Using it now: {busy} busy blocks in the next {days} days."
        if connected
        else "Turn on Google Calendar in Common Ground settings on the phone to use it."
    )
    return _page("Linked", f"<p>Linked Google Calendar for <b>{escape(uid)}</b>.</p><p>{escape(note)}</p>")
