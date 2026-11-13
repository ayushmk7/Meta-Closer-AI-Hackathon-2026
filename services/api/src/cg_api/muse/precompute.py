"""`cg-api-precompute-muse <poolId>`: fill the Muse copy cache before the demo so the live server starts warm.

Loads the seed in-process, walks the demo users through the app's own requests (opt in, setup, connect every
simulated connector, setup again, feed, every plan, nudges) so Copy sees exactly the prompts the live server will
send, then waits for the background fills (3 at a time, 503s backed off). Every answer lands in
services/api/.cache/muse_copy.json as it arrives, so the command is resumable: run it again to finish what failed.
Nothing here touches the running server; its store is rebuilt from the seed at start.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time


async def run(pool_id: str) -> int:
    import httpx

    from cg_api import ports, seed
    from cg_api.app import create_apps
    from cg_api.domain import plans, world
    from cg_api.settings import get_settings
    from cg_api.store import store

    if get_settings().muse_fake:
        print("MUSE_FAKE=1: nothing to precompute (set MUSE_FAKE=0 and MODEL_API_KEY)")
        return 2
    public, _ = create_apps()
    await seed.load(pool_id)
    copy = ports.ports.copy
    before = len(copy.cache)
    demo = store.demo or {}
    users = [u for u in (demo.get("mayaId"), demo.get("liveUserId")) if u]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=public), base_url="http://cg", timeout=60) as c:
        modes = (await c.get("/v1/config", headers={"X-CG-User": users[0]})).json()["modes"]
        mode = next((m["mode"] for m in modes if m.get("poolId") == pool_id and m.get("available")), "city")
        for uid in users:
            h = {"X-CG-User": uid}
            await c.post("/v1/optin", json={"mode": mode}, headers=h)
            await c.get("/v1/me/setup", headers=h)
            for con in (await c.get("/v1/connectors", headers=h)).json().get("items", []):
                if con.get("status") == "not_connected":
                    await c.post(f"/v1/connectors/{con['provider']}", headers=h)
            await c.get("/v1/me/setup", headers=h)
            feed = (await c.get("/v1/feed", headers=h)).json()
            for p in feed.get("plans", []):
                await c.get(f"/v1/plans/{p['planId']}", headers=h)
            await c.get("/v1/nudges", headers=h)
            # every ranked plan the Muse bar can surface, not only the carousel (same call askMuse makes)
            ids = plans.ordered_ids(world.current, uid)
            await plans.warm_reasons(world.current, uid, ids)
            print(f"{uid}: walked setup, {len(feed.get('plans', []))} feed plans, {len(ids)} ranked plans", flush=True)
    t0 = time.monotonic()
    while copy._pending:
        print(
            f"  {len(copy.cache) - before} new, {len(copy._pending)} in flight, {time.monotonic() - t0:.0f}s",
            flush=True,
        )
        await asyncio.sleep(5)
    await copy.drain()
    print(
        f"done: {len(copy.cache)} cached ({len(copy.cache) - before} new), {len(copy._failed)} failed"
        f"{' (run again to retry)' if copy._failed else ''} -> {copy.cache_path}"
    )
    return 0 if not copy._failed else 1


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: cg-api-precompute-muse <poolId>")
    os.environ.setdefault("DEMO_MODE", "1")
    raise SystemExit(asyncio.run(run(sys.argv[1])))


if __name__ == "__main__":
    main()
