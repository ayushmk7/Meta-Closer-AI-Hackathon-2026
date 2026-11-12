"""Core loop on the pure domain: feed -> plan -> I'm in -> formation -> meetup, steps, chat, approvals."""

import pytest
import yaml

from cg_api.domain import approvals, chat, joins, meetups, people, plans
from cg_api.domain.world import Fail
from domain.fixture_world import CONTRACTS

jsonschema = pytest.importorskip("jsonschema")
SPEC = yaml.safe_load((CONTRACTS / "openapi.yaml").read_text())


def check(obj, schema_name):
    jsonschema.Draft202012Validator({**SPEC, "$ref": f"#/components/schemas/{schema_name}"}).validate(obj)
    return obj


def test_feed_pins_featured_and_validates(world):
    f = plans.feed(world, "u_maya")
    assert [p["planId"] for p in f["plans"]][:2] == ["pl_walk", "pl_hero"]
    for p in f["plans"]:
        check(p, "PlanCard")
    walk = f["plans"][0]
    assert walk["origin"] == "nudge" and walk["because"][0]["signalId"] == "si_0001"
    assert walk["checks"][0] == {
        "kind": "calendar",
        "ok": True,
        "label": "Fits your Sunday",
    }
    hero = f["plans"][1]
    assert (
        hero["cost"]["label"] == "$35 per person"
        and {"kind": "cost", "ok": True, "label": "$35 · Muse can book it"} in hero["checks"]
    )
    assert hero["crowd"]["interestedCount"] == 2 and hero["crowd"]["spotsLeft"] == 3
    assert f["prompts"] == ["Ceramics", "Hiking", "Board games"]


def test_not_opted_in(world):
    world.users["u_maya"]["optedIn"] = False
    with pytest.raises(Fail) as e:
        plans.feed(world, "u_maya")
    assert e.value.code == "not_opted_in"


def test_plan_detail(world):
    d = check(plans.detail(world, "u_maya", world.plans["pl_hero"]), "PlanDetail")
    assert d["formsAt"] == "2026-11-13T18:00:00Z"
    assert d["alternatives"] == [
        {
            "planId": "pl_hero2",
            "title": "Sunday wheel-throwing",
            "startsAt": "2026-11-15T22:00:00Z",
        }
    ]
    assert "Ask you before paying $35" in d["museWillHandle"]
    assert d["directions"]["apple"] == "https://maps.apple.com/?daddr=37.7765,-122.4241&dirflg=r"


def test_join_idempotent_withdraw_and_rejoin(world):
    j = check(joins.join(world, "u_maya", "pl_walk"), "Join")
    assert j["status"] == "interested" and j["calendar"]["desired"] == "hold"
    assert joins.join(world, "u_maya", "pl_walk")["joinId"] == j["joinId"]
    joins.withdraw(world, "u_maya", "pl_walk")
    assert joins.list_joins(world, "u_maya") == []
    assert joins.join(world, "u_maya", "pl_walk")["joinId"] == j["joinId"]


def test_open_joins_cap(world):
    world.params["plans"]["openJoinsMax"] = 1
    joins.join(world, "u_maya", "pl_walk")
    with pytest.raises(Fail) as e:
        joins.join(world, "u_maya", "pl_hero2")
    assert e.value.status == 429


def test_hero_forms_at_min_and_meetup_validates(world):
    formed = []
    world.on_formed = lambda w, mt: formed.append(mt)
    j = joins.join(world, "u_maya", "pl_hero")
    assert j["status"] == "matched" and j["meetupId"] == formed[0]
    assert world.plans["pl_hero"]["status"] == "closed"
    m = check(meetups.view(world, "u_maya", j["meetupId"]), "Meetup")
    assert m["status"] == "setting_up" and m["cost"]["myPayment"] == "pending_approval"
    assert [a["person"]["userId"] for a in m["attendees"]] == [
        "u_maya",
        "u_dan",
        "u_rosa",
    ]
    assert m["calendar"]["desired"] == "hold" and m["travel"]["leaveBy"] < m["startsAt"]
    assert len(people.list_connections(world, "u_maya")) == 2
    assert plans.feed(world, "u_maya")["museStatus"] == "Muse is setting up 1 plan for you"
    with pytest.raises(Fail) as e:
        joins.join(world, "u_kai", "pl_hero")
    assert e.value.status == 409


def test_unseated_become_not_filled(world):
    world.demo_mode = False
    world.plans["pl_hero"]["size"]["max"] = 3  # 5 interested, one group of 3
    world.venues["vn_clay"]["booking"]["capacityPerSlot"] = 10
    for u in ("u_maya", "u_kai", "u_zed"):
        joins.join(world, u, "pl_hero")
    assert world.plans["pl_hero"]["status"] == "open"
    joins.form(world, "pl_hero")
    statuses = {j["userId"]: j["status"] for j in world.joins.values()}
    assert statuses == {
        "u_dan": "matched",
        "u_rosa": "matched",
        "u_maya": "matched",
        "u_kai": "not_filled",
        "u_zed": "not_filled",
    }
    kai = joins.list_joins(world, "u_kai")[0]
    assert kai["alternatives"] == ["pl_hero2"] and kai["calendar"]["desired"] == "none"


