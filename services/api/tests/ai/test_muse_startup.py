"""Live Muse that 503s forever must not stall startup or the feed; precompute fills a resumable disk cache."""

import asyncio
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from cg_api import ports as P
from cg_api import seed
from cg_api.laya import LayaClient
from cg_api.muse import MuseClient
from cg_api.muse.copy import MuseCopy
from cg_api.muse.extract import Extractor
from cg_api.settings import get_settings


def stub(status: int):
    """An OpenAI-compatible Muse: 503 + Retry-After 60 forever, or a minimal Responses API answer."""
    calls = []

    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            calls.append(self.path)
            self.rfile.read(int(self.headers.get("content-length", 0)))
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
    def install(status):
        srv, calls = stub(status)
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
