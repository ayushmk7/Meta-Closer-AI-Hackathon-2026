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


def test_gallery_prompt_text_end_to_end(public):
    """'Plan something like this': a share's promptText goes to askMuse and comes back as live cards."""
    shares = public.get("/v1/shares").json()["items"]
    assert shares, "tiny seed should seed some gallery shares"
    share = shares[0]
    r = public.post("/v1/muse/ask", json={"text": share["promptText"]})
    assert r.status_code == 200, r.text
    contracts.validate(contracts.op_by_id("askMuse"), 200, r.json())
    body = r.json()
    assert body["plans"] and body["plans"][0]["activityType"] == share["activityType"]
    assert body["reply"]["text"]
    assert not any(p["planId"].startswith("pl_000") for p in body["plans"])  # live cards, never spec examples
    assert body["plans"][0]["venue"]["venueId"] == share["venue"]["venueId"]


def test_nothing_fits_creates_a_meetup_once_unlocked(public, monkeypatch):
    """Chess maps to board games; with no exact fit, an unlocked user gets a new meetup (createdPlanId)."""
    from cg_api.domain import create_plan

    ask = "chess meetup at 3am on wednesday for 2 people under $1"  # nothing seeded fits exactly
    locked = public.post("/v1/muse/ask", json={"text": ask}).json()
    assert locked["createdPlanId"] is None
    monkeypatch.setattr(create_plan, "can_create", lambda w, uid: True)  # the unlock itself: test_create_plan
    r = public.post("/v1/muse/ask", json={"text": ask})
    contracts.validate(contracts.op_by_id("askMuse"), 200, r.json())
    body = r.json()
    assert body["createdPlanId"] and body["plans"][0]["planId"] == body["createdPlanId"]
    assert body["plans"][0]["activityType"] == "board_game_night"
    assert "set one up" in body["reply"]["text"]


def test_surprise_me_returns_one_meetup(public):
    body = public.post("/v1/muse/ask", json={"text": "Surprise me!"}).json()
    assert len(body["plans"]) == 1 and body["reply"]["text"].startswith("Try this one:")
    assert "Surprise me" not in body["prompts"]
