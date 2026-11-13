"""A's store and slice C's World are one world: A's setup feeds C's feed/joins; reset restores both."""

import pytest

dw = pytest.importorskip("cg_api.domain.world")

from cg_api.store import store


def test_one_world_end_to_end(api):
    assert dw.current is store.world and store.plans is store.world.plans
    if hasattr(store.world, "nudges"):
        assert store.nudges is store.world.nudges
    api("optIn", json={"mode": "city"})
    api("connectConnector", "/v1/connectors/google_maps")
    api("updateMe", json={"travel": {"maxMinutes": 60, "modes": ["transit"]}})
    w = dw.current.users["u_maya"]
    assert w["optedIn"] and w["travel"]["maxMinutes"] == 60  # A's change visible to C
    assert any(s["sensitive"] for s in w["signals"]) and all("recordIds" not in s for s in w["signals"])

    feed = api("getFeed")
    assert feed.status_code == 200, feed.text
    j = api("joinPlan", "/v1/plans/pl_sf_hero_wheel/join").json()
    assert j["status"] in ("interested", "matched")
    hero = next(p for p in api("exportPool", "/internal/v1/pools/pool_sf_city/export").json()["plans"]
                if p["planId"] == "pl_sf_hero_wheel")  # fmt: skip
    assert "u_maya" in hero["interestedIds"]  # export reads C's joins

    assert api("resetDemo").status_code == 204
    assert dw.current is store.world and store.joins is store.world.joins
    assert not dw.current.users["u_maya"]["optedIn"]
    assert not [j for j in store.joins.values() if j["userId"] == "u_maya"]
