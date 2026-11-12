import asyncio
import hashlib
import json
from pathlib import Path

import httpx
import pytest

from cg_api import laya

CONTRACTS = Path(__file__).resolve().parents[4] / "contracts"
GOLDEN = json.loads((CONTRACTS / "laya_golden.json").read_text())


@pytest.mark.parametrize("case", GOLDEN["cases"], ids=lambda c: c["name"])
def test_golden_byte_exact(case):
    if "fragment" in case:
        tpl = laya.load_questions(CONTRACTS)["fragments"][case["fragment"]]
        got = laya.user_summary(case["user"], case["alias"], tpl)
    else:
        state = {k: v for k, v in case.items() if k not in ("name", "question", "render")}
        got = laya.render(case["question"], state, CONTRACTS)
    assert got == case["render"]


def test_fake_formula_and_decisive():
    text = laya.render("plan_ok", {"text": "Ramen {Friday}?"}, CONTRACTS)
    assert text.endswith('"Ramen {Friday}?"')  # braces in user text are not re-expanded
    want = int(hashlib.sha256(f"2|plan_ok|{text}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    c = laya.LayaClient(CONTRACTS, fake=True)
    p, decisive = asyncio.run(c.ask("plan_ok", {"text": "Ramen {Friday}?"}))
    assert p == want and decisive == laya.is_decisive(p, 0.85)
    asyncio.run(c.ask("plan_ok", {"text": "Ramen {Friday}?"}))
    assert c.calls == {"live": 0, "fake": 1, "cached": 1, "failed": 0}
    assert laya.is_decisive(0.9, 0.85) and laya.is_decisive(0.1, 0.85) and not laya.is_decisive(0.5, 0.85)


def test_live_client_posts_contract_body_and_times_out(monkeypatch):
    seen = {}

    def handler(req: httpx.Request):
        seen.update(json.loads(req.content))
        return httpx.Response(200, json={"answers": {"plan_ok": {"p": 0.97}}})

    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    c = laya.LayaClient(CONTRACTS, fake=False, url="http://laya", model="laya")
    assert asyncio.run(c.ask("plan_ok", {"text": "Coffee?"})) == (0.97, True)
    assert seen["model"] == "laya" and seen["questions"]["plan_ok"]["type"] == "noul"
    assert seen["state"].startswith("Plan proposed by a user")

    def boom(req):
        raise httpx.ReadTimeout("slow", request=req)

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(boom), **kw))
    with pytest.raises(laya.LayaUnavailable):
        asyncio.run(c.ask("plan_ok", {"text": "Tea?"}))
