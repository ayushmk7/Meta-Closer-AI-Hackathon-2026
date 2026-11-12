from cg_api import contracts
from cg_api.routes import muse_bar


def test_ask_muse_filters_example_cards_and_validates(public):
    muse_bar.clear()
    r = public.post("/v1/muse/ask", json={"text": "pottery this weekend"})
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
    other = public.post("/v1/muse/ask", json={"text": "coffee", "conversationId": cid}, headers={"X-CG-User": "u_0042"})
    assert other.json()["conversationId"] != cid
    assert all("therapist" not in m["content"] for m in muse_bar._conversations[("u_0042", other.json()["conversationId"])])
    assert public.post("/v1/muse/ask", json={"text": "  "}).json()["error"]["message"] == "Tell me what you'd like to do."
    muse_bar.clear()
