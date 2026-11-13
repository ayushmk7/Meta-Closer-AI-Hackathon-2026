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


def test_join_size_must_be_ints(world):
    for bad in ({"min": "a", "max": 3}, {"min": 1, "max": 3}, {"min": 4, "max": 3}, {"min": 2, "max": 3}, "big"):
        with pytest.raises(Fail) as e:
            joins.join(world, "u_maya", "pl_walk", bad)
        assert e.value.status == 400 and "between 3 and 8" in e.value.message


def test_spots_count_the_group_not_the_venue(world):
    joins.join(world, "u_kai", "pl_walk")  # walk: 3 to 6 people at a 40-person trail
    assert plans.card(world, "u_maya", world.plans["pl_walk"])["crowd"]["spotsLeft"] == 5


def test_left_member_is_read_only_and_gets_nothing_new(world):
    mt = joins.join(world, "u_maya", "pl_hero")["meetupId"]
    th = world.meetups[mt]["threadId"]
    meetups.leave(world, "u_rosa", mt)
    with pytest.raises(Fail) as e:
        chat.send(world, "u_rosa", th, "still here", "c9")
    assert e.value.status == 403
    chat.send(world, "u_dan", th, "see you all", "c10")
    assert "see you all" not in [m["text"] for m in chat.list_messages(world, "u_rosa", th)]
    assert not [
        d for u, t, d in world.events if u == "u_rosa" and t == "message.created" and d["text"] == "see you all"
    ]


def test_reason_comes_from_copy_and_never_echoes_the_venue(world):
    import asyncio

    asyncio.run(plans.warm_reasons(world, "u_maya", ["pl_hero", "pl_walk"]))
    hero = plans.card(world, "u_maya", world.plans["pl_hero"])["reason"]
    walk = plans.card(world, "u_maya", world.plans["pl_walk"])["reason"]
    assert hero and "Clay Hour Studio" not in hero and "Lands End" not in walk


def test_demo_formation_waits_a_beat(world):
    """Moment 4: in DEMO_MODE the group forms a few seconds after size.min, so 'gathering' shows first."""
    import asyncio

    world.params["demo"]["syntheticDelayS"] = [0.05, 0.05]

    async def go():
        j = joins.join(world, "u_maya", "pl_hero")
        assert j["status"] == "interested" and j["meetupId"] is None
        await asyncio.sleep(0.2)
        return joins.list_joins(world, "u_maya")[0]

    j = asyncio.run(go())
    assert j["status"] == "matched" and j["meetupId"]


def test_demo_formation_skipped_if_someone_withdrew(world):
    import asyncio

    world.params["demo"]["syntheticDelayS"] = [0.05, 0.05]

    async def go():
        joins.join(world, "u_maya", "pl_hero")
        joins.withdraw(world, "u_maya", "pl_hero")
        await asyncio.sleep(0.2)

    asyncio.run(go())
    assert world.plans["pl_hero"]["status"] == "open" and not world.meetups
