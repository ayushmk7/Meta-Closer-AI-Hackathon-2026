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


def test_isolated_and_export_pairs_match_a_full_scan(api):
    store.connections[frozenset(("u_0125", "u_0144"))] = {"connectionId": "cn_a", "status": "met"}
    store.connections[frozenset(("u_0125", "u_0098"))] = {"connectionId": "cn_b", "status": "new"}
    store.blocks.add(frozenset(("u_0144", "u_0098")))
    met = lambda u: [o for k, c in store.connections.items() if c["status"] == "met" and u in k for o in k - {u}]
    g = api("poolGraph", "/internal/v1/pools/pool_sf_city/graph").json()
    assert {n["userId"] for n in g["nodes"] if not n["isolated"]} == {
        u for u in ("u_0125", "u_0144") if u in {n["userId"] for n in g["nodes"]}
    }
    m = api("liveMetrics", "/internal/v1/metrics", params={"poolId": "pool_sf_city"}).json()
    assert m["isolated"] == sum(not met(n["userId"]) for n in g["nodes"])
    for u in api("exportPool", "/internal/v1/pools/pool_sf_city/export").json()["users"]:
        uid = u["userId"]
        assert u["metIds"] == sorted(met(uid))
        assert u["connectionIds"] == sorted(o for k in store.connections if uid in k for o in k - {uid})
        assert u["blockedIds"] == sorted(o for k in store.blocks if uid in k for o in k - {uid})


def test_advance_keeps_title_day_and_time_of_day_true(api):
    """ux-fable N-P0-2: "Sunday small plates" must not read "FRI 3:12 AM" after advance to completed."""
    from cg_api.domain.plans import TZ

    local = (datetime.now(TZ) + timedelta(days=3)).replace(hour=19, minute=0, second=0, microsecond=0)
    start = local.astimezone(UTC)
    day = local.strftime("%A")
    store.threads["th_t"] = {"threadId": "th_t", "meetupId": "mt_t", "title": f"{day} small plates", "members": [],
                             "messages": [], "readUpTo": {}}  # fmt: skip
    store.meetups["mt_t"] = {"meetupId": "mt_t", "planId": "pl_sf_hero_wheel", "venueId": "vn_clay_hour",
                             "threadId": "th_t", "title": f"{day} small plates at Little Fern", "status": "confirmed",
                             "startsAt": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                             "endsAt": (start + timedelta(minutes=90)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                             "members": {"u_maya": {"rsvp": "going"}}, "steps": []}  # fmt: skip
    api("advanceMeetup", "/internal/v1/demo/meetups/mt_t/advance", json={"to": "completed"})
    m = store.meetups["mt_t"]
    s = datetime.fromisoformat(m["startsAt"]).astimezone(TZ)
    assert (
        datetime.fromisoformat(m["endsAt"])
        < datetime.now(UTC)
        < datetime.fromisoformat(m["endsAt"]) + timedelta(days=1)
    )
    assert (s.hour, s.minute) == (19, 0)  # its own time of day, a few days back
    assert (
        m["title"] == f"{s:%A} small plates at Little Fern" and store.threads["th_t"]["title"] == f"{s:%A} small plates"
    )
    api("advanceMeetup", "/internal/v1/demo/meetups/mt_t/advance", json={"to": "leave_by"})
    assert m["title"].startswith(datetime.fromisoformat(m["startsAt"]).astimezone(TZ).strftime("%A"))


def test_advance_moves_the_plan_with_its_meetup(api):
    """ux-fable Pass 7: after an advance the plan (pop-up, join) and its meetup show the same day and title."""
    from cg_api.domain.plans import TZ

    p = store.plans["pl_sf_little_fern_table"]
    p["status"] = "closed"  # formed
    store.meetups["mt_t"] = {"meetupId": "mt_t", "planId": p["planId"], "venueId": p["venueId"], "title": p["title"],
                             "status": "confirmed", "startsAt": p["startsAt"], "endsAt": p["endsAt"],
                             "members": {"u_maya": {"rsvp": "going"}}, "steps": []}  # fmt: skip
    for to in ("leave_by", "completed"):
        api("advanceMeetup", "/internal/v1/demo/meetups/mt_t/advance", json={"to": to})
        m = store.meetups["mt_t"]
        assert (p["startsAt"], p["endsAt"], p["title"]) == (m["startsAt"], m["endsAt"], m["title"])
        assert p["title"].startswith(datetime.fromisoformat(p["startsAt"]).astimezone(TZ).strftime("%A"))
