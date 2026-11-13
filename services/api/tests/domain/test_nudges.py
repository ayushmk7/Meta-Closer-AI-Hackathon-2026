"""Moment 1: Maya's strong visible signal -> a nudge for the demo's nudge plan; never from hidden/sensitive ones."""

import asyncio

from cg_api.domain import joins, nudges


def test_signal_nudge_points_at_the_demo_plan(world):
    world.demo["nudgePlanId"] = "pl_walk"
    asyncio.run(nudges.refresh(world, "u_maya"))
    [n] = nudges.list_nudges(world, "u_maya")
    assert n["planId"] == "pl_walk" and n["because"][0]["signalId"] == "si_0001"
    assert n["title"] and n["text"] and set(n["surfaces"]) >= {"plans", "home"}
    assert nudges.list_nudges(world, "u_maya", "events") == []
    asyncio.run(nudges.refresh(world, "u_maya"))  # one per signal
    assert len(nudges.list_nudges(world, "u_maya")) == 1
    assert "SECRET" not in str(nudges.list_nudges(world, "u_maya"))  # hidden + sensitive signal never nudges (P4)


def test_nudge_gone_after_join_or_dismiss_and_mute(world):
    asyncio.run(nudges.refresh(world, "u_maya"))
    [n] = nudges.list_nudges(world, "u_maya")
    world.demo_mode = False
    joins.join(world, "u_maya", n["planId"])
    assert nudges.list_nudges(world, "u_maya") == []
    joins.withdraw(world, "u_maya", n["planId"])
    nudges.dismiss(world, "u_maya", n["nudgeId"], "signal")
    asyncio.run(nudges.refresh(world, "u_maya"))
    assert nudges.list_nudges(world, "u_maya") == []


def test_nudge_gone_once_its_signal_is_hidden_or_deleted(world):
    asyncio.run(nudges.refresh(world, "u_maya"))
    [n] = nudges.list_nudges(world, "u_maya")
    sigs = world.users["u_maya"]["signals"]
    sig = next(s for s in sigs if s["signalId"] == n["because"][0]["signalId"])
    sig["visibility"] = "hidden"
    assert nudges.list_nudges(world, "u_maya") == []  # P4: its label is in `because`
    sig["visibility"] = "shown"
    assert nudges.list_nudges(world, "u_maya") == [n]
    sigs.remove(sig)
    assert nudges.list_nudges(world, "u_maya") == []


def test_empty_before_opt_in(world):
    world.users["u_maya"]["optedIn"] = False
    asyncio.run(nudges.refresh(world, "u_maya"))
    assert nudges.list_nudges(world, "u_maya") == []


def test_nudge_copy_is_stable_per_nudge_while_reasons_still_upgrade(world, monkeypatch):
    """MuseCopy answers the template first and Muse's text later. Card reasons take the upgrade; a nudge keeps the
    copy it was first served with, so its wording never swaps while the user is looking (e2e-fable #24)."""
    from cg_api import ports
    from cg_api.domain import plans

    calls = {"n": 0}

    class Copy(ports.StubCopy):
        async def plan_reason(self, plan, shared):
            calls["n"] += 1
            return "template" if calls["n"] == 1 else "Muse's line"

        async def nudge(self, label, plan):
            return ("T1", "x1") if calls["n"] < 2 else ("Muse title?", "Muse text.")

    monkeypatch.setattr(ports.ports, "copy", Copy())
    asyncio.run(nudges.refresh(world, "u_maya"))
    [first] = nudges.list_nudges(world, "u_maya")
    asyncio.run(plans.warm_reasons(world, "u_maya", ["pl_hero"]))
    assert plans.card(world, "u_maya", world.plans["pl_hero"])["reason"] == "template"
    asyncio.run(plans.warm_reasons(world, "u_maya", ["pl_hero"]))
    assert plans.card(world, "u_maya", world.plans["pl_hero"])["reason"] == "Muse's line"
    asyncio.run(nudges.refresh(world, "u_maya"))  # Copy would now answer Muse's text
    assert nudges.list_nudges(world, "u_maya") == [first] and (first["title"], first["text"]) == ("T1", "x1")
