"""resetDemo. (getDemoState, setDemoState, advanceMeetup: M2.)"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Response

from cg_api.store import store

router = APIRouter()
log = logging.getLogger("cg_api.demo")


@router.post("/internal/v1/demo/reset", operation_id="resetDemo", status_code=204)
def reset_demo():
    t = time.monotonic()
    store.reset()
    log.info("demo reset in %.2fs", time.monotonic() - t)
    return Response(status_code=204)