def test_steps_append_and_machine(world):
    mt = joins.join(world, "u_maya", "pl_hero")["meetupId"]
    s = meetups.add_step(world, mt, "group_chat", "Opened your group chat", status="done")
    s2 = meetups.add_step(world, mt, "book", "Book 3 wheels")
    meetups.update_step(world, mt, s2["stepId"], status="running")
    with pytest.raises(ValueError):
        meetups.update_step(world, mt, s["stepId"], status="running")
    assert [x["stepId"] for x in meetups.view(world, "u_maya", mt)["museSteps"]] == [
        s["stepId"],
        s2["stepId"],
    ]
    assert sum(1 for u, t, _ in world.events if t == "meetup.step" and u == "u_rosa") == 3


def test_chat_thread_and_to_muse(world):
    seen = []
    world.on_to_muse = lambda w, msg: seen.append(msg["messageId"])
    mt = joins.join(world, "u_maya", "pl_hero")["meetupId"]
    th = world.meetups[mt]["threadId"]
    m = check(chat.send(world, "u_dan", th, "Muse, can we do 11?", "c1"), "Message")
    assert m["toMuse"] and seen == [m["messageId"]]
    assert chat.send(world, "u_dan", th, "Muse, can we do 11?", "c1")["messageId"] == m["messageId"]
    t = check(chat.thread_view(world, "u_maya", world.threads[th]), "Thread")
    assert t["unreadCount"] == 1 and [p["userId"] for p in t["participants"]] == [
        "u_dan",
        "u_rosa",
    ]
    chat.mark_read(world, "u_maya", th)
    assert chat.thread_view(world, "u_maya", world.threads[th])["unreadCount"] == 0
    with pytest.raises(Fail):
        chat.list_messages(world, "u_kai", th)


def test_leave_tells_group_only_cant_make_it(world):
    mt = joins.join(world, "u_maya", "pl_hero")["meetupId"]
    m = meetups.leave(world, "u_rosa", mt)
    assert [a["rsvp"] for a in m["attendees"] if a["isMe"]] == ["left"] and m["calendar"]["desired"] == "none"
    assert chat.list_messages(world, "u_maya", world.meetups[mt]["threadId"])[-1]["text"] == "Rosa can't make it."


def test_approval_machine_and_money_gate(world):
    decided = []
    world.on_decided = lambda w, a: decided.append(a["status"])
    mt = joins.join(world, "u_maya", "pl_hero")["meetupId"]
    a = approvals.create(
        world,
        mt,
        "u_maya",
        "payment",
        "OK $35 for your wheel?",
        "Muse pays Clay Hour Studio.",
        "I'll ask the studio to hold your wheel.",
        3500,
        "USD",
        "Clay Hour Studio",
    )
    step = meetups.add_step(
        world,
        mt,
        "payment",
        "Waiting for you to OK $35",
        status="needs_you",
        approval_id=a["approvalId"],
    )
    check(approvals.view(a), "Approval")
    assert a["expiresAt"] == "2026-11-13T06:00:00Z"  # now + 12 h, before formsAt
    assert [x["approvalId"] for x in approvals.pending(world, "u_maya")] == [a["approvalId"]]
    with pytest.raises(Fail) as e:
        approvals.pay(world, mt, "u_maya", 3500)
    assert e.value.status == 403
    with pytest.raises(Fail) as e:
        approvals.decide(world, "u_dan", a["approvalId"], "approve")
    assert e.value.status == 404
    approvals.decide(world, "u_maya", a["approvalId"], "approve")
    assert step["status"] == "running" and decided == ["approved"]
    approvals.pay(world, mt, "u_maya", 3500)
    assert meetups.view(world, "u_maya", mt)["cost"]["myPayment"] == "paid"
    with pytest.raises(Fail) as e:
        approvals.decide(world, "u_maya", a["approvalId"], "decline")
    assert e.value.status == 409
    # the approval attachment is only in the approver's view
    th = world.meetups[mt]["threadId"]
    assert any(x.get("approvalId") for m in chat.list_messages(world, "u_maya", th) for x in m["attachments"])
    assert not any(
        x.get("kind") == "approval" for m in chat.list_messages(world, "u_dan", th) for x in m["attachments"]
    )


def test_approval_expiry(world):
    from datetime import timedelta

    from domain.fixture_world import NOW

    mt = joins.join(world, "u_maya", "pl_hero")["meetupId"]
    a = approvals.create(
        world,
        mt,
        "u_rosa",
        "payment",
        "OK $35?",
        "d",
        "f",
        3500,
        "USD",
        "Clay Hour Studio",
    )
    world.now = lambda: NOW + timedelta(days=1)
    assert approvals.pending(world, "u_rosa") == []
    assert a["status"] == "expired" and world.meetups[mt]["members"]["u_rosa"]["payment"] == "declined"


def test_auto_spend_limit(world):
    mt = joins.join(world, "u_maya", "pl_hero")["meetupId"]
    world.users["u_dan"]["museSettings"]["spendWithoutAskingCents"] = 5000
    approvals.pay(world, mt, "u_dan", 3500)
    assert world.meetups[mt]["members"]["u_dan"]["payment"] == "paid"
