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


def test_empty_before_opt_in(world):
    world.users["u_maya"]["optedIn"] = False
    asyncio.run(nudges.refresh(world, "u_maya"))
    assert nudges.list_nudges(world, "u_maya") == []
