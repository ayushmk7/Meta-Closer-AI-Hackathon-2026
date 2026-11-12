"""Every operation in both OpenAPI files answers with a body that validates against its schema."""

import pytest

from cg_api import contracts
from cg_api.settings import get_settings

ALL = [o for s in (contracts.PUBLIC, contracts.INTERNAL) for o in contracts.operations(s) if o.success[0] != 101]


def _request(op: contracts.Operation) -> dict:
    base = "file:///contracts/" + op.spec
    path = op.path
    query = {}
    for p in op.op.get("parameters", []) + contracts.doc(op.spec)["paths"][op.path].get("parameters", []):
        p, _ = contracts._deref(p, base)
        value = contracts.synth(p.get("schema", {"type": "string"}), base)
        if p["in"] == "path":
            path = path.replace("{" + p["name"] + "}", str(value))
        elif p["in"] == "query" and p.get("required"):
            query[p["name"]] = value
    body = op.op.get("requestBody", {}).get("content", {}).get("application/json")
    kw = {"params": query}
    if body:
        kw["json"] = contracts.synth(body["schema"], base)
    return {"method": op.method.upper(), "url": path, **kw}


@pytest.mark.parametrize("op", ALL, ids=lambda o: o.operation_id)
def test_operation_matches_contract(op, public, internal):
    """Schema-shaped request against the tiny seed: success or a declared error, body valid either way.
    Success paths for the real handlers are covered by tests/platform."""
    from conftest import call

    req = _request(op)
    call(
        public if op.spec == contracts.PUBLIC else internal,
        op.operation_id,
        req.pop("url"),
        **{k: v for k, v in req.items() if k != "method"},
    )


@pytest.mark.parametrize("op", [o for o in ALL if o.public_needs_user], ids=lambda o: o.operation_id)
def test_missing_identity_is_401(op, apps):
    from fastapi.testclient import TestClient

    r = TestClient(apps[0]).request(**_request(op))
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthenticated"
    if "default" in op.op["responses"]:
        contracts.validate(op, 401, r.json())


@pytest.mark.parametrize("op", contracts.operations(contracts.INTERNAL), ids=lambda o: o.operation_id)
def test_p9_internal_not_on_public(op, public):
    r = public.request(**_request(op))
    assert r.status_code in (404, 405)


def test_config_from_params(public):
    p = get_settings().params
    c = public.get("/v1/config").json()
    assert c["limits"]["feedMax"] == p["feed"]["size"]
    assert c["limits"]["groupSizeMin"] == p["groups"]["strangerSizeMin"]
    assert c["features"] == p["features"]
    assert [m["available"] for m in c["modes"] if m["mode"] == "campus"] == [False]
    assert c["demo"]["stepDelayS"] == p["demo"]["stepDelayS"]


def test_realtime_ping(public):
    with public.websocket_connect("/v1/ws?user=u_maya") as ws:
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}


def test_realtime_push_from_sync_handler(public):
    with public.websocket_connect("/v1/ws?user=u_maya") as ws:
        public.patch("/v1/me", json={"neighborhood": "Inner Sunset"})  # sync handler, runs in the threadpool
        assert ws.receive_json()["type"] == "me.updated"


@pytest.mark.parametrize("query", ["", "?user=", "?user=../../etc", "?user=u_nobody"])
def test_realtime_rejects_bad_identity(public, query):
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as e, public.websocket_connect("/v1/ws" + query) as ws:
        ws.receive_json()
    assert e.value.code == 1008


def test_realtime_ignores_junk_frames(public):
    with public.websocket_connect("/v1/ws?user=u_maya") as ws:
        for junk in ("hello", "[1]", "null", '{"type": 3}'):
            ws.send_text(junk)
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}
