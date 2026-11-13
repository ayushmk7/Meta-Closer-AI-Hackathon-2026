"""CONTRACTS §8 P1 to P9, written as an attacker: dump everything a viewer can get, then grep it."""

import json

import pytest
from domain.fixture_world import SECRET_SIGNAL

from cg_api.domain import approvals, chat, joins, meetups, people, plans
from cg_api.domain.world import Fail


def everything(w, viewer):
    """Every domain view the public API can hand `viewer`."""
    out = [
        plans.feed(w, viewer),
        joins.list_joins(w, viewer),
        meetups.list_meetups(w, viewer),
        chat.list_threads(w, viewer),
        people.list_connections(w, viewer),
        approvals.pending(w, viewer),
    ]
    out += [plans.detail(w, viewer, p) for p in w.plans.values() if plans.visible(w, viewer, p)]
    for t in w.threads.values():
        if viewer in t["members"]:
            out.append(chat.list_messages(w, viewer, t["threadId"]))
    for uid in w.users:
        try:
            out.append(people.get_person(w, viewer, uid))
        except Fail:
            pass
    return json.dumps(out)


def form_hero(w):
    return joins.join(w, "u_maya", "pl_hero")["meetupId"]


def test_p1_overlap_only(world):
    form_hero(world)
    dump = everything(world, "u_maya")
    for leak in (
        "music",
        "jazz",
        "drums",
        "party_games",
        "Party games",
        "identity_values",
    ):
        assert leak not in dump, leak  # Dan's/Rosa's non-shared or Maya's hidden interests
    dan = next(a for a in meetups.list_meetups(world, "u_maya")[0]["attendees"] if a["person"]["userId"] == "u_dan")
    assert {i["id"] for i in dan["sharedInterests"]} == {
        "arts_crafts.ceramics.wheel_throwing",
        "outdoors.hiking.coastal_hikes",
    }


def test_p2_no_identities_before_formation(world):
    world.demo_mode = False
    joins.join(world, "u_maya", "pl_hero")
    dump = everything(world, "u_maya")
    for uid in ("u_dan", "u_rosa", "Daniel", "Rosa"):
        assert uid not in dump


def test_p2_crowd_empty_with_one_other(world):
    joins.join(world, "u_dan", "pl_walk")
    joins.join(world, "u_maya", "pl_walk")
    assert plans.card(world, "u_maya", world.plans["pl_walk"])["crowd"]["sharedWithYou"] == []


def test_p2_crowd_coarse_and_capped(world):
    shared = plans.card(world, "u_maya", world.plans["pl_hero"])["crowd"]["sharedWithYou"]
    assert shared and all(s["interest"]["level"] == 2 for s in shared)
    assert len(shared) <= world.params["privacy"]["sharedCoarseMax"]
    assert {s["interest"]["id"] for s in shared} <= {
        "arts_crafts.ceramics",
        "outdoors.hiking",
        "games.board_games",
    }


def test_p2_shared_full_capped(world):
    world.params["privacy"]["sharedFullMax"] = 1
    mt = form_hero(world)
    assert all(len(a["sharedInterests"]) <= 1 for a in meetups.view(world, "u_maya", mt)["attendees"])


def test_p3_private_profile(world):
    mt = form_hero(world)
    rosa = next(
        a["person"] for a in meetups.view(world, "u_maya", mt)["attendees"] if a["person"]["userId"] == "u_rosa"
    )
    assert rosa["displayName"] == "Rosa" and rosa["avatarUrl"] is None
    assert "Diaz" not in everything(world, "u_maya")
    with pytest.raises(Fail) as e:
        people.get_person(world, "u_maya", "u_rosa")
    assert e.value.status == 403


def test_p4_sensitive_needs_both_opt_ins(world):
    world.users["u_maya"]["interests"].append(
        {
            "id": "identity_values.faith.buddhism",
            "weight": 0.9,
            "visibility": "shown",
            "sensitive": True,
        }
    )
    mt = form_hero(world)
    assert "buddhism" not in everything(world, "u_maya")
    world.users["u_maya"]["sensitiveOptIn"].add("identity_values")
    assert "buddhism" not in everything(world, "u_maya")  # Dan hasn't opted in
    world.users["u_dan"]["sensitiveOptIn"].add("identity_values")
    dan = next(a for a in meetups.view(world, "u_maya", mt)["attendees"] if a["person"]["userId"] == "u_dan")
    assert "identity_values.faith.buddhism" in {i["id"] for i in dan["sharedInterests"]}


