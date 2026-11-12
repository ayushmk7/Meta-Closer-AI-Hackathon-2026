"""Bridge to cg_matching (CONTRACTS §10), dict in / dict out.

Uses the real cg_matching when importable. Until packages/matching lands, a naive stand-in with the
same call shape runs instead. Every caller in cg_sim goes through here, so switching is automatic.

ponytail: temporary. Delete the fallback (keep the dict wrappers) once backend M0 ships cg_matching.
"""

from __future__ import annotations

import dataclasses
import random
from collections import Counter
from datetime import datetime, timedelta

try:  # pragma: no cover - depends on the backend package being installed
    import cg_matching as _cgm

    HAVE_MATCHING = True
except ImportError:
    _cgm = None
    HAVE_MATCHING = False

# Activity type (laya_questions.yaml#activityTypes) -> level-2 interests a plan of that type targets.
# Sim-owned mapping; never sensitive.
ACTIVITY_INTERESTS: dict[str, list[str]] = {
    "coffee": ["food_drink.coffee_tea"],
    "walk": ["travel.local_exploring", "outdoors.nature"],
    "hike": ["outdoors.hiking", "outdoors.nature"],
    "climbing_session": ["outdoors.climbing"],
    "run": ["sports_fitness.running"],
    "pickup_sport": ["sports_fitness.team_sports", "sports_fitness.racket_sports"],
    "board_game_night": ["games.board_games", "games.tabletop_rpg", "games.cards_puzzles"],
    "video_game_session": ["games.video_games", "games.esports"],
    "trivia_night": ["social_community.nights_out", "learning.ideas"],
    "concert": ["music.live_music", "music.listening"],
    "museum_visit": ["culture.museums"],
    "film_screening": ["culture.film_tv"],
    "cooking_together": ["food_drink.cooking"],
    "food_crawl": ["food_drink.eating_out"],
    "brunch": ["food_drink.eating_out"],
    "craft_session": ["arts_crafts.fiber_arts", "arts_crafts.making", "arts_crafts.visual_art"],
    "ceramics_studio": ["arts_crafts.ceramics"],
    "photo_walk": ["arts_crafts.photography", "travel.local_exploring"],
    "book_club": ["culture.reading"],
    "language_exchange": ["culture.languages"],
    "volunteering": ["social_community.volunteering"],
    "farmers_market": ["social_community.neighborhood", "food_drink.cooking"],
    "yoga_class": ["sports_fitness.mind_body"],
    "beach_day": ["outdoors.water"],
    "picnic": ["outdoors.nature", "food_drink.eating_out"],
    "karaoke": ["social_community.nights_out", "music.playing_music"],
    "dance_class": ["social_community.nights_out"],
    "hackathon_or_cowork": ["tech_career.building", "tech_career.startups"],
    "bike_ride": ["outdoors.cycling"],
    "comedy_show": ["culture.theater_comedy"],
    "lunch": ["food_drink.eating_out"],
}

_PARTS = {"morning": 10, "afternoon": 14, "evening": 18}
_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _to_dict(obj) -> dict:
    if isinstance(obj, dict):
        return obj
    for name in ("to_record", "to_dict"):
        if hasattr(obj, name):
            return getattr(obj, name)()
    return dataclasses.asdict(obj)


def propose_plans(
    pool_export: dict,
    venues: list[dict],
    scene_of: dict[str, str],
    params: dict,
    rng: random.Random,
    horizon_start: datetime,
    utc_offset_hours: int = -8,
) -> list[dict]:
    """Plan records (schemas/plan.schema.json minus poolId/title/description/origin/seedJoinIds,
    which the caller fills). horizon_start must be timezone-aware UTC."""
    if HAVE_MATCHING:  # pragma: no cover
        from pathlib import Path

        from cg_sim.contracts import contracts_dir

        out = _cgm.propose_plans(
            _cgm.PoolSnapshot.from_export(pool_export),
            [_cgm.Venue.from_record(v) for v in venues],
            scene_of,
            _cgm.Params.from_yaml(Path(contracts_dir()) / "params.yaml"),
            rng,
            horizon_start,
        )
        return [_to_dict(p) for p in out]
    return _naive_propose(pool_export, venues, scene_of, params, rng, horizon_start, utc_offset_hours)


