"""Routes on the live world: real responses validate against openapi.yaml; Fail maps to the §7 envelope."""

from datetime import UTC, datetime

import pytest

from cg_api import contracts
from cg_api.domain import joins
from cg_api.domain import world as world_mod

MAYA, DAN = {"X-CG-User": "u_maya"}, {"X-CG-User": "u_dan"}


@pytest.fixture
def live(world, public):
    world_mod.current = world
    yield world
    world_mod.current = None  # contract tests expect the spec examples again


def ok(r, op_id):
    op = contracts.op_by_id(op_id)
    assert r.status_code == op.success[0], r.text
    contracts.validate(op, r.status_code, r.json() if r.content else None)
    return r.json() if r.content else None


def test_core_loop_over_http(live, public):
    feed = ok(public.get("/v1/feed", headers=MAYA), "getFeed")
    assert feed["plans"][0]["planId"] == "pl_walk"
    ok(public.get("/v1/plans/pl_hero", headers=MAYA), "getPlan")
    j = ok(public.post("/v1/plans/pl_hero/join", headers=MAYA), "joinPlan")
    if j["status"] == "interested":  # DEMO_MODE beat: "Muse is gathering people"; fire the timer here
        assert j["progress"] == {"joined": 3, "needed": 3} and j["meetupId"] is None
        joins.form(live, "pl_hero")
        j = ok(public.get("/v1/joins", headers=MAYA), "listJoins")["items"][0]
    assert j["status"] == "matched"
    ok(public.get("/v1/joins", headers=MAYA), "listJoins")
    m = ok(public.get(f"/v1/meetups/{j['meetupId']}", headers=MAYA), "getMeetup")
    ok(public.get("/v1/meetups", headers=MAYA), "listMeetups")
    th = m["threadId"]
    msg = ok(
        public.post(f"/v1/threads/{th}/messages", headers=DAN, json={"text": "hi!", "clientId": "c1"}), "sendMessage"
    )
    assert ok(public.get(f"/v1/threads/{th}", headers=MAYA), "getThread")["unreadCount"] == 1
    assert (
        ok(public.get(f"/v1/threads/{th}/messages", headers=MAYA), "listMessages")["items"][-1]["messageId"]
        == msg["messageId"]
    )
    ok(public.post(f"/v1/threads/{th}/read", headers=MAYA), "markThreadRead")
    ok(public.get("/v1/threads", headers=MAYA), "listThreads")
    ok(public.get("/v1/connections", headers=MAYA), "listConnections")
    ok(public.get("/v1/people/u_dan", headers=MAYA), "getPerson")
    ok(public.get("/v1/approvals", headers=MAYA), "listApprovals")
    ok(public.post("/v1/reports", headers=MAYA, json={"userId": "u_dan", "reason": "other"}), "report")
    ok(public.post("/v1/blocks", headers=MAYA, json={"userId": "u_dan"}), "block")
    ok(public.post(f"/v1/meetups/{j['meetupId']}/leave", headers=MAYA, json={}), "leaveMeetup")


