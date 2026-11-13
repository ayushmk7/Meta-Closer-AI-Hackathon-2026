"""Slice A core loop on the tiny seed: optIn -> setup -> connectors/signals -> calendar -> export -> reset."""

from cg_api import realtime
from cg_api.store import store

BUSY = {
    "source": "device_calendar",
    "horizonStart": "2026-11-12T08:00:00Z",
    "horizonEnd": "2026-11-26T08:00:00Z",
    "busy": [{"start": "2026-11-14T17:00:00Z", "end": "2026-11-14T19:00:00Z", "title": "never stored"}],
    "applied": [{"key": "jn_x", "desired": "hold", "ok": True}],
}


def opt_in(api):
    return api("optIn", json={"mode": "city"}).json()


def test_identity(public, api):
    assert api("getMe", headers={"X-CG-User": "u_nobody"}).status_code == 401
    assert api("getMe").json()["optedIn"] is False


def test_not_opted_in_gates(api):
    for op, path in [("getSetup", None), ("listConnectors", None), ("listSignals", None)]:
        r = api(op, path)
        assert r.status_code == 403 and r.json()["error"]["code"] == "not_opted_in"


def test_full_setup_loop(api):
    me = opt_in(api)
    assert me["optedIn"] and me["poolId"] == "pool_sf_city"

    setup = api("getSetup").json()
    assert {"device_calendar", "google_maps", "eventbrite"} <= set(setup["suggestedProviders"])

    c = api("connectConnector", "/v1/connectors/google_maps").json()
    assert c["status"] == "connected" and c["signalCount"] >= 2
    sigs = api("listSignals").json()["items"]
    freq = [s for s in sigs if s["kind"] == "frequent_place"]
    assert freq and freq[0]["venue"]["venueId"] == "vn_little_fern"
    assert freq[0]["label"] == "You've been to Little Fern Kitchen 4 times this month"  # R12 voice
    assert {e["type"] for e in realtime.sent if e["userId"] == "u_maya"} >= {"signals.updated", "me.updated"}

    sid = freq[0]["signalId"]
    assert (
        api("setSignalVisibility", f"/v1/signals/{sid}", json={"visibility": "hidden"}).json()["visibility"] == "hidden"
    )

    me = api(
        "completeSetup",
        json={"acceptedInterestIds": [], "hiddenInterestIds": [], "groupSize": {"min": 3, "max": 5},
              "travel": {"maxMinutes": 30, "modes": ["walk"]}, "profileVisibility": "public"},
    ).json()  # fmt: skip
    assert me["setupComplete"] and me["travel"]["maxMinutes"] == 30

    r = api("syncCalendar", json=BUSY).json()
    assert r == {"acceptedBusy": 1, "directives": []}
    u = store.users["u_maya"]
    assert u["busy"] == [{"start": "2026-11-14T17:00:00Z", "end": "2026-11-14T19:00:00Z", "source": "device_calendar"}]
    assert store.applied["u_maya"] == {"jn_x": "hold"}

    assert api("disconnectConnector", "/v1/connectors/google_maps").status_code == 204
    assert [s for s in api("listSignals").json()["items"] if s["provider"] == "google_maps"] == []


def test_connector_errors(api):
    opt_in(api)
    assert api("connectConnector", "/v1/connectors/meetup").status_code == 409
    assert api("connectConnector", "/v1/connectors/myspace").status_code == 404


def test_deleted_signal_stays_deleted(api):
    opt_in(api)
    api("connectConnector", "/v1/connectors/google_maps")
    sid = api("listSignals").json()["items"][0]["signalId"]
    assert api("deleteSignal", f"/v1/signals/{sid}").status_code == 204
    api("connectConnector", "/v1/connectors/eventbrite")  # re-derives
    assert sid not in {s["signalId"] for s in api("listSignals").json()["items"]}


def test_p7_signals_owner_only(api):
    opt_in(api)
    api("connectConnector", "/v1/connectors/google_maps")
    mine = {s["signalId"] for s in store.users["u_maya"]["signals"].values()}
    theirs = api("listSignals", headers={"X-CG-User": "u_0098"}).json()["items"]
    assert mine and not mine & {s["signalId"] for s in theirs}


def test_sensitive_venue_signal_starts_hidden():
    from cg_api import seed

    store.venues["vn_quiet"] = {**store.venues["vn_little_fern"], "venueId": "vn_quiet", "kind": "meditation_center",
                                "sensitive": True}  # fmt: skip
    recs = [{"recordId": f"cr_q{i}", "userId": "u_maya", "provider": "google_maps", "kind": "place_visit",
             "at": f"2026-11-0{i}T17:00:00Z", "venueId": "vn_quiet"} for i in range(1, 5)]  # fmt: skip
    [s] = seed.rule_signals("u_maya", recs)
    assert s["sensitive"] and s["visibility"] == "hidden" and "meditation" in s["label"]


