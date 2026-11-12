"""M2 internal surfaces: demo controls, time travel, graph and metrics."""

from datetime import UTC, datetime, timedelta

from cg_api.store import store


def test_demo_state_drives_config(api):
    s = api("getDemoState").json()
    assert s["counterpart"] == "synthetic" and s["liveUserId"] == "u_0098" and s["failNextBooking"] is False
    s = api("setDemoState", json={"counterpart": "live", "fakeLocation": {"lat": 37.0, "lng": -122.0}}).json()
    assert s["counterpart"] == "live" and s["forcedYes"] is True  # untouched fields kept
    demo = api("getConfig").json()["demo"]
    assert demo["counterpart"] == "live" and demo["fakeLocation"] == {"lat": 37.0, "lng": -122.0}
    assert api("setDemoState", json={"liveUserId": "u_nobody"}).status_code == 400
    api("resetDemo")
    assert api("getDemoState").json()["counterpart"] == "synthetic"


def _meetup():
    start = datetime(2026, 11, 14, 18, tzinfo=UTC)
    store.meetups["mt_t"] = {"meetupId": "mt_t", "planId": "pl_sf_hero_wheel", "venueId": "vn_clay_hour",
                             "status": "confirmed", "startsAt": "2026-11-14T18:00:00Z", "endsAt": "2026-11-14T20:00:00Z",
                             "members": {u: {"rsvp": "going"} for u in ("u_maya", "u_0125", "u_0144")}, "steps": []}  # fmt: skip
    return start


def test_advance_meetup(api):
    _meetup()
    now = datetime.now(UTC)
    assert api("advanceMeetup", "/internal/v1/demo/meetups/mt_t/advance", json={"to": "window_open"}).status_code == 200
    m = store.meetups["mt_t"]
    starts, ends = datetime.fromisoformat(m["startsAt"]), datetime.fromisoformat(m["endsAt"])
    assert now < starts < now + timedelta(minutes=15) and ends - starts == timedelta(hours=2)
    api("advanceMeetup", "/internal/v1/demo/meetups/mt_t/advance", json={"to": "leave_by"})
    assert datetime.fromisoformat(m["startsAt"]) > now + timedelta(minutes=11)  # 1 + travel + buffer
    api("advanceMeetup", "/internal/v1/demo/meetups/mt_t/advance", json={"to": "completed"})
    assert m["status"] == "completed" and datetime.fromisoformat(m["endsAt"]) < datetime.now(UTC)
    assert api("advanceMeetup", "/internal/v1/demo/meetups/mt_x/advance", json={"to": "completed"}).status_code == 404


def test_graph_and_metrics(api):
    _meetup()
    store.connections[frozenset(("u_0125", "u_0144"))] = {"connectionId": "cn_t", "status": "met", "meetupsTogether": 2}
    g = api("poolGraph", "/internal/v1/pools/pool_sf_city/graph").json()
    kinds = {(e["a"], e["b"], e["kind"]) for e in g["edges"]}
    assert ("u_0125", "u_maya", "group") in kinds and ("u_0125", "u_0144", "friendship") in kinds
    assert "u_maya" not in {n["userId"] for n in g["nodes"]}  # not opted in: not on the internal map
    m = api("liveMetrics", "/internal/v1/metrics", params={"poolId": "pool_sf_city"}).json()
    assert m["meetupsConfirmed"] == 1 and m["connections"] == 1 and m["members"] == 4
    assert api("liveMetrics", "/internal/v1/metrics", params={"poolId": "pool_nope"}).status_code == 404
