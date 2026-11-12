"""Smoke: every page renders and every API the page calls works against the fake internal API."""

import json
import threading
import urllib.error
import urllib.request

import pytest

from cg_dashboard.app import make_server, replay_path
from cg_dashboard.fake import build_state, start_fake


@pytest.fixture(scope="module")
def dash(tmp_path_factory):
    state = build_state()
    srv = make_server("127.0.0.1", 0, start_fake(state))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}", state
    srv.shutdown()


def call(url, method="GET", body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


@pytest.mark.parametrize("page", ["/", "/map", "/replay", "/muse", "/controls"])
def test_pages_render(dash, page):
    status, body = call(dash[0] + page)
    assert status == 200
    for marker in [b"Muse's view of San Francisco (internal)", b"Low-outgoing people still isolated", b"Muse at work", b"Demo controls"]:
        assert marker in body


def test_graph_and_metrics_proxy(dash):
    status, body = call(dash[0] + "/api/i/pools/pool_sf_city/graph")
    g = json.loads(body)
    assert status == 200 and g["nodes"] and g["groups"][0]["memberIds"]
    status, body = call(dash[0] + "/api/i/metrics?poolId=pool_sf_city")
    assert status == 200 and "userDecisionsPerMeetup" in json.loads(body)


def test_demo_controls_reach_internal_api(dash):
    base, state = dash
    assert call(base + "/api/i/demo", "PUT", {"counterpart": "live"})[0] == 200
    assert state["demo"]["counterpart"] == "live"
    assert call(base + "/api/i/demo/nudges", "POST", {"userId": "u_maya"})[0] == 200
    assert call(base + "/api/i/plans/p_clay_sat/form", "POST", {})[0] == 200
    assert call(base + "/api/i/plans/regenerate", "POST", {"poolId": "pool_sf_city"})[0] == 200
    assert call(base + "/api/i/demo/meetups/m_0001/advance", "POST", {"to": "leave_by"})[0] == 200
    assert call(base + "/api/i/demo/reset", "POST", {})[0] == 204
    paths = [c[1] for c in state["calls"]]
    assert "/demo/reset" in paths and "/plans/p_clay_sat/form" in paths


def test_replay_fixture_shape(dash):
    status, body = call(dash[0] + "/api/replay")
    r = json.loads(body)
    assert status == 200 and r["people"]
    # mirrors services/sim/src/cg_sim/mc/replay.py (version 1)
    assert r["version"] == 1
    for pol in ("greedy", "common_ground"):
        assert [f["week"] for f in r["frames"][pol]] == list(range(1, r["weeks"] + 1))
        assert all(0 <= f["isolatedShareLowOut"] <= 1 for f in r["frames"][pol])
        chart = r["isolatedShare"][pol]
        assert chart["week"] == list(range(r["weeks"] + 1)) and len(chart["mean"]) == len(chart["week"])
    assert replay_path().exists()


def test_local_rejects_path_tricks(dash):
    assert call(dash[0] + "/api/local?poolId=../../etc")[0] == 400
    status, body = call(dash[0] + "/api/local?poolId=pool_sf_city")
    assert status == 200 and "lowOutgoingIds" in json.loads(body)


def test_unreachable_internal_api_is_502():
    srv = make_server("127.0.0.1", 0, "http://127.0.0.1:1")
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        assert call(f"http://127.0.0.1:{srv.server_address[1]}/api/i/metrics?poolId=x")[0] == 502
    finally:
        srv.shutdown()


@pytest.mark.parametrize("host", ["0.0.0.0", "8.8.8.8"])
def test_refuses_non_loopback(host):
    with pytest.raises(SystemExit):
        make_server(host, 0, "http://127.0.0.1:9001")
