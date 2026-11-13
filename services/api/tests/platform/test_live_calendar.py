"""Live Google Calendar (CONTRACTS Decisions, P10): link on the laptop, connect on the phone, free/busy replaces the
seeded busy records, throttled refresh, fallback to seeded data. Google is an httpx.MockTransport here."""

import dataclasses
import re
import stat
import time
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from cg_api import live_calendar
from cg_api.domain import world
from cg_api.settings import get_settings
from cg_api.store import store

HERO = "pl_sf_hero_wheel"  # tiny seed: Sat 2026-11-14 18:00-20:00Z
CLASH = {"start": "2026-11-14T17:30:00Z", "end": "2026-11-14T20:30:00Z"}


class FakeGoogle:
    def __init__(self):
        self.busy = [CLASH]
        self.freebusy_calls = 0
        self.freebusy_status = 200
        self.refresh_ok = True
        self.access_tokens = 0

    def __call__(self, req: httpx.Request) -> httpx.Response:
        if req.url.path == "/token":
            form = parse_qs(req.content.decode())
            assert form["client_secret"] == ["sec"]
            if form["grant_type"] == ["authorization_code"]:
                assert form["code"] == ["good-code"]
                return httpx.Response(200, json={"access_token": "at1", "expires_in": 3599, "refresh_token": "rt1"})
            if not self.refresh_ok:
                return httpx.Response(400, json={"error": "invalid_grant"})
            self.access_tokens += 1
            return httpx.Response(200, json={"access_token": f"at{self.access_tokens + 1}", "expires_in": 3599})
        if req.url.path == "/calendar/v3/freeBusy":
            self.freebusy_calls += 1
            assert req.headers["authorization"].startswith("Bearer at")
            if self.freebusy_status != 200:
                return httpx.Response(self.freebusy_status, json={"error": {"code": self.freebusy_status}})
            return httpx.Response(200, json={"calendars": {"primary": {"busy": self.busy}}})
        return httpx.Response(404)


@pytest.fixture
def google(monkeypatch, tmp_path):
    fake = FakeGoogle()
    live = dataclasses.replace(get_settings(), connectors_live=True, google_client_id="cid", google_client_secret="sec")
    monkeypatch.setattr(live_calendar, "get_settings", lambda: live)
    monkeypatch.setattr(live_calendar, "TOKEN_DIR", tmp_path / "tokens")
    monkeypatch.setattr(live_calendar, "transport", httpx.MockTransport(fake))
    live_calendar.reset_state()
    yield fake
    live_calendar.reset_state()


def link(internal, uid="u_maya", code="good-code"):
    page = internal.get("/internal/v1/connectors/google_calendar/link", params={"userId": uid})
    assert page.status_code == 200 and "text/html" in page.headers["content-type"]
    url = re.search(r'href="([^"]+)"', page.text).group(1).replace("&amp;", "&")
    q = parse_qs(urlparse(url).query)
    assert url.startswith(live_calendar.AUTH_URL)
    assert q["scope"] == [live_calendar.SCOPE] and q["client_id"] == ["cid"]
    assert q["redirect_uri"] == ["http://127.0.0.1:9001/internal/v1/connectors/google_calendar/callback"]
    return internal.get(
        "/internal/v1/connectors/google_calendar/callback", params={"state": q["state"][0], "code": code}
    ), q["state"][0]


def connect_maya(api):
    api("optIn", json={"mode": "city"})
    return api("connectConnector", "/v1/connectors/google_calendar").json()


def calendar_check(api, plan_id=HERO):
    return next(c for c in api("getPlan", f"/v1/plans/{plan_id}").json()["checks"] if c["kind"] == "calendar")


def gcal_busy(uid="u_maya"):
    return sorted((b["start"], b["end"]) for b in store.users[uid]["busy"] if b["source"] == "google_calendar")


