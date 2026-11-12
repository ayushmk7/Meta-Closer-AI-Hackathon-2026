"""internalHealth, listPools, exportPool, reloadLayaTables."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter
from pydantic import BaseModel

from cg_api.errors import ApiError
from cg_api.settings import get_settings
from cg_api.store import now_iso, store

router = APIRouter()
log = logging.getLogger("cg_api.internal")


@router.get("/internal/v1/health", operation_id="internalHealth")
def internal_health():
    return {"status": "ok" if store.pool else "degraded"}


def members(pool_id: str) -> list[str]:
    return [uid for uid, u in store.users.items() if u["optedIn"] and u["poolId"] == pool_id]


@router.get("/internal/v1/pools", operation_id="listPools")
def list_pools():
    items = []
    for p in get_settings().contract("modes.yaml")["pools"]:
        ids = members(p["poolId"])
        items.append({"poolId": p["poolId"], "mode": p["mode"], "label": p["label"], "members": len(ids),
                      "synthetic": sum(store.users[u]["synthetic"] for u in ids)})  # fmt: skip
    return {"items": items}


def _pairs(uid: str, met_only: bool) -> list[str]:
    return sorted(
        o
        for k, c in store.connections.items()
        if uid in k and (not met_only or c["status"] == "met")
        for o in k - {uid}
    )


def export(pool_id: str) -> dict:
    """schemas/pool_export.schema.json. Internal only: exact homes, hidden and sensitive data."""
    if pool_id not in store.pools:
        raise ApiError(404, "not_found", "That pool isn't loaded.")
    users = []
    for uid in members(pool_id):
        u = store.users[uid]
        p = u["persona"]
        users.append(
            {
                "userId": uid,
                "synthetic": u["synthetic"],
                "profileVisibility": u["profileVisibility"],
                "homeLocation": p["homeLocation"],
                "neighborhood": u["neighborhood"],
                "ageBand": p["ageBand"],
                "availability": u["availability"],
                "groupSize": u["groupSize"],
                "interests": [
                    {
                        "id": i["id"],
                        "weight": i["weight"],
                        "visibility": i["visibility"],
                        "sensitive": i["sensitive"],
                        **({"sharedSensitiveOptIn": True} if i.get("sharedSensitiveOptIn") else {}),
                    }
                    for i in sorted(u["interests"].values(), key=lambda i: i["id"])
                ],
                "groupOnly": True,
                "trustFloorOk": u.get("trustFloorOk", True),
                "connectionIds": _pairs(uid, met_only=False),
                "blockedIds": sorted(o for k in store.blocks if uid in k for o in k - {uid}),
                "travel": u["travel"],
                "busy": [{"start": b["start"], "end": b["end"]} for b in sorted(u["busy"], key=lambda b: b["start"])],
                "signals": [
                    {
                        k: s[k]
                        for k in (
                            "signalId",
                            "provider",
                            "kind",
                            "interestIds",
                            "venueId",
                            "strength",
                            "visibility",
                            "sensitive",
                        )
                    }
                    for s in u["signals"].values()
                ],
                "metIds": _pairs(uid, met_only=True),
            }
        )
    plans = []
    for pid, pl in store.plans.items():
        if pl.get("poolId") != pool_id:
            continue
        joined = [
            j["userId"] for j in store.joins.values() if j["planId"] == pid and j["status"] in ("interested", "matched")
        ]
        plans.append({"planId": pid, "status": pl["status"], "interestedIds": joined,
                      "meetupIds": [m for m, mt in store.meetups.items() if mt.get("planId") == pid]})  # fmt: skip
    return {
        "poolId": pool_id,
        "mode": store.pools[pool_id]["mode"],
        "generatedAt": now_iso(),
        "taxonomyVersion": store.pools[pool_id]["taxonomyVersion"],
        "questionsVersion": get_settings().params["laya"]["questionsVersion"],
        "users": users,
        "plans": plans,
    }


@router.get("/internal/v1/pools/{poolId}/export", operation_id="exportPool")
def export_pool(poolId: str):
    return export(poolId)


def load_tables(pool_id: str) -> dict:
    """Point the store at data/laya_tables/<poolId>/ if its manifest matches questionsVersion. FileNotFoundError if absent."""
    d = get_settings().data_dir / "laya_tables" / pool_id
    manifest = json.loads((d / "manifest.json").read_text())
    want = get_settings().params["laya"]["questionsVersion"]
    if manifest.get("questionsVersion") != want:
        log.warning(
            "laya tables for %s have questionsVersion %s, want %s; ignored",
            pool_id,
            manifest.get("questionsVersion"),
            want,
        )
        store.laya_tables_dir = None
        return {"rows": {}, "questionsVersion": manifest.get("questionsVersion")}
    store.laya_tables_dir = str(d)
    log.info("laya tables loaded from %s: %s", d, manifest.get("rows"))
    return {"rows": {k: int(v) for k, v in manifest.get("rows", {}).items()}, "questionsVersion": want}


class PoolBody(BaseModel):
    poolId: str


@router.post("/internal/v1/laya-tables/reload", operation_id="reloadLayaTables")
def reload_laya_tables(body: PoolBody):
    try:
        return load_tables(body.poolId)
    except FileNotFoundError:
        raise ApiError(404, "not_found", f"No laya tables for {body.poolId}.") from None
