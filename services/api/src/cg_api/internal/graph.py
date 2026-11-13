"""poolGraph and liveMetrics for the dashboard. Internal only: exact homes and every edge."""

from __future__ import annotations

from collections import Counter
from functools import lru_cache

from fastapi import APIRouter

from cg_api.errors import ApiError
from cg_api.internal.pools import export, members
from cg_api.ports import Unavailable, matching
from cg_api.settings import get_settings
from cg_api.store import counters, now_iso, store

router = APIRouter()


def _met() -> set[str]:
    """Everyone with at least one met connection (one pass; was a scan of every pair per user)."""
    return {u for k, c in store.connections.items() if c.get("status") == "met" for u in k}


@lru_cache(maxsize=4)
def _candidates_and_scenes(key: tuple) -> tuple[dict, dict]:
    """ponytail: cached per (pool, members, interest weights); recomputed when any of them change."""
    cgm = matching()
    params = cgm.Params(get_settings().params)
    snap = cgm.PoolSnapshot.from_export(export(key[0]))
    cands = cgm.candidates(snap, cgm.build_vectors(snap, params), params)
    return cands, cgm.scenes(snap, cands, params, params["matching"]["rngSeedDefault"])


def _cache_key(pool_id: str) -> tuple:
    return (pool_id, tuple(sorted((u, tuple(sorted((i["id"], i["weight"], i["visibility"]) for i in store.users[u]["interests"].values()))) for u in members(pool_id))))  # fmt: skip


@router.get("/internal/v1/pools/{poolId}/graph", operation_id="poolGraph")
def pool_graph(poolId: str):
    if poolId not in store.pools:
        raise ApiError(404, "not_found", "That pool isn't loaded.")
    ids = members(poolId)
    try:
        cands, scene_of = _candidates_and_scenes(_cache_key(poolId))
    except Unavailable:
        cands, scene_of = {}, {}
    open_joins = Counter(j["userId"] for j in store.joins.values() if j["status"] == "interested")
    conns = Counter(u for k in store.connections for u in k)
    met = _met()
    nodes = [
        {
            "userId": uid,
            "displayName": store.users[uid]["persona"]["displayName"],
            "location": store.users[uid]["persona"]["homeLocation"],
            "sceneId": scene_of.get(uid),
            "connections": conns[uid],
            "openJoins": open_joins[uid],
            "isolated": uid not in met,
            "synthetic": store.users[uid]["synthetic"],
        }
        for uid in ids
    ]
    edges: dict[tuple, dict] = {}
    for a, lst in cands.items():
        for b, _w in lst:
            edges.setdefault((min(a, b), max(a, b), "candidate"), {"a": min(a, b), "b": max(a, b), "kind": "candidate"})
    for m in store.meetups.values():
        ms = sorted(u for u, x in m.get("members", {}).items() if x.get("rsvp") != "left")
        for i, a in enumerate(ms):
            for b in ms[i + 1 :]:
                edges[(a, b, "group")] = {"a": a, "b": b, "kind": "group"}
    friends = get_settings().params["sim"]["friendshipMeetups"]
    for k, c in store.connections.items():
        a, b = sorted(k)
        if c.get("status") == "met":
            kind = "friendship" if c.get("meetupsTogether", 0) >= friends else "met"
            edges[(a, b, kind)] = {"a": a, "b": b, "kind": kind}
    return {"poolId": poolId, "generatedAt": now_iso(), "nodes": nodes, "edges": list(edges.values())}


@router.get("/internal/v1/metrics", operation_id="liveMetrics")
def live_metrics(poolId: str):
    if poolId not in store.pools:
        raise ApiError(404, "not_found", "That pool isn't loaded.")
    ids = members(poolId)
    meetups = list(store.meetups.values())
    steps = [s for m in meetups for s in m.get("steps", [])]
    approvals = list(store.approvals.values())
    joins = list(store.joins.values())
    confirmed = sum(m.get("status") in ("confirmed", "completed") for m in meetups)
    feedback = sum(1 for m in meetups for x in m.get("members", {}).values() if x.get("feedback"))
    decided = sum(a.get("status") in ("approved", "declined") for a in approvals)
    calls = counters["laya_calls"]
    return {
        "members": len(ids),
        "isolated": len(set(ids) - _met()),
        "connections": len(store.connections),
        "openPlans": sum(p.get("status") == "open" for p in store.plans.values()),
        "joins": len(joins),
        "plansFormed": len({m.get("planId") for m in meetups}),
        "plansNotFilled": len({j["planId"] for j in joins if j["status"] == "not_filled"}),
        "meetupsConfirmed": confirmed,
        "meetupsCompleted": sum(m.get("status") == "completed" for m in meetups),
        "museStepsDone": sum(s.get("status") == "done" for s in steps),
        "museStepsFailed": sum(s.get("status") == "failed" for s in steps),
        "approvalsRequested": len(approvals),
        "approvalsApproved": sum(a.get("status") == "approved" for a in approvals),
        "bookingFallbacks": counters["booking_fallbacks"],
        "userDecisionsPerMeetup": round((len(joins) + decided + feedback) / confirmed, 3) if confirmed else 0.0,
        "nudgesShown": len(store.nudges),
        "nudgesJoined": sum(bool(n.get("joined")) for n in store.nudges.values()),
        "laya_decisive_share": round(counters["laya_decisive"] / calls, 3) if calls else 0.0,
        "muse_fallbacks": counters["muse_fallbacks"],
    }