def test_off_by_default(api):
    r = api("linkConnectorAccount", "/internal/v1/connectors/google_calendar/link", params={"userId": "u_maya"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_link_rejects_unknown_user_and_provider(google, api):
    gcal, strava = "/internal/v1/connectors/google_calendar/link", "/internal/v1/connectors/strava/link"
    assert api("linkConnectorAccount", gcal, params={"userId": "u_nobody"}).status_code == 404
    assert api("linkConnectorAccount", strava, params={"userId": "u_maya"}).status_code == 404


def test_seeded_until_linked(google, api):
    c = connect_maya(api)
    assert c["simulated"] is True
    first = next(r for r in store.records["u_maya"] if r["provider"] == "google_calendar")
    assert first["recordId"].startswith("cr_maya")
    assert calendar_check(api)["ok"] is True
    assert google.freebusy_calls == 0


def test_link_then_connect_uses_real_busy(google, api, internal, tmp_path):
    page, _ = link(internal)
    assert page.status_code == 200 and "Linked Google Calendar for <b>u_maya</b>" in page.text
    token = tmp_path / "tokens" / "u_maya.json"
    assert token.exists() and stat.S_IMODE(token.stat().st_mode) == 0o600

    c = connect_maya(api)
    assert c["simulated"] is False and c["status"] == "connected"
    assert gcal_busy() == [(CLASH["start"], CLASH["end"])]
    recs = [r for r in store.records["u_maya"] if r["provider"] == "google_calendar"]
    assert [r["recordId"] for r in recs] == ["cr_live_u_maya_001"]  # seeded records replaced
    check = calendar_check(api)
    assert check["ok"] is False and check["label"] == "You're busy Saturday"

    # Only the linked user changes: another user keeps seeded data and sees google_calendar as simulated.
    other = {"X-CG-User": "u_0098"}
    api("optIn", json={"mode": "city"}, headers=other)
    rows = api("listConnectors", headers=other).json()["items"]
    assert next(r for r in rows if r["provider"] == "google_calendar")["simulated"] is True


def test_link_after_connect_applies_now(google, api, internal):
    connect_maya(api)
    page, _ = link(internal)
    assert "Using it now: 1 busy blocks" in page.text
    assert gcal_busy() == [(CLASH["start"], CLASH["end"])]


def test_state_is_single_use(google, internal):
    page, state = link(internal)
    assert page.status_code == 200
    again = internal.get(
        "/internal/v1/connectors/google_calendar/callback", params={"state": state, "code": "good-code"}
    )
    assert again.status_code == 400 and again.json()["error"]["code"] == "validation_failed"


def test_denied_consent(google, internal):
    page = internal.get("/internal/v1/connectors/google_calendar/link", params={"userId": "u_maya"})
    state = parse_qs(urlparse(re.search(r'href="([^"]+)"', page.text).group(1).replace("&amp;", "&")).query)["state"][0]
    r = internal.get(
        "/internal/v1/connectors/google_calendar/callback", params={"state": state, "error": "access_denied"}
    )
    assert r.status_code == 400 and "access_denied" in r.json()["error"]["message"]
    assert not live_calendar.linked("u_maya")


def test_refresh_is_throttled_and_drops_clashing_plans(google, api, internal):
    link(internal)
    google.busy = []
    connect_maya(api)
    calls = google.freebusy_calls
    assert calendar_check(api)["ok"] is True

    google.busy = [CLASH]  # the operator adds an event on stage
    api("getFeed")
    assert google.freebusy_calls == calls  # within liveRefreshMinS: no new read

    live_calendar._last_refresh["u_maya"] = time.monotonic() - 61
    events = len(world.current.events)
    api("getFeed")
    assert google.freebusy_calls == calls + 1
    assert len(world.current.events) > events  # ranking cache key moved, so clashing plans drop out
    assert calendar_check(api)["label"] == "You're busy Saturday"


def test_google_down_keeps_seeded(google, api, internal):
    link(internal)
    google.freebusy_status = 500
    c = connect_maya(api)
    assert c["status"] == "connected"
    assert all(
        r["recordId"].startswith("cr_maya") for r in store.records["u_maya"] if r["provider"] == "google_calendar"
    )
    assert api("getFeed").status_code == 200


def test_expired_refresh_token_keeps_last_good(google, api, internal):
    link(internal)
    connect_maya(api)
    assert gcal_busy() == [(CLASH["start"], CLASH["end"])]
    tok = live_calendar._load("u_maya")
    live_calendar._save("u_maya", {**tok, "expires_at": 0})  # force a refresh
    google.refresh_ok = False
    google.busy = []
    live_calendar._last_refresh["u_maya"] = time.monotonic() - 61
    assert api("getFeed").status_code == 200
    assert gcal_busy() == [(CLASH["start"], CLASH["end"])]


def test_disconnect_drops_live_busy(google, api, internal):
    link(internal)
    connect_maya(api)
    assert api("disconnectConnector", "/v1/connectors/google_calendar").status_code == 204
    assert gcal_busy() == []
    api("getFeed")  # not connected: no refresh, nothing comes back
    assert gcal_busy() == []


def test_reset_restores_seeded_and_keeps_token(google, api, internal):
    link(internal)
    connect_maya(api)
    assert internal.post("/internal/v1/demo/reset").status_code == 204
    assert all(
        r["recordId"].startswith("cr_maya") for r in store.records["u_maya"] if r["provider"] == "google_calendar"
    )
    assert live_calendar.linked("u_maya")  # reconnecting after reset reads Google again
    assert connect_maya(api)["simulated"] is False
    assert gcal_busy() == [(CLASH["start"], CLASH["end"])]
