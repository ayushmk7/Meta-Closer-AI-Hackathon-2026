"""Naive stand-ins for cg_matching, called only via `World.match`.

ponytail: swap for an adapter over cg_matching (B) once the scaffold's ports land; the privacy
filters in `privacy.py` re-check whatever comes back, so the swap cannot widen what users see.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from cg_api.domain.world import World


def _usable(w: World, uid: str) -> dict[str, float]:
    """Visible interest weights, expanded to ancestors (level 2 and 3)."""
    out: dict[str, float] = {}
    for i in w.users[uid]["interests"]:
        if i.get("visibility", "shown") != "shown":
            continue
        parts = i["id"].split(".")
        for n in range(2, len(parts) + 1):
            key = ".".join(parts[:n])
            out[key] = max(out.get(key, 0.0), i.get("weight", 0.5))
    return out


def _sensitive_ok(w: World, a: str, b: str, interest_id: str) -> bool:
    if not w.taxonomy.get(interest_id, {}).get("sensitive", True):
        return True
    cat = interest_id.split(".")[0]
    return cat in w.users[a]["sensitiveOptIn"] and cat in w.users[b]["sensitiveOptIn"]


def shared_interests(w: World, a: str, b: str, level: int, limit: int) -> list[str]:
    ia, ib = _usable(w, a), _usable(w, b)
    ids = [k for k in ia.keys() & ib.keys() if len(k.split(".")) <= level and _sensitive_ok(w, a, b, k)]
    # deepest first so level 3 wins over its parent, then combined weight, then id
    ids.sort(key=lambda k: (-len(k.split(".")), -(ia[k] + ib[k]), k))
    out: list[str] = []
    for k in ids:
        if not any(o.startswith(k + ".") for o in out):
            out.append(k)
    return out[:limit]


def plan_overlap(
    w: World, uid: str, plan: dict, joined_ids: list[str], level: int, limit: int
) -> list[tuple[str, int]]:
    if len(joined_ids) < w.params["privacy"]["crowdMinCount"]:
        return []
    mine = {k for k in _usable(w, uid) if len(k.split(".")) == level}
    counts = {k: sum(1 for o in joined_ids if k in _usable(w, o) and _sensitive_ok(w, uid, o, k)) for k in mine}
    ranked = sorted(((k, c) for k, c in counts.items() if c), key=lambda kc: (-kc[1], kc[0]))
    return ranked[:limit]


def travel_minutes(origin: tuple[float, float], dest: tuple[float, float], mode: str, params: dict) -> int:
    lat1, lng1, lat2, lng2 = map(math.radians, (*origin, *dest))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    km = 2 * 6371 * math.asin(math.sqrt(h))
    t = params["travel"]
    return math.ceil(km * t["detourFactor"] / t["speedsKmh"][mode] * 60 + t["overheadMin"][mode])


def rank(w: World, uid: str) -> list[str]:
    """Plan IDs best first: target-interest fit, then soonest. ponytail: no Laya, no fill model."""
    mine = _usable(w, uid)

    from cg_api.domain import prefs  # cycle: prefs -> world -> matching -> stubs

    mine_prefs = w.prefs.get(uid, {})
    boost = w.params["matching"]["prefBoost"]

    def fit(p: dict) -> float:
        base = sum(mine.get(t, 0.0) for t in p["targetInterestIds"]) or 0.01
        ws = [mine_prefs[k] for k in prefs.plan_keys(w, p) if k in mine_prefs]
        return base * (1 + boost * sum(ws) / len(ws)) if ws else base  # same multiplier as rank_plans

    plans = [p for p in w.plans.values() if p["status"] == "open"]
    return [p["planId"] for p in sorted(plans, key=lambda p: (-fit(p), p["startsAt"], p["planId"]))]


def form_groups(w: World, plan: dict, interested_ids: list[str]) -> tuple[list[list[str]], list[str]]:
    """Seat in join order, skipping anyone blocked with a seated member. One group, up to size.max."""
    seated: list[str] = []
    for uid in interested_ids:
        if len(seated) < plan["size"]["max"] and not any(w.blocked(uid, s) for s in seated):
            seated.append(uid)
    if len(seated) < max(plan["size"]["min"], w.params["groups"]["strangerSizeMin"]):
        return [], list(interested_ids)
    return [seated], [u for u in interested_ids if u not in seated]
