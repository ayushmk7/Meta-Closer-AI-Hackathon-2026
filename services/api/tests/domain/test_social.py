"""Batch 2 slice 8: shares, verify, check-in, feedback -> prefs, 'Because you liked X'."""

import json
from datetime import timedelta

import pytest

from cg_api import contracts
from cg_api.domain import joins, meetups, plans, shares, verify
from cg_api.domain.world import Fail
from domain.fixture_world import NOW


def confirmed(world):
    world.demo["relaxCheckin"] = True
    mt = joins.join(world, "u_maya", "pl_hero")["meetupId"]
    meetups.set_status(world, mt, "confirmed")
    return mt


def started(world):
    world.now = lambda: NOW + timedelta(days=2)  # 2026-11-14T18:00Z, the start


def finished(world, mt):
    world.now = lambda: NOW + timedelta(days=3)  # after the Saturday session
    meetups.set_status(world, mt, "completed")


def check(obj, op_id, status=200):
    contracts.validate(contracts.op_by_id(op_id), status, obj)
    return obj


def test_list_shares_has_no_person_fields(world):
    mt = confirmed(world)
    verify.check_in(world, "u_maya", mt, world.venues["vn_clay"]["location"])
    finished(world, mt)
    mine = shares.share_meetup(world, "u_maya", mt, "Three strangers, three lopsided bowls.")
    assert mine["mine"] and mine["groupSize"] == 3
    for viewer in (None, "u_maya", "u_dan"):
        items = shares.list_shares(world, viewer)
        check({"items": items}, "listShares")
        dump = json.dumps(items)
        assert '"u_' not in dump and "avatars" not in dump
        for u in world.users.values():
            assert u["displayName"] not in dump and u["firstName"] not in dump
    assert [s["shareId"] for s in shares.list_shares(world, None, venue_id="vn_clay")][0] == mine["shareId"]
    assert all(s["activityType"] == "walk" for s in shares.list_shares(world, None, activity_type="walk"))


def test_share_needs_attended_finished_and_not_sensitive(world):
    mt = confirmed(world)
    with pytest.raises(Fail) as e:  # not over yet
        shares.share_meetup(world, "u_maya", mt, "hi")
    assert e.value.status == 422
    finished(world, mt)
    with pytest.raises(Fail) as e:  # never checked in or verified
        shares.share_meetup(world, "u_maya", mt, "hi")
    assert e.value.status == 422
    world.meetups[mt]["members"]["u_maya"]["checkedIn"] = True
    world.venues["vn_clay"]["sensitive"] = True
    with pytest.raises(Fail) as e:
        shares.share_meetup(world, "u_maya", mt, "hi")
    assert e.value.status == 422 and e.value.code == "not_allowed"
    assert all(s["venue"]["venueId"] != "vn_clay" for s in shares.list_shares(world, None))  # P4


def test_like_is_idempotent_and_teaches_prefs(world):
    s = shares.list_shares(world, "u_dan")[0]
    a = shares.like(world, "u_dan", s["shareId"], True)
    b = shares.like(world, "u_dan", s["shareId"], True)
    assert a["likes"] == b["likes"] == s["likes"] + 1 and b["likedByMe"]
    assert world.prefs["u_dan"][f"act:{s['activityType']}"] == pytest.approx(0.09)  # 0.3 * 0.3, once
    assert shares.like(world, "u_dan", s["shareId"], False)["likes"] == s["likes"]


def test_verify_sets_counted_and_rewards_increment(world, monkeypatch):
    from cg_api.store import store, views

    mt = confirmed(world)
    monkeypatch.setattr(store, "world", world)
    monkeypatch.setattr(store, "meetups", world.meetups)
    before = views.rewards_view("u_maya")["confirmedMeetups"]
    m_dan = meetups.view(world, "u_dan", mt)
    dan_code = m_dan["verifyCode"]
    assert dan_code and dan_code not in json.dumps(meetups.view(world, "u_maya", mt))  # owner-only
    assert verify.verify(world, "u_maya", mt, meetups.view(world, "u_maya", mt)["verifyCode"])["reason"] == "self"
    assert verify.verify(world, "u_maya", mt, "ZZZZZZ")["reason"] == "invalid_code"
    r = check(verify.verify(world, "u_maya", mt, dan_code.lower()), "verifyAttendee")
    assert r["accepted"] and r["person"]["userId"] == "u_dan"
    v = meetups.view(world, "u_maya", mt)
    assert {a["person"]["userId"]: a["verified"] for a in v["attendees"]} == {
        "u_maya": True,
        "u_dan": True,
        "u_rosa": False,
    }
    assert world.meetups[mt]["members"]["u_dan"]["counted"] and world.meetups[mt]["members"]["u_maya"]["counted"]
    assert views.rewards_view("u_maya")["confirmedMeetups"] == before + 1
    assert views.rewards_view("u_dan")["confirmedMeetups"] == before + 1
    con = world.connections[frozenset(("u_maya", "u_dan"))]
    assert con["status"] == "met" and con["meetupsTogether"] == 1
    verify.verify(world, "u_dan", mt, v["verifyCode"])  # the second scan doesn't double count
    assert views.rewards_view("u_maya")["confirmedMeetups"] == before + 1 and con["meetupsTogether"] == 1


