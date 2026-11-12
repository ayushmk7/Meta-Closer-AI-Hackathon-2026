"""Checkpoint A: join -> group forms -> synthetic counterparts approve -> Maya approves -> booked and confirmed."""

import pytest
from domain.fixture_world import world  # noqa: F401  (pytest fixture)

from cg_api import synthetic
from cg_api.domain import approvals, joins, runner


@pytest.fixture
def hooked(world, monkeypatch):  # noqa: F811
    state = {"counterpart": "synthetic", "liveUserId": "u_dan", "forcedYes": True}
    monkeypatch.setattr(synthetic, "_demo_state", lambda: state)
    if not hasattr(world, "on_approval"):  # ponytail: until C's approvals.add calls world.on_approval
        add = approvals.add
        monkeypatch.setattr(approvals, "add", lambda w, a: (add(w, a), synthetic.on_approval(w, a))[0])
    world.on_formed, world.on_decided = runner.start, runner.decided  # the fixture stubs the agent out
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
