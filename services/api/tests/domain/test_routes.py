"""Routes on the live world: real responses validate against openapi.yaml; Fail maps to the §7 envelope."""

import pytest

from cg_api import contracts
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