def test_verify_outside_window_when_not_relaxed(world):
    mt = confirmed(world)
    world.demo["relaxCheckin"] = False
    code = meetups.view(world, "u_dan", mt)["verifyCode"]
    assert verify.verify(world, "u_maya", mt, code) == {"accepted": False, "reason": "outside_window"}


def test_check_in_geofence_window_and_mutual_count(world):
    mt = confirmed(world)
    world.demo["relaxCheckin"] = False
    venue = world.venues["vn_clay"]["location"]
    assert verify.check_in(world, "u_maya", mt, venue)["reason"] == "outside_window"
    world.now = lambda: NOW + timedelta(days=2)  # 2026-11-14T18:00Z, the start
    assert verify.check_in(world, "u_maya", mt, {"lat": 37.70, "lng": -122.40})["reason"] == "outside_geofence"
    assert verify.check_in(world, "u_maya", mt, venue) == {"accepted": True}
    assert verify.check_in(world, "u_dan", mt, venue) == {"accepted": True}
    assert "lat" not in json.dumps(world.meetups[mt]["members"])  # P8: the reading is not kept
    fb = {"answers": [{"userId": "u_dan", "showedUp": True, "meetAgain": True}]}
    verify.feedback(world, "u_maya", mt, fb)
    assert not world.meetups[mt]["members"]["u_maya"].get("counted")  # Dan hasn't confirmed Maya yet
    verify.feedback(world, "u_dan", mt, {"answers": [{"userId": "u_maya", "showedUp": True, "meetAgain": True}]})
    assert world.meetups[mt]["members"]["u_maya"]["counted"] and world.meetups[mt]["members"]["u_dan"]["counted"]
    assert meetups.view(world, "u_maya", mt)["feedbackDue"] is False


def test_feedback_validation(world):
    mt = confirmed(world)
    started(world)
    for bad in (
        {},
        {"answers": [{"userId": "u_kai", "showedUp": True, "meetAgain": True}]},
        {"answers": [], "rating": 9},
    ):
        with pytest.raises(Fail) as e:
            verify.feedback(world, "u_maya", mt, bad)
        assert e.value.status == 400


def _order(world, viewer):
    return [p["planId"] for p in plans.feed(world, viewer)["plans"]]


def test_feedback_reorders_feed_deterministically(world):
    """A 5-star ceramics meetup lifts ceramics plans; same inputs, same order, every time."""
    mt = confirmed(world)
    started(world)
    world.demo_mode = False  # no featured pins, no beat
    before = _order(world, "u_dan")
    assert before.index("pl_walk") < before.index("pl_hero2")  # coastal walk ahead first
    verify.feedback(world, "u_dan", mt, {"answers": [], "rating": 5, "tags": ["great_venue"]})
    after = _order(world, "u_dan")
    assert after.index("pl_hero2") < after.index("pl_walk")
    assert after == _order(world, "u_dan")  # deterministic
    card = plans.card(world, "u_dan", world.plans["pl_hero2"])
    assert {"source": "muse", "label": "Because you liked ceramics", "signalId": None} in card["because"]
    assert not any(b["source"] == "muse" for b in plans.card(world, "u_maya", world.plans["pl_hero2"])["because"])  # P7
    verify.feedback(world, "u_dan", mt, {"answers": [], "rating": 1})  # resend doesn't learn twice
    assert _order(world, "u_dan") == after


def test_too_far_tag_lowers_only_the_venue(world):
    mt = confirmed(world)
    started(world)
    verify.feedback(world, "u_dan", mt, {"answers": [], "rating": 4, "tags": ["too_far"]})
    p = world.prefs["u_dan"]
    assert p["act:ceramics_studio"] > 0 and p["vn:vn_clay"] < p["act:ceramics_studio"]


