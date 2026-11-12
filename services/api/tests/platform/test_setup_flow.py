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
    assert freq and freq[0]["venue"]["venueId"] == "vn_lands_end"
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

    store.venues["vn_quiet"] = {**store.venues["vn_lands_end"], "venueId": "vn_quiet", "kind": "meditation_center",
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

    assert ports.extractor.venue("vn_lands_end")["name"] == "Lands End Trail"
    assert ports.extractor.venue("vn_nope") is None
