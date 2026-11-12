"""domain.runner applies ScriptedRun events to the store; P11 is re-checked there."""

import pytest

from cg_api.domain import approvals, joins, meetups, runner
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
