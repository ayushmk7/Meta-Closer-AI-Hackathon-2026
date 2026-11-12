import pytest

from cg_api import contracts
from cg_api.routes import muse_bar


@pytest.fixture(autouse=True)
def opted_in(public):
    """C's feed module installs muse_bar.gate/plan_source: the bar needs opted-in users and serves real cards."""
    muse_bar.clear()
    assert public.post("/v1/muse/ask", json={"text": "coffee"}).json()["error"]["code"] == "not_opted_in"
    for u in ("u_maya", "u_0098"):
        assert public.post("/v1/optin", json={"mode": "city"}, headers={"X-CG-User": u}).status_code == 200
    yield
    muse_bar.clear()


def test_ask_muse_filters_example_cards_and_validates(public):
    muse_bar.clear()
    r = public.post("/v1/muse/ask", json={"text": "pottery"})
    assert r.status_code == 200, r.text
    contracts.validate(contracts.op_by_id("askMuse"), 200, r.json())
    body = r.json()
    assert body["plans"] and all(p["activityType"] == "ceramics_studio" for p in body["plans"])
    r2 = public.post("/v1/muse/ask", json={"text": "and karaoke?", "conversationId": body["conversationId"]})
    assert r2.json()["conversationId"] == body["conversationId"] and r2.json()["plans"] == []
    assert public.post("/v1/muse/ask", json={"text": "x" * 501}).json()["error"]["code"] == "validation_failed"


def test_ask_muse_rate_limited(public):
    muse_bar.clear()
    codes = [public.post("/v1/muse/ask", json={"text": "coffee"}).status_code for _ in range(31)]
    assert codes[-1] == 429 and set(codes[:-1]) == {200}
    muse_bar.clear()


def test_conversations_are_owner_scoped_and_unguessable(public):
    muse_bar.clear()
    cid = public.post("/v1/muse/ask", json={"text": "something near my therapist"}).json()["conversationId"]
    assert len(cid) > 10
    other = public.post("/v1/muse/ask", json={"text": "coffee", "conversationId": cid}, headers={"X-CG-User": "u_0098"})
    assert other.json()["conversationId"] != cid
    assert all(
        "therapist" not in m["content"] for m in muse_bar._conversations[("u_0098", other.json()["conversationId"])]
    )
    assert (
        public.post("/v1/muse/ask", json={"text": "  "}).json()["error"]["message"] == "Tell me what you'd like to do."
    )
    muse_bar.clear()
