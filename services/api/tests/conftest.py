import asyncio
import os
from pathlib import Path

os.environ.setdefault("DEMO_MODE", "1")
os.environ.setdefault("MUSE_FAKE", "1")
os.environ.setdefault("LAYA_FAKE", "1")
# Tests always run on the tiny built-in seed, whatever data/seed/ holds.
os.environ["CG_DATA_DIR"] = str(Path(__file__).parent / "no-data")

import pytest
from fastapi.testclient import TestClient

from cg_api import contracts, seed
from cg_api.app import create_apps
from cg_api.store import store

USER = {"X-CG-User": "u_maya"}


@pytest.fixture(scope="session")
def apps():
    apps = create_apps()  # installs slice D providers first, like cg-api does
    asyncio.run(seed.load("pool_sf_city"))
    return apps


@pytest.fixture(autouse=True)
def _fresh_world(apps):
    store.reset()
    yield


@pytest.fixture(scope="session")
def public(apps):
    return TestClient(apps[0], headers=USER)


@pytest.fixture(scope="session")
def internal(apps):
    return TestClient(apps[1], base_url="http://127.0.0.1:9001")  # the internal listener answers loopback hosts only


def call(client, operation_id: str, path: str | None = None, **kw):
    """Call an operation and validate the response against the spec, success or error. Returns the response."""
    op = contracts.op_by_id(operation_id)
    r = client.request(op.method.upper(), path or op.path, **kw)
    declared = str(r.status_code) in op.op["responses"] or "default" in op.op["responses"]
    if not declared and r.status_code == 401 and op.public_needs_user:  # spec omits `default` on a few GETs
        op = contracts.op_by_id("updateMe")  # any op whose default is the Error envelope
    else:
        assert declared, f"{operation_id} returned undeclared {r.status_code}: {r.text}"
    contracts.validate(op, r.status_code, r.json() if r.content else None)
    return r


@pytest.fixture
def api(public, internal):
    """api(opId, path?, **kw) -> response, validated; picks the listener from the spec."""

    def _api(operation_id, path=None, **kw):
        op = contracts.op_by_id(operation_id)
        return call(public if op.spec == contracts.PUBLIC else internal, operation_id, path, **kw)

    return _api
