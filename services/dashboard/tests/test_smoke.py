"""Smoke: every page renders and every API the page calls works against the fake internal API."""

import json
import re
import shutil
import subprocess
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from cg_dashboard import app
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


def test_page_and_vendored_libs_served(dash):
    status, body = call(dash[0] + "/replay")
    assert status == 200 and b"Low-outgoing people still isolated" in body
    for f in ("maplibre-gl.js", "maplibre-gl.css", "qrcode.min.js"):
        assert f"/vendor/{f}".encode() in body
        assert call(dash[0] + "/vendor/" + f)[0] == 200
    assert b"https://unpkg" not in body and b"cdnjs" not in body


def test_inline_script_parses(tmp_path):
    node = shutil.which("node")
    if not node:
        pytest.skip("node not installed")
    html = (Path(app.__file__).parent / "static" / "index.html").read_text()
    js = tmp_path / "page.js"
    js.write_text(re.search(r"<script>(.*?)</script>", html, re.S).group(1))
    r = subprocess.run([node, "--check", str(js)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


def test_foreign_host_or_origin_forbidden(dash):
    base, state = dash
    port = base.rsplit(":", 1)[1]
    n = len(state["calls"])
    for headers, method in [
        ({"Host": "evil.example"}, "GET"),  # DNS rebinding
        ({"Host": f"127.0.0.1:{port}", "Origin": "http://evil.example"}, "POST"),  # CSRF from another tab
    ]:
        req = urllib.request.Request(base + "/api/i/demo/reset", data=b"{}" if method == "POST" else None, method=method, headers=headers)
        with pytest.raises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(req, timeout=5)
        assert e.value.code == 403
    assert len(state["calls"]) == n  # nothing reached the internal API
    same = urllib.request.Request(base + "/api/i/demo/reset", data=b"{}", method="POST", headers={"Origin": f"http://127.0.0.1:{port}"})
    assert urllib.request.urlopen(same, timeout=5).status == 204


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
