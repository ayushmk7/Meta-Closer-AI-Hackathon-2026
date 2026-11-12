"""loadSeed (background job), getJob."""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from cg_api import seed
from cg_api.errors import ApiError

router = APIRouter()
log = logging.getLogger("cg_api.seed")
jobs: dict[str, dict] = {}  # outside the store: survives reloads and resets


class LoadSeed(BaseModel):
    poolId: str
    reextract: bool = False


async def _run(job: dict, pool_id: str, reextract: bool) -> None:
    job["status"] = "running"
    try:
        summary = await seed.load(pool_id, reextract=reextract, job=job)
        job.update(status="done", progress=1.0, message=f"Loaded {summary['users']} people, {summary['plans']} plans")
    except Exception as e:  # job reports it; the process keeps serving
        log.exception("seed load failed")
        job.update(status="failed", message=str(e)[:500])


@router.post("/internal/v1/seed/load", operation_id="loadSeed")
async def load_seed(body: LoadSeed, tasks: BackgroundTasks):
    try:
        seed.seed_dir(body.poolId)
    except FileNotFoundError:
        raise ApiError(404, "not_found", f"No seed for {body.poolId}.") from None
    job = {"jobId": f"job_{len(jobs) + 1:04d}", "status": "queued", "progress": 0.0}
    jobs[job["jobId"]] = job
    tasks.add_task(_run, job, body.poolId, body.reextract)
    return JSONResponse(dict(job), status_code=202, background=tasks)


@router.get("/internal/v1/jobs/{jobId}", operation_id="getJob")
def get_job(jobId: str):
    if jobId not in jobs:
        raise ApiError(404, "not_found", "No such job.")
    return jobs[jobId]
