"""syncCalendar serves the directives the domain implies (CONTRACTS §5): hold per interested join, event per
confirmed meetup, none until the device confirms removal. P7: own keys only, no other people's names."""

import pytest

pytest.importorskip("cg_api.domain.joins")

from cg_api.store import store  # noqa: E402

SYNC = {"source": "device_calendar", "horizonStart": "2026-11-12T08:00:00Z", "horizonEnd": "2026-11-26T08:00:00Z",
        "busy": []}  # fmt: skip


def sync(api, applied=(), user="u_maya"):
    body = {**SYNC, "applied": [{"key": k, "desired": d, "ok": True} for k, d in applied]}
    return {d["key"]: d for d in api("syncCalendar", json=body, headers={"X-CG-User": user}).json()["directives"]}


def test_directives_follow_joins_and_meetups(api):
    api("optIn", json={"mode": "city"})
    assert sync(api) == {}

    jid = api("joinPlan", "/v1/plans/pl_sf_wed_game_night/join").json()["joinId"]
    d = sync(api)
    assert d[jid]["desired"] == "hold" and d[jid]["title"].startswith("Hold: ")
    sync(api, [(jid, "hold")])

    assert api("withdrawJoin", "/v1/plans/pl_sf_wed_game_night/join").status_code == 204
    assert sync(api)[jid]["desired"] == "none"  # device still has the hold: tell it to delete
    assert jid not in sync(api, [(jid, "none")])  # removed: stop sending it

    from cg_api.domain import meetups

    hero = api("joinPlan", "/v1/plans/pl_sf_hero_wheel/join").json()
    js = [j for j in store.joins.values() if j["planId"] == "pl_sf_hero_wheel"]
    mt = hero["meetupId"] or meetups.create(store.world, store.plans["pl_sf_hero_wheel"], js)
    for j in js:
        j.update(status="matched", meetupId=mt)
    sync(api, [(hero["joinId"], "hold")])
    assert sync(api)[hero["joinId"]]["desired"] == "none"  # hold replaced by the meetup's directive
    assert sync(api)[mt]["desired"] == "hold"  # setting_up
    store.meetups[mt]["status"] = "confirmed"
    d = sync(api)
    assert d[mt]["desired"] == "event" and d[mt]["startsAt"] == store.meetups[mt]["startsAt"]
    names = {
        store.users[u]["persona"][k]
        for u in store.meetups[mt]["members"]
        if u != "u_maya"
        for k in ("displayName", "firstName")
    }
    assert not any(n in (x.get("title", "") + (x.get("notes") or "")) for x in d.values() for n in names)  # P7
    assert mt not in sync(api, user="u_0098")  # not a member: never sees it