def test_optout_withdraws_and_clears(api):
    opt_in(api)
    api("connectConnector", "/v1/connectors/google_maps")
    store.joins["jn_t"] = {"joinId": "jn_t", "planId": "pl_sf_hero_wheel", "userId": "u_maya", "status": "interested"}
    assert api("optOut").status_code == 204
    u = store.users["u_maya"]
    assert not u["optedIn"] and u["signals"] == {} and store.joins["jn_t"]["status"] == "withdrawn"


def test_export_validates(api):
    opt_in(api)
    api("connectConnector", "/v1/connectors/google_maps")
    ex = api("exportPool", "/internal/v1/pools/pool_sf_city/export").json()  # validated against pool_export schema
    assert "u_maya" in {u["userId"] for u in ex["users"]}
    hero = next(p for p in ex["plans"] if p["planId"] == "pl_sf_hero_wheel")
    assert hero["interestedIds"] == ["u_0125", "u_0144"]
    assert api("exportPool", "/internal/v1/pools/pool_nope/export").status_code == 404


def test_seed_job_and_reset(api):
    r = api("loadSeed", json={"poolId": "pool_sf_city"})
    assert r.status_code == 202
    job = api("getJob", f"/internal/v1/jobs/{r.json()['jobId']}").json()
    assert job["status"] == "done", job
    assert api("loadSeed", json={"poolId": "pool_nope"}).status_code == 404
    opt_in(api)
    assert api("resetDemo").status_code == 204
    assert api("getMe").json()["optedIn"] is False


def test_static_is_confined(public):
    assert public.get("/static/avatars/..%2Fpool.json").status_code == 404
    assert public.get("/static/secrets/x.png").status_code == 404


def test_config_demo_from_seed(api):
    assert api("getConfig").json()["demo"]["fakeLocation"] == {"lat": 37.7594, "lng": -122.4676}


def test_extractor_gets_venue_lookup(apps):
    from cg_api.ports import ports

    assert ports.extractor.venue("vn_little_fern")["name"] == "Little Fern Kitchen"
    assert ports.extractor.venue("vn_nope") is None


def test_p4_sensitive_place_fails_closed(api):
    """Maya's meditation-centre visits: signal is sensitive and hidden, label names no place, export marks it."""
    from cg_api.ports import StubExtractor, ports

    assert StubExtractor().venue("vn_sunset_meditation")["sensitive"] is True  # default lookup, before any rebinding
    assert ports.extractor.venue("vn_sunset_meditation")["sensitive"] is True
    opt_in(api)
    api("connectConnector", "/v1/connectors/google_maps")
    [s] = [s for s in api("listSignals").json()["items"] if s["sensitive"]]
    assert s["visibility"] == "hidden" and s["venue"] is None and "Sunset Meditation" not in s["label"]
    ex = api("exportPool", "/internal/v1/pools/pool_sf_city/export").json()
    maya = next(u for u in ex["users"] if u["userId"] == "u_maya")
    [e] = [x for x in maya["signals"] if x["venueId"] == "vn_sunset_meditation"]
    assert e["sensitive"] and e["visibility"] == "hidden"


def test_setup_with_interests_hides_sensitive_from_copy(api):
    opt_in(api)
    u = store.users["u_maya"]
    u["interests"]["arts_crafts.ceramics.wheel_throwing"] = {
        "id": "arts_crafts.ceramics.wheel_throwing", "weight": 0.7, "visibility": "shown", "sensitive": False,
        "source": "activity"}  # fmt: skip
    u["interests"]["identity_values.faith.buddhism"] = {
        "id": "identity_values.faith.buddhism", "weight": 0.9, "visibility": "hidden", "sensitive": True,
        "source": "connector"}  # fmt: skip
    s = api("getSetup").json()
    assert "wheel throwing" in s["museText"].lower() and "buddhism" not in s["museText"].lower()
    assert len(s["proposedInterests"]) == 2  # owner still sees both


