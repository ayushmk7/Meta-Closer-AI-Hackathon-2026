"""Live Google Calendar free/busy with a stubbed Google (no network)."""

import asyncio
import dataclasses
import json
import logging
import os
import time
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from cg_api.internal import gcal
from cg_api.settings import get_settings
from cg_api.store import store

LINK = "/internal/v1/connectors/google_calendar/link"
CB = "/internal/v1/connectors/google_calendar/callback"
BUSY = [{"start": "2026-11-14T17:00:00Z", "end": "2026-11-14T19:00:00Z"}]


@pytest.fixture
def google(monkeypatch, tmp_path):
    live = dataclasses.replace(
        get_settings(), connectors_live=True, google_client_id="cid", google_client_secret="SECRET"
    )
    monkeypatch.setattr(gcal, "get_settings", lambda: live)
    monkeypatch.setattr(gcal, "TOKENS", tmp_path / "tokens.json")
    monkeypatch.setattr(gcal, "_tokens", None)
    monkeypatch.setattr(gcal, "_states", {})
    monkeypatch.setattr(gcal, "_last", {})
    g = {"calls": [], "fail": False, "n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        g["calls"].append(req)
        if g["fail"]:
            return httpx.Response(500)
        if req.url == gcal.TOKEN_URL:
            g["n"] += 1
            form = parse_qs(req.content.decode())
            rt = {"refresh_token": "RT"} if form["grant_type"] == ["authorization_code"] else {}
            return httpx.Response(200, json={"access_token": f"AT{g['n']}", "expires_in": 3600, **rt})
        assert req.url == gcal.FREEBUSY_URL and req.method == "POST"
        return httpx.Response(200, json={"calendars": {"primary": {"busy": BUSY}}})

    monkeypatch.setattr(gcal, "transport", httpx.MockTransport(handler))
    return g


def _link(internal, uid="u_maya") -> str:
    r = internal.get(LINK, params={"userId": uid})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    url = r.text.split('href="')[1].split('"')[0].replace("&amp;", "&")
    q = {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}
    assert url.startswith(gcal.AUTH_URL)
    assert q["client_id"] == "cid" and q["redirect_uri"] == gcal.REDIRECT_URI and q["response_type"] == "code"
    assert q["scope"] == gcal.SCOPE and q["access_type"] == "offline" and q["prompt"] == "consent"
    return q["state"]


def test_link_off_or_unknown_is_404(internal, google, monkeypatch):
    assert internal.get(LINK, params={"userId": "u_nobody"}).status_code == 404
    assert internal.get("/internal/v1/connectors/strava/link", params={"userId": "u_maya"}).status_code == 404
    monkeypatch.setattr(gcal, "get_settings", lambda: dataclasses.replace(get_settings(), connectors_live=False))
    assert internal.get(LINK, params={"userId": "u_maya"}).status_code == 404


def test_callback_links_once_and_hides_token(internal, google, caplog):
    caplog.set_level(logging.DEBUG)
    state = _link(internal)
    assert internal.get(CB, params={"code": "c", "state": "forged"}).status_code == 400
    r = internal.get(CB, params={"code": "c", "state": state})
    assert r.status_code == 200 and "Linked u_maya" in r.text
    assert internal.get(CB, params={"code": "c", "state": state}).status_code == 400  # single use
    stored = json.loads(gcal.TOKENS.read_text())["u_maya"]
    assert stored["refresh_token"] == "RT" and oct(os.stat(gcal.TOKENS).st_mode & 0o777) == "0o600"
    for secret in ("AT1", "RT", "SECRET"):
        assert secret not in r.text and secret not in caplog.text


def test_connect_uses_live_busy_and_refreshes_token(public, internal, google):
    internal.get(CB, params={"code": "c", "state": _link(internal)})
    public.post("/v1/optin", json={"mode": "city"})
    assert public.post("/v1/connectors/google_calendar").status_code == 200
    busy = [b for b in store.users["u_maya"]["busy"] if b["source"] == "google_calendar"]
    assert busy == [{"start": "2026-11-14T17:00:00Z", "end": "2026-11-14T19:00:00Z", "source": "google_calendar"}]
    item = next(i for i in public.get("/v1/connectors").json()["items"] if i["provider"] == "google_calendar")
    assert item["simulated"] is False
    # expired access token -> refresh grant, then freeBusy with the new token
    gcal._load()["u_maya"]["expires_at"] = time.time() - 1
    assert google["calls"][-1].headers["authorization"] == "Bearer AT1"
    assert asyncio.run(gcal.refresh("u_maya", force=True))
    assert parse_qs(google["calls"][-2].content.decode())["grant_type"] == ["refresh_token"]
    assert google["calls"][-1].headers["authorization"] == "Bearer AT2"
    # reset restores seeded records, then re-applies live ones
    assert internal.post("/internal/v1/demo/reset").status_code == 204
    assert {r["recordId"][:8] for r in store.records["u_maya"] if r["provider"] == "google_calendar"} == {"cr_gcal_"}


def test_fallbacks_keep_seeded_records(public, internal, google, monkeypatch):
    def gcal_records():
        return [r for r in store.records["u_maya"] if r["provider"] == "google_calendar"]

    seeded = gcal_records()
    public.post("/v1/optin", json={"mode": "city"})
    assert public.post("/v1/connectors/google_calendar").status_code == 200  # no token yet
    assert gcal_records() == seeded
    assert public.delete("/v1/connectors/google_calendar").status_code == 204
    internal.get(CB, params={"code": "c", "state": _link(internal)})
    google["fail"] = True  # Google down: connect keeps the seeded records
    assert public.post("/v1/connectors/google_calendar").status_code == 200
    assert gcal_records() == seeded
    assert any(b["start"] == seeded[0]["at"] for b in store.users["u_maya"]["busy"])
    monkeypatch.setattr(gcal, "get_settings", lambda: dataclasses.replace(get_settings(), connectors_live=False))
    n, gcal._last = len(google["calls"]), {}
    public.get("/v1/feed")
    assert len(google["calls"]) == n  # CONNECTORS_LIVE=0: Google never called
