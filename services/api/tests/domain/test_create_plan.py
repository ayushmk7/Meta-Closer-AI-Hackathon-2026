"""createPlan on the live world: gates, parsing into venue/time, screening, invites, creator joined."""

import asyncio
import dataclasses

import pytest

from cg_api import contracts, ports
from cg_api.domain import create_plan, joins, meetups, plans
from cg_api.domain.world import Fail, parse
from domain.fixture_world import NOW


@pytest.fixture(autouse=True)
def pinned(monkeypatch):
    monkeypatch.setattr(ports.ports, "muse", ports.StubMuse())  # keyword fallback, deterministic
    monkeypatch.setattr(ports.ports, "copy", ports.StubCopy())


def unlocked(world, *uids):
    """One counted meetup each: the create_plans unlock (params.unlocks afterConfirmedMeetups: 1)."""
    mt = joins.join(world, "u_maya", "pl_hero")["meetupId"]
    for u in uids:
        world.meetups[mt]["members"][u]["counted"] = True
    return mt


def create(world, viewer, text, invites=None):
    return asyncio.run(create_plan.create(world, viewer, text, invites))


def test_gated_until_the_first_meetup_counts(world):
    with pytest.raises(Fail) as e:
        create(world, "u_maya", "pottery this weekend")
    assert (e.value.status, e.value.code) == (403, "not_allowed")
    unlocked(world, "u_maya")
    world.params["features"]["userPlans"] = False
    with pytest.raises(Fail) as e:
        create(world, "u_maya", "pottery this weekend")
    assert e.value.status == 403


def test_plan_something_like_this_from_a_share_prompt(world):
    unlocked(world, "u_maya")
    d = create(world, "u_maya", "Sunday coastal walk at Lands End Trail this weekend")
    contracts.validate(contracts.op_by_id("createPlan"), 200, d)
    assert (d["venue"]["venueId"], d["activityType"], d["title"]) == (
        "vn_trail",
        "walk",
        "Sunday coastal walk at Lands End Trail",
    )
    assert d["origin"] == "user" and d["myJoin"]["status"] == "interested"
    start = parse(d["startsAt"]).astimezone(plans.TZ)
    assert (
        start.weekday() >= 5 and parse(d["startsAt"]) >= NOW.replace(hour=0) and "Muse is gathering" in d["description"]
    )
    assert "Sunday coastal walk" not in d["description"]  # template, never the raw words


def test_activity_words_pick_a_venue_that_hosts_it(world):
    unlocked(world, "u_maya")
    d = create(world, "u_maya", "anyone up for pottery saturday morning?")
    assert d["venue"]["venueId"] == "vn_clay" and d["activityType"] == "ceramics_studio"
    start = parse(d["startsAt"]).astimezone(plans.TZ)
    assert (start.strftime("%A"), start.hour) == ("Saturday", 10)
    with pytest.raises(Fail) as e:
        create(world, "u_maya", "hmm")
    assert e.value.status == 400


def test_invites_only_met_people_and_the_plan_stays_private(world):
    mt = unlocked(world, "u_maya")
    with pytest.raises(Fail) as e:
        create(world, "u_maya", "pottery saturday", ["u_dan"])  # connection is still `new`
    assert e.value.status == 403
    world.connections[frozenset(("u_maya", "u_dan"))]["status"] = "met"
    d = create(world, "u_maya", "pottery saturday", ["u_dan"])
    assert d["origin"] == "invite" and d["size"]["min"] == world.params["groups"]["metSizeMin"]
    assert plans.get(world, "u_dan", d["planId"])
    with pytest.raises(Fail) as e:
        plans.get(world, "u_kai", d["planId"])
    assert e.value.status == 404
    assert meetups.get(world, "u_maya", mt)


def test_weekly_limit(world):
    unlocked(world, "u_maya")
    world.params["plans"]["userPlansPerWeek"] = 1
    create(world, "u_maya", "pottery saturday")
    with pytest.raises(Fail) as e:
        create(world, "u_maya", "a coastal walk sunday")
    assert e.value.status == 429


def test_real_laya_screens_and_fake_skips(world, monkeypatch):
    from cg_api.settings import get_settings

    unlocked(world, "u_maya")

    class No:
        async def ask(self, q, state):
            return 0.02, True

    monkeypatch.setattr(ports.ports, "laya", No())
    assert create(world, "u_maya", "pottery saturday")["planId"]  # LAYA_FAKE: skipped
    real = dataclasses.replace(get_settings(), laya_fake=False)
    monkeypatch.setattr(create_plan, "get_settings", lambda: real)
    with pytest.raises(Fail) as e:
        create(world, "u_maya", "a coastal walk sunday")
    assert (e.value.status, e.value.code) == (422, "screened")
