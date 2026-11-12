import os

os.environ.setdefault("DEMO_MODE", "1")
os.environ.setdefault("MUSE_FAKE", "1")
os.environ.setdefault("LAYA_FAKE", "1")

import pytest
from fastapi.testclient import TestClient

from cg_api.app import create_apps

USER = {"X-CG-User": "u_maya"}


@pytest.fixture(scope="session")
def apps():
    return create_apps()


@pytest.fixture(scope="session")
def public(apps):
    return TestClient(apps[0], headers=USER)


@pytest.fixture(scope="session")
def internal(apps):
    return TestClient(apps[1])