def _naive_propose(pool_export, venues, scene_of, params, rng, horizon_start, utc_offset_hours):
    """ponytail: naive stand-in. Per scene: count members' shown non-sensitive level-2 interests, pick
    venues whose activity types target them, slot at the scene's most common availability."""
    p = params["plans"]
    users = {u["userId"]: u for u in pool_export["users"]}
    members: dict[str, list[str]] = {}
    for uid, sc in sorted(scene_of.items()):
        if uid in users:
            members.setdefault(sc, []).append(uid)
    usable = [v for v in venues if not v.get("sensitive")]
    earliest = horizon_start + timedelta(hours=p["minLeadHours"])
    plans: list[dict] = []
    for sc in sorted(members):
        l2: Counter[str] = Counter()
        slots: Counter[tuple[str, str]] = Counter()
        for uid in members[sc]:
            u = users[uid]
            for i in u["interests"]:
                if i["visibility"] == "shown" and not i["sensitive"]:
                    l2[".".join(i["id"].split(".")[:2])] += i["weight"]
            for s in u["availability"]:
                slots[(s["day"], s["part"])] += 1
        options = []
        for v in usable:
            for at in v["activityTypes"]:
                score = sum(l2[i] for i in ACTIVITY_INTERESTS.get(at, []))
                if score > 0:
                    options.append((score, v["venueId"], at, v))
        options.sort(key=lambda o: (-o[0], o[1], o[2]))
        top_slots = [s for s, _ in sorted(slots.items(), key=lambda kv: (-kv[1], kv[0]))][:4] or [("sat", "afternoon")]
        seen = set()
        for _score, vid, at, v in options:
            if len([x for x in plans if x["sceneId"] == sc]) >= p["proposalsPerSceneWeek"]:
                break
            if (vid, at) in seen:
                continue
            seen.add((vid, at))
            day, part = rng.choice(top_slots)
            starts = _next_slot(earliest, day, part, utc_offset_hours)
            if starts > horizon_start + timedelta(days=p["horizonDays"]):
                starts -= timedelta(days=7)
            if starts < earliest:
                starts += timedelta(days=7)
            targets = [i for i in ACTIVITY_INTERESTS[at] if l2[i] > 0]
            plans.append(
                {
                    "planId": f"pl_{sc.removeprefix('sc_')}_{len(plans):03d}",
                    "activityType": at,
                    "venueId": vid,
                    "startsAt": _iso(starts),
                    "endsAt": _iso(starts + timedelta(hours=2)),
                    "size": dict(p["defaultSize"]),
                    "cost": dict(v["booking"]["cost"]),
                    "targetInterestIds": targets,
                    "sceneId": sc,
                }
            )
    return plans


def _next_slot(after: datetime, day: str, part: str, utc_offset_hours: int) -> datetime:
    local = after + timedelta(hours=utc_offset_hours)
    delta = (_DAYS.index(day) - local.weekday()) % 7
    cand = (local + timedelta(days=delta)).replace(hour=_PARTS[part], minute=0, second=0, microsecond=0)
    if cand < local:
        cand += timedelta(days=7)
    return cand - timedelta(hours=utc_offset_hours)


