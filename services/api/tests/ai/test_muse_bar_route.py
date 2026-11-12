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