def test_p4_p7_sensitive_signal_never_shown(world):
    form_hero(world)
    assert SECRET_SIGNAL not in everything(world, "u_maya")


def test_p5_no_reach_outside_a_group(world):
    with pytest.raises(Fail) as e:
        people.get_person(world, "u_maya", "u_kai")
    assert e.value.status == 403
    with pytest.raises(Fail) as e:
        people.get_person(world, "u_maya", "u_nobody")
    assert e.value.status == 404


def test_p6_withdraw_is_silent(world):
    world.demo_mode = False
    joins.join(world, "u_kai", "pl_walk")
    joins.join(world, "u_maya", "pl_walk")
    before = len(world.events)
    joins.withdraw(world, "u_maya", "pl_walk")
    assert {u for u, _, _ in world.events[before:]} == {"u_maya"}


def test_p6_not_filled_has_no_reason(world):
    world.demo_mode = False
    world.blocks.add(frozenset(("u_kai", "u_dan")))
    joins.join(world, "u_kai", "pl_hero")
    joins.join(world, "u_maya", "pl_hero")
    joins.form(world, "pl_hero")
    kai = joins.list_joins(world, "u_kai")[0]
    assert kai["status"] == "not_filled" and set(kai) == {
        "joinId",
        "planId",
        "status",
        "progress",
        "meetupId",
        "formsAt",
        "createdAt",
        "alternatives",
        "calendar",
        "plan",
    }


def test_p6_decline_and_leave_invisible(world):
    mt = form_hero(world)
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
    approvals.decide(world, "u_rosa", a["approvalId"], "decline")
    meetups.leave(
        world,
        "u_rosa",
        mt,
    )
    dump = everything(world, "u_maya") + json.dumps([d for u, _, d in world.events if u == "u_maya"], default=str)
    assert "declined" not in dump and a["approvalId"] not in dump
    texts = [m["text"] for m in chat.list_messages(world, "u_maya", world.meetups[mt]["threadId"])]
    assert texts == ["Rosa can't make it."]


def test_p7_owner_only(world):
    j = joins.join(world, "u_maya", "pl_walk")
    form_hero(world)
    dump = everything(world, "u_dan") + json.dumps([d for u, _, d in world.events if u != "u_maya"], default=str)
    for leak in ("Little Fern Kitchen 4 times", "si_0001", "2026-11-19T02:00:00Z", j["joinId"]):
        assert leak not in dump, leak
    for m in meetups.list_meetups(world, "u_maya"):
        assert "Daniel" not in json.dumps(m["calendar"]) and "Rosa" not in json.dumps(m["calendar"])


def test_p8_centroid_and_directions(world):
    world.users["u_kai"]["homeLocation"] = {
        "lat": 37.70,
        "lng": -122.40,
    }  # same hood as Maya, far away
    world.users["u_zed"]["homeLocation"] = {"lat": 37.82, "lng": -122.52}
    a = plans.card(world, "u_kai", world.plans["pl_walk"])["travel"]
    b = plans.card(world, "u_zed", world.plans["pl_walk"])["travel"]
    assert a == b
    d = plans.detail(world, "u_maya", world.plans["pl_walk"])["directions"]
    assert "37.7804,-122.511" in d["apple"] and "37.76" not in json.dumps(d)


def test_p9_blocked_disappear_and_never_grouped(world):
    mt = form_hero(world)
    th = world.meetups[mt]["threadId"]
    chat.send(world, "u_dan", th, "hi all", "c1")
    people.block(world, "u_maya", "u_dan")
    dump = everything(world, "u_maya")
    assert "u_dan" not in dump and "Daniel" not in dump
    with pytest.raises(Fail) as e:
        people.get_person(world, "u_maya", "u_dan")
    assert e.value.status == 404
    world.demo_mode = False
    joins.join(world, "u_dan", "pl_walk")
    joins.join(world, "u_maya", "pl_walk")
    joins.join(world, "u_kai", "pl_walk")
    joins.join(world, "u_zed", "pl_walk")
    for mt2 in joins.form(world, "pl_walk"):
        assert not {"u_maya", "u_dan"} <= set(world.meetups[mt2]["members"])
