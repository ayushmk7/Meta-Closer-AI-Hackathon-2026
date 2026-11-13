"""Checkpoint A: join -> group forms -> synthetic counterparts approve -> Maya approves -> booked and confirmed."""

import pytest
from domain.fixture_world import world  # noqa: F401  (pytest fixture)

from cg_api import synthetic
from cg_api.domain import approvals, joins, runner


@pytest.fixture
def hooked(world, monkeypatch):  # noqa: F811
    state = {"counterpart": "synthetic", "liveUserId": "u_dan", "forcedYes": True}
    monkeypatch.setattr(synthetic, "_demo_state", lambda: state)
    # the fixture stubs the agent and the counterparts out
    world.on_formed, world.on_decided, world.on_approval = runner.start, runner.decided, synthetic.on_approval
    for u in ("u_dan", "u_rosa"):
        world.users[u]["synthetic"] = True
    world.params = {**world.params, "demo": {**world.params["demo"], "stepDelayS": [0, 0], "syntheticDelayS": [0, 0]}}
    return world, state


def test_hero_plan_reaches_confirmed(hooked):
    w, _ = hooked
    mt = joins.join(w, "u_maya", "pl_hero")["meetupId"]
    m = w.meetups[mt]
    assert m["status"] == "setting_up"
    [mine] = [a for a in w.approvals.values() if a["userId"] == "u_maya"]
    assert all(a["status"] == "approved" for a in w.approvals.values() if a["userId"] != "u_maya")
    approvals.decide(w, "u_maya", mine["approvalId"], "approve")
    assert m["status"] == "confirmed" and m["booking"]["status"] == "booked"
    assert [s["kind"] for s in m["steps"]][-4:] == ["book", "calendar", "event", "reminder"]


def test_live_phone_answers_for_itself(hooked):
    w, state = hooked
    state["counterpart"] = "live"
    mt = joins.join(w, "u_maya", "pl_hero")["meetupId"]
    pending = {a["userId"] for a in w.approvals.values() if a["status"] == "pending"}
    assert pending == {"u_maya", "u_dan"} and w.meetups[mt]["status"] == "setting_up"


def test_counterpart_answers_in_chat(hooked):
    from cg_api.domain import chat

    w, state = hooked
    w.on_message = synthetic.on_message
    tid = w.meetups[joins.join(w, "u_maya", "pl_hero")["meetupId"]]["threadId"]
    n = len(w.threads[tid]["messages"])
    chat.send(w, "u_maya", tid, "Excited to meet you all!", "c1")
    [r] = w.threads[tid]["messages"][n + 1 :]  # exactly one reply
    assert r["sender"]["userId"] in {"u_dan", "u_rosa"} and r["text"] in synthetic.CHAT_LINES
    state["counterpart"], state["liveUserId"] = "live", r["sender"]["userId"]
    chat.send(w, "u_maya", tid, "Muse, what's the address?", "c2")  # toMuse goes to Muse, not the counterparts
    chat.send(w, "u_maya", tid, "See you soon", "c3")
    assert all(m["sender"]["userId"] != state["liveUserId"] for m in w.threads[tid]["messages"][n + 2 :])