def test_feedback_reorders_through_real_rank_plans():
    from cg_api.domain import matching
    from domain.fixture_world import make_world

    w = make_world(matching)
    mt = confirmed(w)
    started(w)
    w.demo_mode = False
    for u in w.users.values():  # rank_plans needs availability to place the plans
        u["availability"] = [{"day": d, "part": p} for d in ("sat", "sun") for p in ("morning", "afternoon", "evening")]
        u["travel"] = {"maxMinutes": 120, "modes": ["transit"]}
    for i in w.users["u_dan"]["interests"]:  # close call: hiking just ahead of ceramics before any feedback
        i["weight"] = {"outdoors": 0.8, "arts_crafts": 0.45}.get(i["id"].split(".")[0], i["weight"])
    before = [pid for pid in matching.rank(w, "u_dan") if pid in ("pl_walk", "pl_hero2")]
    verify.feedback(w, "u_dan", mt, {"answers": [], "rating": 5})
    after = [pid for pid in matching.rank(w, "u_dan") if pid in ("pl_walk", "pl_hero2")]
    assert before == ["pl_walk", "pl_hero2"] and after == ["pl_hero2", "pl_walk"]
    assert after == [pid for pid in matching.rank(w, "u_dan") if pid in ("pl_walk", "pl_hero2")]


def test_gallery_is_scoped_to_the_viewers_pool(world):
    world.demo["poolId"] = "pool_sf_city"
    world.add_plan({**world.plans["pl_walk"], "planId": "pl_far", "poolId": "pool_evt", "title": "Dish loop"})
    pools = {world.shares[s["shareId"]]["poolId"] for s in shares.list_shares(world, None)}
    assert pools == {"pool_sf_city"}  # anonymous Welcome: the demo's city pool
    world.users["u_kai"]["poolId"] = "pool_evt"
    assert {world.shares[s["shareId"]]["poolId"] for s in shares.list_shares(world, "u_kai")} == {"pool_evt"}


def test_seed_copy_fits_the_card(world):
    for s in shares.list_shares(world, None):
        assert "at 10" not in s["caption"]
        if "of us" in s["caption"]:
            n = {"Two": 2, "Three": 3, "Four": 4, "Five": 5, "Six": 6, "Seven": 7, "Eight": 8}[s["caption"].split()[0]]
            assert n == s["groupSize"]
        assert "_" not in s["promptText"] and s["promptText"].endswith("this weekend")  # NOW is a Thursday
    walk = next(s for s in shares.list_shares(world, None) if s["venue"]["venueId"] == "vn_trail")
    assert walk["promptText"] == "Sunday coastal walk at Lands End Trail this weekend"


def test_blank_caption_says_add_one(world):
    mt = confirmed(world)
    for cap, msg in (("   ", "Add a caption"), ("x" * 141, "under 140")):
        with pytest.raises(Fail) as e:
            shares.share_meetup(world, "u_maya", mt, cap)
        assert e.value.status == 400 and msg in e.value.message


def test_activity_only_pref_gives_no_because_line(world):
    from cg_api.domain import prefs

    prefs.reward(world, "u_dan", ["act:ceramics_studio"], 1.0)
    assert prefs.liked_label(world, "u_dan", world.plans["pl_hero2"]) is None
    prefs.reward(world, "u_dan", ["vn:vn_clay"], 1.0)
    assert prefs.liked_label(world, "u_dan", world.plans["pl_hero2"]) == "Because you liked Clay Hour Studio"


def test_caption_naming_a_coattendee_is_refused(world):
    mt = confirmed(world)
    verify.check_in(world, "u_maya", mt, world.venues["vn_clay"]["location"])
    finished(world, mt)
    for cap in ("With Daniel Okafor and Rosa!", "rosa made the best bowl"):
        with pytest.raises(Fail) as e:
            shares.share_meetup(world, "u_maya", mt, cap)
        assert (e.value.status, e.value.code) == (422, "not_allowed")
    assert shares.share_meetup(world, "u_maya", mt, "Rosary beads? No, bowls.")["mine"]  # word match, not substring


def test_verify_guessing_is_capped(world):
    mt = confirmed(world)
    for _ in range(verify.MAX_MISSES):
        assert verify.verify(world, "u_maya", mt, "AAAAAA")["reason"] == "invalid_code"
    with pytest.raises(Fail) as e:
        verify.verify(world, "u_maya", mt, meetups.view(world, "u_dan", mt)["verifyCode"])
    assert e.value.status == 429


def test_feedback_waits_for_the_start(world):
    mt = confirmed(world)
    with pytest.raises(Fail) as e:
        verify.feedback(world, "u_dan", mt, {"answers": [], "rating": 5})
    assert e.value.status == 409 and "u_dan" not in world.prefs


def test_relike_does_not_farm_prefs(world):
    s = shares.list_shares(world, "u_kai")[0]
    for liked in (True, False, True, False, True):
        shares.like(world, "u_kai", s["shareId"], liked)
    assert world.prefs["u_kai"][f"act:{s['activityType']}"] == pytest.approx(0.09)
