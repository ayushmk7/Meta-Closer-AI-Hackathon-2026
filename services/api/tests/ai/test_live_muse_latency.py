"""Live Muse is slow (~10 s) and sheds load (503): request paths must never wait on it for copy."""

import asyncio
import socket
import time

import pytest

from cg_api import ports as ports_mod
from cg_api.muse import MuseClient, Unavailable
from cg_api.muse.copy import MuseCopy

PLAN = {
    "title": "Saturday wheel-throwing drop-in",
    "activityType": "ceramics_studio",
    "venue": {"name": "Clay Hour Studio"},
    "startsAt": "2026-11-14T18:00:00Z",
    "endsAt": "2026-11-14T20:00:00Z",
}
OK = [{"label": "Ceramics", "visibility": "shown", "sensitive": False}]


class Flaky:
    """503 twice, then a slow good answer."""

    def __init__(self, fails=2, delay=0.2):
        self.calls, self.fails, self.delay = [], fails, delay

    async def respond(self, purpose, input, **kw):
        self.calls.append((purpose, kw.get("effort")))
        if len(self.calls) <= self.fails:
            raise Unavailable("Error code: 503 - The backend is temporarily overloaded.")
        await asyncio.sleep(self.delay)
        return {"text": "", "json": {"text": "Clay people, Saturday morning."}, "tool_calls": []}


def test_reason_returns_template_now_and_muse_text_later():
    async def go():
        muse = Flaky()
        copy = MuseCopy(muse, backoff_s=0.01)
        t0 = time.monotonic()
        first = await copy.plan_reason(PLAN, OK)
        assert time.monotonic() - t0 < 0.05 and first == "For people into ceramics, at Clay Hour Studio on Saturday."
        assert await copy.plan_reason(PLAN, OK) == first  # still filling: no second Muse call queued
        await copy.drain()
        assert await copy.plan_reason(PLAN, OK) == "Clay people, Saturday morning."
        assert muse.calls == [("copy.reason", "low")] * 3  # 2 x 503 retried with backoff, then success

    asyncio.run(go())


def test_concurrency_is_bounded():
    class Count:
        now = peak = 0

        async def respond(self, purpose, input, **kw):
            Count.now += 1
            Count.peak = max(Count.peak, Count.now)
            await asyncio.sleep(0.05)
            Count.now -= 1
            return {"json": {"text": "ok"}}

    async def go():
        copy = MuseCopy(Count(), concurrency=3)
        for i in range(10):
            await copy.plan_reason({**PLAN, "title": f"Plan {i}"}, OK)
        await copy.drain()

    asyncio.run(go())
    assert Count.peak == 3


@pytest.fixture
def stalled_muse():
    """A real MuseClient (MUSE_FAKE=0 path) pointed at a socket that accepts and never answers."""
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen(64)
    old = ports_mod.ports.copy
    ports_mod.ports.copy = MuseCopy(
        MuseClient(fake=False, base_url=f"http://127.0.0.1:{srv.getsockname()[1]}/v1", api_key="x")
    )
    yield
    ports_mod.ports.copy = old
    srv.close()


def test_feed_is_fast_with_a_stalled_muse(public, stalled_muse, monkeypatch):
    from cg_api.domain import world

    asked = []
    fill = MuseCopy._fill
    monkeypatch.setattr(MuseCopy, "_fill", lambda self, key, *a: (asked.append(a[0]), fill(self, key, *a)))

    assert public.post("/v1/optin", json={"mode": "city"}).status_code == 200
    for p in world.current.plans.values():
        p.pop("reasons", None)  # C stores reasons per viewer; force fresh copy calls
    t0 = time.monotonic()
    r = public.get("/v1/feed")
    assert r.status_code == 200 and r.json()["plans"]
    assert time.monotonic() - t0 < 0.5, f"feed took {time.monotonic() - t0:.2f}s"
    assert asked, "feed should have asked Muse for copy (in the background)"
    t0 = time.monotonic()
    assert public.get("/v1/me/setup").status_code == 200 and time.monotonic() - t0 < 0.5


def test_interactive_muse_uses_the_params_live_timeout():
    from cg_api.settings import get_settings

    seen = []

    class Rec:
        async def respond(self, purpose, input, **kw):
            seen.append((purpose, kw.get("timeout_s"), kw.get("effort")))
            raise Unavailable("down")

    from cg_api.muse import bar

    asyncio.run(MuseCopy(Rec()).intro(["A", "B"], OK, PLAN))
    asyncio.run(bar.understand(Rec(), "coffee", [], "2026-11-12T18:00:00Z", get_settings().contracts_dir))
    # None = MuseClient's own timeout, which providers set from params.muse.liveTimeoutS (R5: no hardcoded copy)
    assert seen == [("copy.intro", None, "low"), ("bar", None, "low")]
