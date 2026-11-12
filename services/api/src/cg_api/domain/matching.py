"""World -> cg_matching adapter. Same interface as `stubs`, so `World.match = matching` swaps it in.

cg_matching comes through `ports.matching()`; when it isn't installed every call falls back to `stubs`.
`privacy.py` re-checks overlap results either way.
"""

from __future__ import annotations

import logging
import random
from typing import TYPE_CHECKING

from cg_api import ports
from cg_api.domain import stubs

if TYPE_CHECKING:
    from cg_api.domain.world import World

log = logging.getLogger("cg_api.domain.matching")
_rank_cache: dict[tuple, dict[str, list[str]]] = {}


def _cgm():
    try:
        return ports.matching()
    except ports.Unavailable:
        return None


def export(w: "World") -> dict:
    """schemas/pool_export.schema.json from the live world (also what exportPool can serve)."""
    met = {k for k, c in w.connections.items() if c["status"] == "met"}
    conn = set(w.connections)
    users = []
    for uid, u in w.users.items():
        if not u.get("optedIn") and uid != w.demo.get("mayaId"):
            continue
        users.append(
            {
                "userId": uid,
                "synthetic": uid != w.demo.get("mayaId"),
                "profileVisibility": u.get("profileVisibility", "public"),
                "homeLocation": u.get("homeLocation") or {"lat": 0.0, "lng": 0.0},
                "neighborhood": u.get("neighborhood", ""),
                "ageBand": u.get("ageBand", "26_29"),
                "availability": u.get("availability", []),
                "groupSize": u.get("groupSize") or w.params["plans"]["defaultSize"],
                "interests": [
                    {
                        "id": i["id"],
                        "weight": i.get("weight", 0.5),
                        "visibility": i.get("visibility", "shown"),
                        "sensitive": bool(i.get("sensitive")),
                        "sharedSensitiveOptIn": i["id"].split(".")[0] in u["sensitiveOptIn"],
                    }
                    for i in u["interests"]
                ],
                "groupOnly": True,
                "trustFloorOk": True,
                "connectionIds": sorted(o for k in conn if uid in k for o in k - {uid}),
                "blockedIds": sorted(o for k in w.blocks if uid in k for o in k - {uid}),
                "travel": u.get("travel")
                or {"maxMinutes": w.params["travel"]["defaultMaxMinutes"], "modes": ["transit"]},
                "busy": u["busy"],
                "signals": [
                    {
                        k: s.get(k)
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
                    for s in u["signals"]
                ],
                "metIds": sorted(o for k in met if uid in k for o in k - {uid}),
            }
        )
    plans = [
        {"planId": pid, "status": p["status"], "interestedIds": [j["userId"] for j in w.active_joins(pid)]}
        for pid, p in w.plans.items()
    ]
    return {
        "poolId": w.demo.get("poolId", "pool_sf_city"),
        "mode": "city",
        "generatedAt": w.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "taxonomyVersion": 1,
        "questionsVersion": w.params["laya"]["questionsVersion"],
        "users": users,
        "plans": plans,
    }


def _plan(cgm, w: "World", p: dict):
    rec = {k: v for k, v in p.items() if k != "seedJoinIds"}  # live joins come from the export instead
    if p.get("origin") == "invite":
        rec["inviteeIds"] = [*p["inviteUserIds"], *([p["creatorId"]] if p.get("creatorId") else [])]
    return cgm.Plan.from_record(rec)


def _state(cgm, w: "World"):
    return cgm.MatchState(
        blocked_pairs=[sorted(k) for k in w.blocks],
        venue_capacity={vid: v["booking"]["capacityPerSlot"] for vid, v in w.venues.items()},
    )


def _ctx(cgm, w: "World"):
    pool = cgm.PoolSnapshot.from_export(export(w))
    return pool, cgm.Params(w.params), random.Random(w.params["matching"]["rngSeedDefault"])


def shared_interests(w: "World", a: str, b: str, level: int, limit: int) -> list[str]:
    cgm = _cgm()
    if not cgm or a not in w.users or b not in w.users:
        return stubs.shared_interests(w, a, b, level, limit)
    pool, _, _ = _ctx(cgm, w)
    if a not in pool.users or b not in pool.users:
        return stubs.shared_interests(w, a, b, level, limit)
    return cgm.shared_interests(pool, a, b, level, limit)


def plan_overlap(w: "World", uid: str, plan: dict, joined_ids: list[str], level: int, limit: int):
    cgm = _cgm()
    if not cgm:
        return stubs.plan_overlap(w, uid, plan, joined_ids, level, limit)
    pool, _, _ = _ctx(cgm, w)
    if uid not in pool.users:
        return []
    ids = [o for o in joined_ids if o in pool.users]
    return cgm.plan_overlap(pool, uid, _plan(cgm, w, plan), ids, level, limit)


def travel_minutes(origin, dest, mode: str, params: dict) -> int:
    cgm = _cgm()
    return (
        cgm.travel_minutes(origin, dest, mode, cgm.Params(params))
        if cgm
        else stubs.travel_minutes(origin, dest, mode, params)
    )


def rank(w: "World", uid: str) -> list[str]:
    cgm = _cgm()
    if not cgm:
        return stubs.rank(w, uid)
    # ponytail: whole-pool rank_plans cached until the next event or join; a version counter if it goes stale.
    key = (id(w), len(w.events), len(w.joins), len(w.plans), w.now().strftime("%Y-%m-%d"))
    if key not in _rank_cache:
        _rank_cache.clear()
        pool, params, rng = _ctx(cgm, w)
        open_plans = [_plan(cgm, w, p) for p in w.plans.values() if p["status"] == "open"]
        venues = {vid: cgm.Venue.from_record(v) for vid, v in w.venues.items()}
        vectors = cgm.build_vectors(pool, params)
        ranked = cgm.rank_plans(pool, open_plans, vectors, venues, cgm.LayaTables(), _state(cgm, w), params, rng)
        _rank_cache[key] = {u: [s.plan_id for s in scores] for u, scores in ranked.items()}
    return _rank_cache[key].get(uid, [])


def form_groups(w: "World", plan: dict, interested_ids: list[str]) -> tuple[list[list[str]], list[str]]:
    cgm = _cgm()
    if not cgm:
        return stubs.form_groups(w, plan, interested_ids)
    pool, params, rng = _ctx(cgm, w)
    vectors = cgm.build_vectors(pool, params)
    cands = cgm.candidates(pool, vectors, params)
    res = cgm.form_groups(
        _plan(cgm, w, plan), interested_ids, pool, cands, cgm.LayaTables(), _state(cgm, w), params, rng
    )
    return [list(g.member_ids) for g in res.groups], list(res.unseated_ids)
