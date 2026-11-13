"""Learned preferences (batch-2 plan D): rewards from feedback and likes nudge rank_plans via MatchState.prefs.

Keys and the EMA are cg_matching's (`plan_pref_keys`, `update_prefs`) so the sim and the live feed learn alike.
"""

from __future__ import annotations

from cg_api import ports
from cg_api.domain.world import World


def _cgm():
    try:
        return ports.matching()
    except ports.Unavailable:
        return None


def keys(w: World, activity_type: str, venue_id: str, target_interest_ids: list[str]) -> list[str]:
    """Same keys as cg_matching.plan_pref_keys (works on partial records, e.g. a share):
    act:<type>, vn:<venue> (never a sensitive venue, P4), int:<level-2 target>."""
    v = w.venues.get(venue_id, {})
    out = [f"act:{activity_type}"] + ([] if v.get("sensitive") else [f"vn:{venue_id}"])
    l2s = dict.fromkeys(".".join(t.split(".")[:2]) for t in target_interest_ids if t.count(".") >= 1)
    return out + [f"int:{l2}" for l2 in l2s]


def plan_keys(w: World, plan: dict) -> list[str]:
    return keys(w, plan["activityType"], plan["venueId"], plan["targetInterestIds"])


def reward(w: World, user_id: str, ks: list[str], r: float) -> None:
    """EMA w = (1 - alpha) * w + alpha * r on `ks` for one user (params.matching.prefAlpha)."""
    alpha = w.params["matching"]["prefAlpha"]
    cgm = _cgm()
    mine = w.prefs.get(user_id, {})
    if cgm is not None:
        w.prefs[user_id] = cgm.update_prefs(mine, ks, r, alpha)
    else:  # same rule as cg_matching.update_prefs
        r = max(-1.0, min(1.0, r))
        w.prefs[user_id] = {**mine, **{k: round((1 - alpha) * mine.get(k, 0.0) + alpha * r, 6) for k in ks}}
    w.pref_version += 1


def liked_label(w: World, user_id: str, plan: dict) -> str | None:
    """'Because you liked <X>' from the strongest positive key this plan matches. Owner-only (P7)."""
    mine = w.prefs.get(user_id, {})
    rank = {"int": 2, "act": 1, "vn": 0}  # ties read best as an interest, then the activity, then the venue
    best = max(((mine[k], rank[k.split(":")[0]], k) for k in plan_keys(w, plan) if mine.get(k, 0) > 0), default=None)
    if not best:
        return None
    kind, _, ref = best[2].partition(":")
    if kind == "int":
        name = w.taxonomy.get(ref, {}).get("label", ref)
    elif kind == "vn":
        name = w.venues[ref]["name"]
    else:
        name = ref.replace("_", " ")
    return f"Because you liked {name}"