def travel_minutes(origin: dict, dest: dict, mode: str, params: dict) -> int:
    """origin/dest are {lat, lng}. Same formula as params.travel describes."""
    if HAVE_MATCHING:  # pragma: no cover
        from pathlib import Path

        from cg_sim.contracts import contracts_dir

        return _cgm.travel_minutes(
            (origin["lat"], origin["lng"]), (dest["lat"], dest["lng"]), mode,
            _cgm.Params.from_yaml(Path(contracts_dir()) / "params.yaml"),
        )
    import math

    t = params["travel"]
    lat1, lng1, lat2, lng2 = map(math.radians, (origin["lat"], origin["lng"], dest["lat"], dest["lng"]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    km = 2 * 6371.0 * math.asin(math.sqrt(h)) * t["detourFactor"]
    return math.ceil(km / t["speedsKmh"][mode] * 60 + t["overheadMin"][mode])


# ---------- vectors, candidates, rank_plans, form_groups (CONTRACTS §10 seams, dict in / dict out) ----------
# pool = pool_export dict, plans = plan.schema dicts, venues = {venueId: venue dict}, state = dict with optional
# keys exposures {planId: int}, blockedPairs [[a, b]]. tables: object with p_join(u, t) / p_meet_again(a, b)
# (cg_matching.LayaTables or the sim's fake), or None (treated as 1.0 / candidate cosine).
# Returns plain dicts shaped like PlanScore / FormResult (snake_case keys, as in the dataclasses).
#
# ponytail: naive stand-ins. O(n^2) candidates, greedy max-min grouping, unlimited groups per plan (venue capacity
# not in the signature), no minSharedWithOthers rule. Real cg_matching replaces all of it when importable.


def _params_obj():  # pragma: no cover
    from pathlib import Path

    from cg_sim.contracts import contracts_dir

    return _cgm.Params.from_yaml(Path(contracts_dir()) / "params.yaml")


def build_vectors(pool: dict, params: dict) -> dict[str, dict[str, float]]:
    if HAVE_MATCHING:  # pragma: no cover
        return _cgm.build_vectors(_cgm.PoolSnapshot.from_export(pool), _params_obj())
    f = params["matching"]["parentWeightFactor"]
    out = {}
    for u in pool["users"]:
        v: dict[str, float] = {}
        for i in u["interests"]:
            if i["sensitive"] and not i.get("sharedSensitiveOptIn"):
                continue  # P4
            parts = i["id"].split(".")
            for depth in range(len(parts), 0, -1):
                key = ".".join(parts[:depth])
                v[key] = max(v.get(key, 0.0), i["weight"] * f ** (len(parts) - depth))
        out[u["userId"]] = v
    return out


def _cos(a: dict[str, float], b: dict[str, float]) -> float:
    import math

    dot = sum(w * b[k] for k, w in a.items() if k in b)
    na, nb = math.sqrt(sum(w * w for w in a.values())), math.sqrt(sum(w * w for w in b.values()))
    return dot / (na * nb) if na and nb else 0.0


def candidates(pool: dict, vectors, params: dict) -> dict[str, list[tuple[str, float]]]:
    if HAVE_MATCHING:  # pragma: no cover
        return _cgm.candidates(_cgm.PoolSnapshot.from_export(pool), vectors, _params_obj())
    m = params["matching"]
    ids = sorted(vectors)
    out = {}
    for a in ids:
        scored = [(b, round(_cos(vectors[a], vectors[b]), 6)) for b in ids if b != a]
        scored = [s for s in scored if s[1] >= m["minCosine"]]
        scored.sort(key=lambda s: (-s[1], s[0]))
        out[a] = scored[: m["knnK"]]
    return out


def _overlaps(busy: list[dict], starts: datetime, ends: datetime, buffer_min: int) -> bool:
    buf = timedelta(minutes=buffer_min)
    for b in busy:
        bs, be = _dt(b["start"]), _dt(b["end"])
        if bs < ends + buf and starts - buf < be:
            return True
    return False


def _dt(s: str) -> datetime:
    from datetime import UTC

    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)


def _slot(starts: datetime) -> tuple[str, str]:
    from zoneinfo import ZoneInfo

    lt = starts.astimezone(ZoneInfo("America/Los_Angeles"))
    return _DAYS[lt.weekday()], ("morning" if lt.hour < 12 else "afternoon" if lt.hour < 17 else "evening")


def rank_plans(pool: dict, plans: list[dict], vectors, venues: dict[str, dict], tables, state: dict,
               params: dict, rng: random.Random) -> dict[str, list[dict]]:
    """Per user: plans passing calendar + travel hard filters, best first, at most feed.size."""
    if HAVE_MATCHING:  # pragma: no cover
        snap = _cgm.PoolSnapshot.from_export(pool)
        out = _cgm.rank_plans(snap, [_cgm.Plan.from_record(p) for p in plans], vectors,
                              {k: _cgm.Venue.from_record(v) for k, v in venues.items()}, tables, state,
                              _params_obj(), rng)
        return {u: [_to_dict(s) for s in ss] for u, ss in out.items()}
    vectors = vectors or build_vectors(pool, params)
    exposures = dict((state or {}).get("exposures", {}))
    cap = params["plans"]["exposureCapPerDay"]
    buffer_min = params["calendar"]["minFreeBufferMin"]
    boost = params["matching"]["isolationBoost"]
    f = params["feed"]
    # Pass 1: hard filters and raw fit per (user, plan).
    iso = {u["userId"] for u in pool["users"] if not u["metIds"]}
    eligible: dict[str, list[dict]] = {}
    for u in pool["users"]:
        uid, vec = u["userId"], vectors.get(u["userId"], {})
        slots = {(s["day"], s["part"]) for s in u["availability"]}
        rows = eligible[uid] = []
        for p in plans:
            if uid in p.get("seedJoinIds", []):
                continue
            starts, ends = _dt(p["startsAt"]), _dt(p["endsAt"])
            if u["busy"]:
                if _overlaps(u["busy"], starts, ends, buffer_min):
                    continue
            elif _slot(starts) not in slots:
                continue
            v = venues[p["venueId"]]
            minutes = min(travel_minutes(u["homeLocation"], v["location"], m, params) for m in u["travel"]["modes"])
            if pool.get("mode") != "event" and minutes > u["travel"]["maxMinutes"]:
                continue
            fit = max((vec.get(t, 0.0) for t in p["targetInterestIds"]), default=0.0)
            if fit <= 0:
                continue
            p_join = tables.p_join(uid, p["activityType"]) if tables is not None else 1.0
            shared = [t for t in p["targetInterestIds"] if vec.get(t)][: params["privacy"]["sharedCoarseMax"]]
            rows.append({"plan": p, "fit": fit, "p_join": p_join, "minutes": minutes, "shared": shared,
                         "isolated": uid in iso})
    # Fill likelihood. ponytail: expected joins = seed joins + mean p_join x min(eligible, exposure cap);
    # swap for the Laya-table estimate when cg_matching lands.
    pj: dict[str, list[float]] = {}
    for rows in eligible.values():
        for r in rows:
            pj.setdefault(r["plan"]["planId"], []).append(r["p_join"])
    fill = {}
    for p in plans:
        js = pj.get(p["planId"], [])
        expected = len(p.get("seedJoinIds", [])) + (sum(js) / len(js) * min(len(js), cap) if js else 0)
        fill[p["planId"]] = min(1.0, expected / p["size"]["min"])
    # Pass 2: allocate exposures. Isolated users first (isolationBoost), the rest in rng order (no id bias).
    order = sorted(eligible)
    rng.shuffle(order)
    order.sort(key=lambda uid: uid not in iso)
    out: dict[str, list[dict]] = {}
    for uid in order:
        scores = []
        for r in eligible[uid]:
            pid = r["plan"]["planId"]
            if fill[pid] < params["plans"]["fillLikelihoodFloor"] or exposures.get(pid, 0) >= cap:
                continue
            score = r["fit"] * r["p_join"] * fill[pid] * ((1 + boost) if r["isolated"] else 1.0)
            scores.append((round(score, 6), pid, r))
        scores.sort(key=lambda x: (-x[0], x[1]))
        by_type: Counter[str] = Counter()
        by_scene: Counter[str] = Counter()
        picked = []
        for score, pid, r in scores:
            t, sc = r["plan"]["activityType"], r["plan"].get("sceneId")
            if by_type[t] >= f["maxPerActivityType"] or (sc and by_scene[sc] >= f["maxPerScene"]):
                continue
            by_type[t] += 1
            by_scene[sc] += 1
            exposures[pid] = exposures.get(pid, 0) + 1
            picked.append({"user_id": uid, "plan_id": pid, "score": score, "shared_coarse": r["shared"],
                           "travel_minutes": r["minutes"],
                           "debug": {"fit": round(r["fit"], 6), "p_join": r["p_join"], "fill": round(fill[pid], 6)}})
            if len(picked) >= f["size"]:
                break
        out[uid] = picked
    return dict(sorted(out.items()))


def form_groups(plan: dict, interested_ids: list[str], pool: dict, cands: dict[str, list[tuple[str, float]]],
                tables, state: dict, params: dict, rng: random.Random) -> dict:
    """Greedy max-min-pairwise groups of size.min..size.max. interested_ids in join order.
    Seat priority: isolated (no metIds) first, then earliest join."""
    if HAVE_MATCHING:  # pragma: no cover
        res = _cgm.form_groups(_cgm.Plan.from_record(plan), interested_ids, _cgm.PoolSnapshot.from_export(pool),
                               cands, tables, state, _params_obj(), rng)
        return _to_dict(res)
    users = {u["userId"]: u for u in pool["users"]}
    cand = {a: dict(lst) for a, lst in cands.items()}
    blocked = {frozenset(x) for x in (state or {}).get("blockedPairs", [])}
    for u in users.values():
        blocked |= {frozenset((u["userId"], b)) for b in u.get("blockedIds", [])}

    def pair(a: str, b: str) -> float:
        if frozenset((a, b)) in blocked:
            return -1.0
        if tables is not None and hasattr(tables, "p_meet_again"):
            return float(tables.p_meet_again(a, b))
        return max(cand.get(a, {}).get(b, 0.0), cand.get(b, {}).get(a, 0.0))

    g = params["groups"]

    def l2(u: str) -> set[str]:
        return {".".join(i["id"].split(".")[:2]) for i in users.get(u, {}).get("interests", []) if not i["sensitive"]}

    order = {u: k for k, u in enumerate(interested_ids)}
    queue = sorted(dict.fromkeys(interested_ids), key=lambda u: (bool(users.get(u, {}).get("metIds")), order[u]))
    lo, hi = plan["size"]["min"], plan["size"]["max"]
    groups, unseated = [], []
    while len(queue) >= lo:
        group = [queue.pop(0)]
        while len(group) < hi and queue:
            best = max(queue, key=lambda c: (min(pair(c, g) for g in group), -order[c]))
            if min(pair(best, g) for g in group) < 0:
                break
            group.append(best)
            queue.remove(best)
        # groups.minSharedWithOthers: each member shares >= N level-2 interests with >= minOthers others.
        # ponytail: prune the worst member until it holds; pruned people stay unseated this round.
        while len(group) >= 3:
            need = min(g["minOthers"], len(group) - 1)
            ok = {m: sum(len(l2(m) & l2(o)) >= g["minSharedWithOthers"] for o in group if o != m) for m in group}
            worst = min(group, key=lambda m: (ok[m], -order[m]))
            if ok[worst] >= need:
                break
            group.remove(worst)
            unseated.append(worst)
        if len(group) < lo:
            unseated += group
            continue
        mp = min(pair(a, b) for i, a in enumerate(group) for b in group[i + 1:])
        groups.append({"plan_id": plan["planId"], "member_ids": group, "min_pairwise": round(mp, 6)})
    unseated += queue
    return {"groups": groups, "unseated_ids": sorted(unseated, key=order.get)}
