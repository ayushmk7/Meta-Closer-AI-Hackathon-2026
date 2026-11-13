"""createPlan on the live world: gates, parsing into venue/time, screening, invites, creator joined."""

import asyncio
import dataclasses

import pytest

from cg_api import contracts, ports
from cg_api.domain import create_plan, joins, meetups, plans
from cg_api.domain.world import Fail, parse


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
    assert (d["venue"]["venueId"], d["activityType"], d["title"]) == ("vn_trail", "walk", "Walk at Lands End Trail")
    assert d["origin"] == "user" and d["myJoin"]["status"] == "interested"
    start = parse(d["startsAt"]).astimezone(plans.TZ)
    assert start.strftime("%A") == "Sunday"  # the named day beats "weekend"
    assert "Lands End" not in d["description"] and d["reason"]  # description doesn't restate the header; pop-up has Muse's line
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


def test_raw_words_never_become_public_copy(world):
    unlocked(world, "u_maya")
    for text in ("drinks lol at Lands End Trail", "Board games with Daniel at Clay Hour Studio"):
        d = create(world, "u_maya", text)
        assert d["title"] in ("Walk at Lands End Trail", "Wheel-throwing at Clay Hour Studio"), d["title"]
        assert "Daniel" not in str(d) and "lol" not in str(d)
    holds = [joins.hold(world, j) for j in world.joins.values() if j["userId"] == "u_maya"]
    assert not any("Daniel" in (h or {}).get("title", "") for h in holds)  # P7: calendar holds name nobody


def test_obviously_bad_text_is_refused_even_under_laya_fake(world):
    from cg_api.settings import get_settings

    assert get_settings().laya_fake
    unlocked(world, "u_maya")
    for text in ("kill them all at Clay Hour Studio", "coke party saturday"):
        with pytest.raises(Fail) as e:
            create(world, "u_maya", text)
        assert (e.value.status, e.value.code) == (422, "screened")


def test_too_soon_rolls_to_tomorrow_not_next_week(world):
    """Thursday 10 AM local, 12 h lead: 'tonight' (6 PM) is too soon -> Friday 6 PM, never next Thursday."""
    unlocked(world, "u_maya")
    d = create(world, "u_maya", "pottery tonight")
    start = parse(d["startsAt"]).astimezone(plans.TZ)
    assert (start.strftime("%A"), start.hour) == ("Friday", 18)
