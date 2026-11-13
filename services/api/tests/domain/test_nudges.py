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


def _copy(monkeypatch, answers):
    """A Copy whose nudge() pops the next answer; "pending" stands for Muse's text still being fetched."""
    from cg_api import ports

    asked = []

    class Copy(ports.StubCopy):
        async def nudge(self, label, plan, unless_pending=False):
            asked.append(unless_pending)
            a = answers.pop(0) if len(answers) > 1 else answers[0]
            return None if a == "pending" and unless_pending else ("T1", "x1") if a == "pending" else a

    monkeypatch.setattr(ports.ports, "copy", Copy())
    return asked


def test_demo_nudge_waits_unseen_for_muse_then_never_changes(world, monkeypatch):
    """e2e-fable #24: Muse's wording when it lands, and no swap after the nudge is first served."""
    asked = _copy(monkeypatch, ["pending", "pending", ("Muse title?", "Muse text."), ("Other?", "Other.")])
    asyncio.run(nudges.refresh(world, "u_maya"))
    assert nudges.list_nudges(world, "u_maya") == []  # waiting for Muse: not shown with the template
    asyncio.run(nudges.refresh(world, "u_maya"))
    assert nudges.list_nudges(world, "u_maya") == []
    asyncio.run(nudges.refresh(world, "u_maya"))
    [n] = nudges.list_nudges(world, "u_maya")
    assert (n["title"], n["text"]) == ("Muse title?", "Muse text.") and set(asked) == {True}
    asyncio.run(nudges.refresh(world, "u_maya"))  # Copy would answer differently now: never asked again
    assert nudges.list_nudges(world, "u_maya") == [n] and len(asked) == 3
    assert [t for _, t, _ in world.events].count("nudge.created") == 1  # announced once, when it became visible


def test_nudge_copy_is_fixed_at_creation_outside_demo_mode(world, monkeypatch):
    world.demo_mode = False
    asked = _copy(monkeypatch, ["pending", ("Muse title?", "Muse text.")])
    asyncio.run(nudges.refresh(world, "u_maya"))
    [n] = nudges.list_nudges(world, "u_maya")
    asyncio.run(nudges.refresh(world, "u_maya"))
    assert nudges.list_nudges(world, "u_maya") == [n] and (n["title"], n["text"]) == ("T1", "x1") and asked == [False]


def test_card_reasons_still_upgrade_from_template_to_muse(world, monkeypatch):
    """Only nudges are frozen: a card reason re-asks Copy and shows Muse's line once it is cached."""
    from cg_api import ports
    from cg_api.domain import plans

    calls = {"n": 0}

    class Copy(ports.StubCopy):
        async def plan_reason(self, plan, shared):
            calls["n"] += 1
            return "template" if calls["n"] == 1 else "Muse's line"

    monkeypatch.setattr(ports.ports, "copy", Copy())
    asyncio.run(plans.warm_reasons(world, "u_maya", ["pl_hero"]))
    assert plans.card(world, "u_maya", world.plans["pl_hero"])["reason"] == "template"
    asyncio.run(plans.warm_reasons(world, "u_maya", ["pl_hero"]))
    assert plans.card(world, "u_maya", world.plans["pl_hero"])["reason"] == "Muse's line"
