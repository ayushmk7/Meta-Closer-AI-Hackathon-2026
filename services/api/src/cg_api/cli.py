"""`cg-api` (both listeners, one process) and `cg-api-load-seed <poolId>`."""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import sys
import time

import httpx
import uvicorn

from cg_api.settings import get_settings


def is_loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host.strip("[]")).is_loopback
    except ValueError:
        return False


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    from cg_api import seed
    from cg_api.app import create_apps

    s = get_settings()
    if not is_loopback(s.internal_host):  # P9: the internal API is never reachable off this machine
        raise SystemExit(
            f"cg-api: CG_INTERNAL_HOST must be loopback (127.0.0.1, ::1, localhost), got {s.internal_host!r}"
        )
    public, internal = create_apps()
    default_pool = s.contract("modes.yaml")["pools"][0]["poolId"]
    asyncio.run(seed.load(default_pool))  # data/seed/<pool> if present, else the tiny built-in seed
    servers = [
        uvicorn.Server(uvicorn.Config(public, host=s.api_host, port=s.api_port, log_level="info")),
        uvicorn.Server(uvicorn.Config(internal, host=s.internal_host, port=s.internal_port, log_level="info")),
    ]

    async def run() -> None:
        await asyncio.gather(*(srv.serve() for srv in servers))

    asyncio.run(run())


def load_seed() -> None:
    """Same as POST /internal/v1/seed/load against the running process; waits for the job."""
    if len(sys.argv) != 2:
        raise SystemExit("usage: cg-api-load-seed <poolId>")
    s = get_settings()
    base = f"http://{s.internal_host}:{s.internal_port}/internal/v1"
    with httpx.Client(timeout=120) as c:
        job = c.post(f"{base}/seed/load", json={"poolId": sys.argv[1]}).raise_for_status().json()
        print(job)
        while job.get("status") in ("queued", "running"):
            time.sleep(1)
            job = c.get(f"{base}/jobs/{job['jobId']}").raise_for_status().json()
            print(job)
        if job.get("status") == "failed":
            raise SystemExit(1)