def test_errors_use_envelope(live, public):
    r = public.get("/v1/plans/pl_nope", headers=MAYA)
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"
    live.users["u_maya"]["optedIn"] = False
    r = public.get("/v1/feed", headers=MAYA)
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_opted_in"
    r = public.get("/v1/feed", headers={"X-CG-User": "u_ghost"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthenticated"
    r = public.post("/v1/approvals/ap_x/decision", headers=MAYA, json={"decision": "maybe"})
    assert r.status_code == 400


def test_nudges_and_avatars_never_follow_a_spoofed_host(live, public):
    live.demo["nudgePlanId"] = "pl_walk"
    items = ok(public.get("/v1/nudges", headers=MAYA), "listNudges")["items"]
    assert items and items[0]["planId"] == "pl_walk"
    ok(public.get(f"/v1/plans/{items[0]['planId']}", headers=MAYA), "getPlan")  # the nudge opens a real plan
    ok(public.post(f"/v1/nudges/{items[0]['nudgeId']}/dismiss", headers=MAYA, json={"mute": "signal"}), "dismissNudge")
    if joins.join(live, "u_maya", "pl_hero")["status"] == "interested":
        joins.form(live, "pl_hero")
    evil = {**DAN, "Host": "evil.example"}
    m = ok(public.get("/v1/meetups", headers=evil), "listMeetups")["items"][0]
    ok(
        public.post(f"/v1/threads/{m['threadId']}/messages", headers=evil, json={"text": "hi", "clientId": "e1"}),
        "sendMessage",
    )
    seen = [str(d) for u, _, d in live.events] + [str(ok(public.get("/v1/threads", headers=MAYA), "listThreads"))]
    seen.append(str(m))
    assert not any("evil.example" in x for x in seen)  # P10: no client can point other phones' image loads elsewhere
    urls = [a["person"]["avatarUrl"] for a in m["attendees"] if a["person"]["avatarUrl"]]
    assert urls and all(u.startswith(live.base_url + "/static/avatars/") for u in urls)
    assert "localhost" not in live.base_url or live.base_url.startswith("http://127.0.0.1")


def test_own_lan_address_is_used_for_static_urls(live, public):
    if joins.join(live, "u_maya", "pl_hero")["status"] == "interested":
        joins.form(live, "pl_hero")
    m = ok(public.get("/v1/meetups", headers={**MAYA, "Host": "127.0.0.1:48000"}), "listMeetups")["items"][0]
    urls = [a["person"]["avatarUrl"] for a in m["attendees"] if a["person"]["avatarUrl"]]
    assert urls and all(u.startswith("http://127.0.0.1:48000/static/avatars/") for u in urls)


def test_social_routes_validate(live, public, monkeypatch):
    from cg_api import ports

    class Yes:
        async def ask(self, q, state):
            return 0.95, True

    monkeypatch.setattr(ports.ports, "laya", Yes())
    from fastapi.testclient import TestClient

    from cg_api.domain import meetups, verify

    live.demo["relaxCheckin"] = True
    anon = TestClient(public.app)  # listShares is public (security: [])
    s = ok(anon.get("/v1/shares"), "listShares")["items"][0]
    assert s["likedByMe"] is False and s["mine"] is False
    assert ok(public.put(f"/v1/shares/{s['shareId']}/like", headers=MAYA, json={"liked": True}), "likeShare")[
        "likedByMe"
    ]
    if joins.join(live, "u_maya", "pl_hero")["status"] == "interested":
        joins.form(live, "pl_hero")
    mt = next(iter(live.meetups))
    meetups.set_status(live, mt, "confirmed")
    m = ok(public.get(f"/v1/meetups/{mt}", headers=DAN), "getMeetup")
    loc = live.venues["vn_clay"]["location"]
    assert ok(public.post(f"/v1/meetups/{mt}/checkin", headers=MAYA, json={"location": loc}), "checkIn")["accepted"]
    r = ok(public.post(f"/v1/meetups/{mt}/verify", headers=MAYA, json={"code": m["verifyCode"]}), "verifyAttendee")
    assert r["accepted"] and verify.code(live, mt, "u_dan") == m["verifyCode"]
    live.now = lambda: datetime(2026, 11, 14, 18, 30, tzinfo=UTC)  # feedback opens once it started
    body = {"answers": [{"userId": "u_dan", "showedUp": True, "meetAgain": True}], "rating": 5, "tags": ["good_group"]}
    ok(public.post(f"/v1/meetups/{mt}/feedback", headers=MAYA, json=body), "sendFeedback")
    meetups.set_status(live, mt, "completed")
    live.meetups[mt]["endsAt"] = "2026-11-14T18:15:00Z"
    sh = ok(public.post(f"/v1/meetups/{mt}/share", headers=MAYA, json={"caption": "Lopsided bowls."}), "shareMeetup")
    assert sh["mine"] and not ok(anon.get("/v1/shares"), "listShares")["items"][0]["mine"]
    r = public.post(f"/v1/meetups/{mt}/share", headers=DAN, json={"caption": "x" * 141})
    assert r.status_code == 400


def test_create_plan_route(live, public, monkeypatch):
    from cg_api import ports

    monkeypatch.setattr(ports.ports, "muse", ports.StubMuse())
    r = public.post("/v1/plans", headers=MAYA, json={"text": "pottery saturday"})
    assert r.status_code == 200  # no first-meetup gate
    if joins.join(live, "u_maya", "pl_hero")["status"] == "interested":
        joins.form(live, "pl_hero")
    next(iter(live.meetups.values()))["members"]["u_maya"]["counted"] = True
    d = ok(
        public.post("/v1/plans", headers=MAYA, json={"text": "Sunday coastal walk at Lands End Trail this weekend"}),
        "createPlan",
    )
    assert d["venue"]["venueId"] == "vn_trail" and d["myJoin"]
    assert ok(public.get(f"/v1/plans/{d['planId']}", headers=MAYA), "getPlan")["planId"] == d["planId"]
