"""Live Muse that 503s forever must not stall startup or the feed; precompute fills a resumable disk cache."""

import asyncio
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from cg_api import ports as P
from cg_api import seed
from cg_api.laya import LayaClient
from cg_api.muse import MuseClient
from cg_api.muse.copy import MuseCopy
from cg_api.muse.extract import Extractor
from cg_api.settings import get_settings


def stub(status: int, delay_s: float = 0):
    """An OpenAI-compatible Muse: 503 + Retry-After 60 forever, or a minimal Responses API answer."""
    calls = []

    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            calls.append(self.path)
            self.rfile.read(int(self.headers.get("content-length", 0)))
            time.sleep(delay_s)  # a slow Muse: the server thread sleeps, never our event loop
            if status == 503:
                body = {"error": {"message": "The backend is temporarily overloaded.", "type": "service_overloaded"}}
                self.send_response(503)
                self.send_header("retry-after", "60")
            else:
                text = json.dumps({"text": "Muse wrote this.", "title": "Muse title?", "starters": ["a", "b", "c"]})
                body = {
                    "id": "r1",
                    "object": "response",
                    "created_at": 0,
                    "model": "m",
                    "status": "completed",
                    "output": [
                        {
                            "type": "message",
                            "id": "m1",
                            "role": "assistant",
                            "status": "completed",
                            "content": [{"type": "output_text", "text": text, "annotations": []}],
                        }
                    ],
                    "parallel_tool_calls": False,
                    "tool_choice": "auto",
                    "tools": [],
                }
                self.send_response(200)
            raw = json.dumps(body).encode()
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def log_message(self, *a):
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, calls


@pytest.fixture
def live_muse(monkeypatch, tmp_path):
    def install(status, delay_s=0.0):
        srv, calls = stub(status, delay_s)
        muse = MuseClient(fake=False, base_url=f"http://127.0.0.1:{srv.server_port}/v1", api_key="x", timeout_s=8)
        laya = LayaClient(get_settings().contracts_dir, fake=True)
        copy = MuseCopy(muse, get_settings().contracts_dir, backoff_s=0.05, cache_path=tmp_path / "muse_copy.json")
        ex = Extractor(muse, laya, get_settings().contracts_dir, muse_live=True)
        ex.venue = P.ports.extractor.venue
        for k, v in {"muse": muse, "copy": copy, "extractor": ex}.items():
            monkeypatch.setattr(P.ports, k, v)
        return copy, calls, srv

    return install


def test_startup_and_feed_never_wait_on_an_overloaded_muse(live_muse, public):
    copy, calls, srv = live_muse(503)
    t0 = time.monotonic()
    asyncio.run(seed.load("pool_sf_city", reextract=True))  # what cg-api awaits before it listens
    assert time.monotonic() - t0 < 3, f"seed load took {time.monotonic() - t0:.1f}s"
    assert not [c for c in calls if "responses" in c], "extraction must not call Muse on the startup path"
    assert public.post("/v1/optin", json={"mode": "city"}).status_code == 200
    t0 = time.monotonic()
    assert public.get("/v1/feed").status_code == 200
    assert time.monotonic() - t0 < 0.5

    async def one_fill():  # the SDK must not honour Retry-After 60: three tries, capped backoff, then give up
        t = time.monotonic()
        await copy.plan_reason({"title": "x", "venue": {"name": "v"}, "startsAt": "2026-11-14T18:00:00Z"}, [])
        await copy.drain()
        return time.monotonic() - t

    assert asyncio.run(one_fill()) < 3 and copy._failed
    srv.shutdown()


def test_precompute_cache_is_on_disk_and_reused(live_muse):
    copy, calls, srv = live_muse(200)

    async def go():
        await copy.plan_reason({"title": "x", "venue": {"name": "v"}, "startsAt": "2026-11-14T18:00:00Z"}, [])
        await copy.drain()

    asyncio.run(go())
    assert json.loads(copy.cache_path.read_text())  # persisted as soon as it arrived
    warm = MuseCopy(P.ports.muse, get_settings().contracts_dir, cache_path=copy.cache_path)
    n = len(calls)
    got = asyncio.run(warm.plan_reason({"title": "x", "venue": {"name": "v"}, "startsAt": "2026-11-14T18:00:00Z"}, []))
    assert got == "Muse wrote this." and len(calls) == n  # a restarted server answers from disk, no Muse call
    srv.shutdown()


def test_checkpoint_flow_confirms_with_a_slow_muse(live_muse, monkeypatch):
    """Muse takes 10 s per call: join -> group forms -> approve -> confirmed, within 30 s (live test, #65).
    Runs on the repo's real data/seed (the tiny built-in seed has no group that seats Maya after setup)."""
    import httpx

    from cg_api.app import create_apps

    repo_seed = Path(__file__).resolve().parents[4] / "data"
    if not (repo_seed / "seed" / "pool_sf_city" / "pool.json").exists():
        pytest.skip("needs data/seed/pool_sf_city")
    monkeypatch.setattr(seed, "seed_dir", lambda pid: repo_seed / "seed" / pid)

    live_muse(200, delay_s=10)
    pub, _ = create_apps()

    async def flow():
        await seed.load("pool_sf_city", reextract=True)
        h = {"X-CG-User": "u_maya"}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=pub), base_url="http://cg", timeout=30) as c:
            t0 = time.monotonic()
            assert (await c.post("/v1/optin", json={"mode": "city"}, headers=h)).status_code == 200
            await c.post("/v1/connectors/google_maps", headers=h)
            su = (await c.get("/v1/me/setup", headers=h)).json()
            ids = lambda v: [i["interest"]["id"] for i in su["proposedInterests"] if i["visibility"] == v]
            body = {
                "acceptedInterestIds": ids("shown"),
                "hiddenInterestIds": ids("hidden"),
                "groupSize": su["proposedGroupSize"],
                "travel": su["proposedTravel"],
                "profileVisibility": "public",
            }
            assert (await c.post("/v1/me/setup", json=body, headers=h)).status_code == 200
            await c.get("/v1/feed", headers=h)
            await c.post("/v1/plans/pl_sf_hero_wheel/join", json={}, headers=h)
            t0 = time.monotonic()  # the 30 s budget runs from I'm in
            mt = None
            while not mt and time.monotonic() - t0 < 30:
                await asyncio.sleep(0.5)
                js = (await c.get("/v1/joins", headers=h)).json()["items"]
                mt = next((j["meetupId"] for j in js if j["planId"] == "pl_sf_hero_wheel"), None)
            assert mt, "group never formed"
            ap = None
            while not ap and time.monotonic() - t0 < 30:
                await asyncio.sleep(0.5)
                ap = [a for a in (await c.get("/v1/approvals", headers=h)).json()["items"] if a["status"] == "pending"]
            assert ap, "no approval"
            await c.post(f"/v1/approvals/{ap[0]['approvalId']}/decision", json={"decision": "approve"}, headers=h)
            status = None
            while status != "confirmed" and time.monotonic() - t0 < 30:
                await asyncio.sleep(0.5)
                status = (await c.get(f"/v1/meetups/{mt}", headers=h)).json()["status"]
            assert status == "confirmed", f"meetup {status} after {time.monotonic() - t0:.0f}s"

    asyncio.run(flow())