def test_rejected_profile_update_changes_nothing(api):
    before = api("getMe").json()
    r = api("updateMe", json={"groupSize": {"min": 6, "max": 4}, "neighborhood": "Mission"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "validation_failed"
    assert r.json()["error"]["message"] == "Group size minimum is above the maximum."
    assert (
        api("updateMe", json={"travel": {"maxMinutes": 1}}).json()["error"]["message"]
        == "Something in that request isn't right."
    )
    assert api("getMe").json() == before
    opt_in(api)
    r = api("completeSetup", json={"acceptedInterestIds": [], "hiddenInterestIds": [], "groupSize": {"min": 6, "max": 4},
                                   "travel": {"maxMinutes": 30, "modes": ["walk"]}, "profileVisibility": "private"})  # fmt: skip
    assert r.status_code == 400
    me = api("getMe").json()
    assert me["groupSize"] == before["groupSize"] and me["profileVisibility"] == "public" and not me["setupComplete"]


def test_event_mode_switch_on_real_seed(api, monkeypatch):
    """Both seeded pools load side by side; Maya can switch city -> event and back (demo script 4:15)."""
    import asyncio
    from pathlib import Path

    import pytest

    from cg_api import seed, settings

    data = Path(__file__).resolve().parents[4] / "data"
    if not (data / "seed" / "pool_evt_closer_together" / "pool.json").exists():
        pytest.skip("event seed not in data/seed")
    monkeypatch.setattr(seed, "get_settings", lambda: settings.Settings(data_dir=data))
    try:
        asyncio.run(seed.load("pool_sf_city"))
        modes = {m["mode"]: m for m in api("getConfig").json()["modes"]}
        assert modes["event"]["available"] and modes["city"]["available"]
        assert api("optIn", json={"mode": "city"}).json()["poolId"] == "pool_sf_city"
        assert api("optIn", json={"mode": "event"}).json()["poolId"] == "pool_evt_closer_together"
        ex = api("exportPool", "/internal/v1/pools/pool_evt_closer_together/export").json()
        assert "u_maya" in {u["userId"] for u in ex["users"]}
        assert all(p["planId"].startswith("pl_") for p in ex["plans"]) and ex["plans"]
        assert api("listPools").json()["items"][1]["members"] == 81  # 80 personas + Maya
        from cg_api.store import store

        evt = [p for p in store.plans.values() if p["poolId"] == "pool_evt_closer_together"]
        assert len(evt) == 67 and all(p["venueId"] in store.venues for p in evt)  # both pools whole
        assert all(x in store.plans for x in store.demos["pool_evt_closer_together"]["featuredPlanIds"])
        crux = [v for k, v in store.venues.items() if k.startswith("vn_crux_collective")]
        assert len({(v["location"]["lat"], v["location"]["lng"]) for v in crux}) == len(crux)
    finally:
        monkeypatch.undo()
        asyncio.run(seed.load("pool_sf_city"))


def test_me_rewards_own_only(api):
    """Me.rewards counts the user's counted meetups and points at the next unlock; no other surface carries it."""
    me = api("getMe").json()  # validated against Me (incl. Rewards)
    assert me["rewards"] == {"confirmedMeetups": 0, "streakWeeks": 0,
                             "nextUnlock": {"unlockId": "create_plans", "label": "Create your own meetups", "remaining": 1}}  # fmt: skip
    store.meetups["mt_r"] = {"meetupId": "mt_r", "startsAt": "2026-11-10T18:00:00Z", "endsAt": "2026-11-10T20:00:00Z",
                             "members": {"u_maya": {"counted": True}, "u_0125": {"counted": False}}}  # fmt: skip
    r = api("getMe").json()["rewards"]
    assert (
        r["confirmedMeetups"] == 1
        and r["nextUnlock"]["unlockId"] == "bigger_groups"
        and r["nextUnlock"]["remaining"] == 2
    )
    assert api("getMe", headers={"X-CG-User": "u_0125"}).json()["rewards"]["confirmedMeetups"] == 0
    other = api("getPerson", "/v1/people/u_maya", headers={"X-CG-User": "u_0125"})
    assert "rewards" not in other.text  # P-private: never on someone else's profile


def test_unlocks_follow_counted_meetups(api):
    """One counted meetup unlocks plan creation in Me.capabilities and Me.unlocks; reports block "regular"."""
    me = api("getMe").json()
    assert me["unlocks"] == [] and me["capabilities"]["canCreatePlans"] is False
    for k in range(5):
        store.meetups[f"mt_u{k}"] = {"meetupId": f"mt_u{k}", "startsAt": f"2026-11-0{k + 1}T18:00:00Z",
                                     "endsAt": f"2026-11-0{k + 1}T20:00:00Z", "members": {"u_maya": {"counted": True}}}  # fmt: skip
        if k == 0:
            me = api("getMe").json()
            assert me["capabilities"]["canCreatePlans"] is True
            assert me["unlocks"] == [{"unlockId": "create_plans", "label": "Create your own meetups",
                                      "earnedAt": "2026-11-01T18:00:00Z"}]  # fmt: skip
    me = api("getMe").json()
    assert [u["unlockId"] for u in me["unlocks"]] == ["create_plans", "bigger_groups", "regular"]
    assert me["capabilities"]["maxGroupSize"] == 8 and me["capabilities"]["openJoinsMax"] == 7
    store.reports.append({"reportId": "rp_t", "userId": "u_maya", "by": "u_0098"})
    assert "regular" not in [u["unlockId"] for u in api("getMe").json()["unlocks"]]


def test_extraction_cache_split_by_mode(monkeypatch):
    """Fake-Muse extraction results are never served to a live-Muse run (and vice versa)."""
    import asyncio

    from cg_api import seed
    from cg_api.ports import ports

    class Counting:
        calls = 0
        muse_live = False
        cache_version = 99  # private cache namespace for this test

        async def extract(self, uid, activity, records):
            Counting.calls += 1
            return {"interests": [], "signals": []}

    monkeypatch.setattr(ports, "extractor", Counting())
    for live, expected in ((False, 1), (False, 1), (True, 2), (True, 2)):
        ports.extractor.muse_live = live
        asyncio.run(seed._extract("u_maya", [{"recordId": "cr_cache_probe"}], reextract=False))
        assert Counting.calls == expected
    for p in (seed.Path(seed.__file__).resolve().parents[3] / ".cache" / "extract").glob("Counting-*-v99-*.json"):
        p.unlink()
