"""domain.runner applies ScriptedRun events to the store; P11 is re-checked there."""

import pytest

from cg_api.domain import approvals, chat, joins, meetups, runner
from cg_api.domain.world import Fail


def formed(world):
    return joins.join(world, "u_maya", "pl_hero")["meetupId"]


def test_paid_event_without_approval_is_refused(world):
    mt = formed(world)
    with pytest.raises(Fail):
        runner.apply(world, mt, {"type": "payment", "userId": "u_maya", "myPayment": "paid"})
    assert world.meetups[mt]["members"]["u_maya"]["payment"] == "pending_approval"


def test_events_update_the_meetup(world):
    mt = formed(world)
    step = {
        "stepId": "st_9001",
        "kind": "payment",
        "status": "needs_you",
        "label": "Waiting for you to OK $35",
        "detail": None,
        "approvalId": "ap_9001",
        "at": "2026-11-12T18:00:00Z",
        "forUserId": "u_rosa",
    }
    runner.apply(world, mt, {"type": "step", "step": step})
    runner.apply(
        world,
        mt,
        {
            "type": "approval",
            "approval": {
                "approvalId": "ap_9001",
                "meetupId": mt,
                "kind": "payment",
                "status": "pending",
                "title": "OK $35?",
                "detail": "d",
                "amountCents": 3500,
                "currency": "USD",
                "payee": "Clay Hour Studio",
                "simulated": True,
                "fallback": "f",
                "expiresAt": "2026-11-13T06:00:00Z",
                "userId": "u_rosa",
            },
        },
    )
    assert meetups.view(world, "u_maya", mt)["museSteps"] == []  # Rosa's payment step is hers only (P6)
    assert [s["stepId"] for s in meetups.view(world, "u_rosa", mt)["museSteps"]] == ["st_9001"]
    approvals.decide(world, "u_rosa", "ap_9001", "approve")
    runner.apply(world, mt, {"type": "payment", "userId": "u_rosa", "myPayment": "paid"})
    runner.apply(
        world,
        mt,
        {
            "type": "booking",
            "booking": {
                "status": "booked",
                "label": "Booked · CH-1234",
                "provider": "Simulated booking",
                "confirmationCode": "CH-1234",
            },
        },
    )
    runner.apply(world, mt, {"type": "confirmed", "eventLabel": "Private event · 3 going"})
    v = meetups.view(world, "u_rosa", mt)
    assert (v["cost"]["myPayment"], v["status"], v["eventLabel"], v["calendar"]["desired"]) == (
        "paid",
        "confirmed",
        "Private event · 3 going",
        "event",
    )


def test_scripted_run_end_to_end(world):
    pytest.importorskip("cg_api.agent")
    world.on_formed, world.on_decided = runner.start, runner.decided
    mt = formed(world)
    for a in list(world.approvals.values()):
        approvals.decide(world, a["userId"], a["approvalId"], "approve")
    m = meetups.view(world, "u_maya", mt)
    assert m["status"] == "confirmed" and m["cost"]["myPayment"] == "paid" and m["booking"]["status"] == "booked"


def _steps(tag, n):
    for k in range(n):
        yield {
            "type": "step",
            "step": {
                "stepId": f"st_{tag}{k}",
                "kind": "book",
                "status": "done",
                "label": f"{tag}{k}",
                "detail": None,
                "approvalId": None,
                "at": "2026-11-12T18:00:00Z",
            },
        }


def test_one_driver_per_meetup_never_interleaves(world):
    import asyncio

    mt = formed(world)
    world.params["demo"]["stepDelayS"] = [0.01, 0.01]

    async def go():
        runner._enqueue(world, mt, _steps("a", 3))
        runner._enqueue(world, mt, _steps("b", 3))  # e.g. a second approval decided mid-run
        while world.run_queues[mt]:
            await asyncio.sleep(0.01)

    asyncio.run(go())
    assert [s["label"] for s in world.meetups[mt]["steps"]] == ["a0", "a1", "a2", "b0", "b1", "b2"]


def test_intro_and_starters_at_formation(world):
    world.on_formed = runner.start
    mt = formed(world)
    th = world.meetups[mt]["threadId"]
    for viewer in ("u_maya", "u_rosa"):
        intro = chat.list_messages(world, viewer, th)[0]
        assert intro["sender"]["kind"] == "muse"
        starters = next(a for a in intro["attachments"] if a["kind"] == "starters")["starters"]
        assert len(starters) == 3 and all(len(s) < 90 for s in starters)
    # only what everyone shares goes in a message to everyone (Maya/Dan's coastal hikes is not Rosa's)
    assert "hik" not in intro["text"].lower()
    assert [i["id"] for i in runner.group_interests(world, ["u_maya", "u_dan", "u_rosa"])] == [
        "arts_crafts.ceramics.wheel_throwing"
    ]


def test_cancelled_event_cancels_and_posts_alternatives(world):
    mt = formed(world)
    runner.apply(
        world, mt, {"type": "cancelled", "reason": "I couldn't find a time that works, so I cancelled this one."}
    )
    v = meetups.view(world, "u_maya", mt)
    assert v["status"] == "cancelled" and v["calendar"]["desired"] == "none"
    last = chat.list_messages(world, "u_dan", v["threadId"])[-1]
    assert last["sender"]["kind"] == "muse" and last["text"].startswith("I couldn't find a time")
    assert [a for a in last["attachments"] if a["kind"] == "plan"] == [{"kind": "plan", "planId": "pl_hero2"}]
    assert meetups.list_meetups(world, "u_maya") == []


def _synthetic_hero(world):
    for u in ("u_dan", "u_rosa"):
        world.users[u]["synthetic"] = True
    world.on_formed, world.on_decided = runner.start, runner.decided
    return formed(world)


def test_join_approve_confirmed_with_synthetic_counterparts(world):
    """Checkpoint A: Maya joins the hero plan, OKs her $35, and the meetup reaches confirmed."""
    pytest.importorskip("cg_api.agent")
    mt = _synthetic_hero(world)
    mine = approvals.pending(world, "u_maya")
    assert len(mine) == 1 and approvals.pending(world, "u_dan") == []  # counterparts answered themselves
    assert meetups.view(world, "u_maya", mt)["status"] == "setting_up"  # never books before Maya decides (P11)
    approvals.decide(world, "u_maya", mine[0]["approvalId"], "approve")
    m = meetups.view(world, "u_maya", mt)
    assert (m["status"], m["booking"]["status"], m["cost"]["myPayment"]) == ("confirmed", "booked", "paid")
    assert [s["kind"] for s in m["museSteps"]].count("book") == 1


def test_live_counterpart_decides_for_themselves(world):
    pytest.importorskip("cg_api.agent")
    world.demo.update(counterpart="live", liveUserId="u_dan")
    mt = _synthetic_hero(world)
    assert len(approvals.pending(world, "u_dan")) == 1 and approvals.pending(world, "u_rosa") == []
    assert meetups.view(world, "u_maya", mt)["status"] == "setting_up"


def test_forced_yes_off_waits_for_everyone(world):
    pytest.importorskip("cg_api.agent")
    world.demo["forcedYes"] = False
    _synthetic_hero(world)
    assert len(approvals.pending(world, "u_rosa")) == 1
