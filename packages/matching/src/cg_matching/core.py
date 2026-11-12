"""cg_matching functions (CONTRACTS §10).

ponytail: M0 skeleton. Naive bodies ported from services/sim matching_adapter.py; M1/M2 replace them.
"""

from __future__ import annotations

import math
import random
from collections import Counter
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from cg_matching.types import (
    FormResult,
    GroupResult,
    LayaTables,
    MatchState,
    Params,
    Plan,
    PlanScore,
    PoolSnapshot,
    Vectors,
    Venue,
    parse_dt,
)

# Activity type (laya_questions.yaml#activityTypes) -> level-2 interests a plan of that type targets. Never sensitive.
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

TZ = ZoneInfo("America/Los_Angeles")  # ponytail: one city; per-pool tz when a second city ships
_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
_PARTS = {"morning": 10, "afternoon": 14, "evening": 18}


def _usable(i: dict) -> bool:
    """P1/P4: hidden never counts; sensitive only when the user opted that category in."""
    return i["visibility"] == "shown" and (not i["sensitive"] or bool(i.get("sharedSensitiveOptIn")))


def _prefix(iid: str, level: int) -> str | None:
    parts = iid.split(".")
    return ".".join(parts[:level]) if len(parts) >= level else None


def build_vectors(pool: PoolSnapshot, params: Params) -> Vectors:
    f = params["matching"]["parentWeightFactor"]
    out: Vectors = {}
    for uid, u in sorted(pool.users.items()):
        v: dict[str, float] = {}
        for i in u["interests"]:
            if not _usable(i):
                continue
            parts = i["id"].split(".")
            for depth in range(len(parts), 0, -1):
                key = ".".join(parts[:depth])
                v[key] = max(v.get(key, 0.0), i["weight"] * f ** (len(parts) - depth))
        out[uid] = v
    return out


def _cos(a: dict[str, float], b: dict[str, float]) -> float:
    dot = sum(w * b[k] for k, w in a.items() if k in b)
    na, nb = math.sqrt(sum(w * w for w in a.values())), math.sqrt(sum(w * w for w in b.values()))
    return dot / (na * nb) if na and nb else 0.0


def candidates(pool: PoolSnapshot, vectors: Vectors, params: Params) -> dict[str, list[tuple[str, float]]]:
    m = params["matching"]
    ids = sorted(vectors)
    out = {}
    for a in ids:
        scored = [(b, round(_cos(vectors[a], vectors[b]), 6)) for b in ids if b != a]
        scored = sorted((s for s in scored if s[1] >= m["minCosine"]), key=lambda s: (-s[1], s[0]))
        out[a] = scored[: m["knnK"]]
    return out


def scenes(
    pool: PoolSnapshot, cands: dict[str, list[tuple[str, float]]], params: Params, seed: int
) -> dict[str, str]:
    """ponytail: M0 naive, scene = the user's strongest usable level-2 interest. Leiden in M2."""
    out = {}
    for uid, u in sorted(pool.users.items()):
        l2 = Counter()
        for i in u["interests"]:
            if _usable(i) and (p := _prefix(i["id"], 2)):
                l2[p] += i["weight"]
        if l2:
            top = min(l2.items(), key=lambda kv: (-kv[1], kv[0]))[0]
            out[uid] = "sc_" + top.split(".")[1]
    return out


def shared_interests(pool: PoolSnapshot, a: str, b: str, level: int, limit: int) -> list[str]:
    """Interests at `level` both a and b have (shown; sensitive only if both opted in), strongest combined first."""
    wa, wb = _level_weights(pool.users[a], level), _level_weights(pool.users[b], level)
    both = sorted(wa.keys() & wb.keys(), key=lambda k: (-(wa[k] + wb[k]), k))
    return both[:limit]


def _level_weights(u: dict, level: int) -> dict[str, float]:
    out: dict[str, float] = {}
    for i in u["interests"]:
        if _usable(i) and (p := _prefix(i["id"], level)):
            out[p] = max(out.get(p, 0.0), i["weight"])
    return out


def plan_overlap(
    pool: PoolSnapshot,
    user_id: str,
    plan: Plan,
    joined_ids: list[str],
    level: int,
    limit: int,
    *,
    min_count: int = 2,
) -> list[tuple[str, int]]:
    """(interest ID at `level`, count of other joined users who have it) for interests the viewer has.
    Empty below `min_count` joined (pass params.privacy.crowdMinCount)."""
    others = [j for j in dict.fromkeys(joined_ids) if j != user_id and j in pool.users]
    if len(others) < min_count or user_id not in pool.users:
        return []
    mine = _level_weights(pool.users[user_id], level)
    counts: Counter[str] = Counter()
    for o in others:
        counts.update(mine.keys() & _level_weights(pool.users[o], level).keys())
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], -mine[kv[0]], kv[0]))
    return ranked[:limit]


def travel_minutes(origin: tuple[float, float], dest: tuple[float, float], mode: str, params: Params) -> int:
    t = params["travel"]
    lat1, lng1, lat2, lng2 = map(math.radians, (*origin, *dest))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    km = 2 * 6371.0 * math.asin(math.sqrt(h)) * t["detourFactor"]
    return math.ceil(km / t["speedsKmh"][mode] * 60 + t["overheadMin"][mode])


def _next_slot(after: datetime, day: str, part: str) -> datetime:
    local = after.astimezone(TZ)
    delta = (_DAYS.index(day) - local.weekday()) % 7
    cand = (local + timedelta(days=delta)).replace(hour=_PARTS[part], minute=0, second=0, microsecond=0)
    if cand < local:
        cand += timedelta(days=7)
    return cand.astimezone(after.tzinfo)


def propose_plans(
    pool: PoolSnapshot,
    venues: list[Venue],
    scene_of: dict[str, str],
    params: Params,
    rng: random.Random,
    horizon_start: datetime,
) -> list[Plan]:
    """ponytail: M0 naive. Per scene: venues whose activity types target members' interests, at a common slot."""
    p = params["plans"]
    members: dict[str, list[str]] = {}
    for uid, sc in sorted(scene_of.items()):
        if uid in pool.users:
            members.setdefault(sc, []).append(uid)
    earliest = horizon_start + timedelta(hours=p["minLeadHours"])
    out: list[Plan] = []
    for sc in sorted(members):
        l2: Counter[str] = Counter()
        slots: Counter[tuple[str, str]] = Counter()
        for uid in members[sc]:
            u = pool.users[uid]
            l2.update(_level_weights(u, 2))
            slots.update((s["day"], s["part"]) for s in u["availability"])
        options = sorted(
            (
                (sum(l2[i] for i in ACTIVITY_INTERESTS.get(at, [])), v.venue_id, at, v)
                for v in venues
                if not v.sensitive
                for at in v.activity_types
            ),
            key=lambda o: (-o[0], o[1], o[2]),
        )
        top_slots = [s for s, _ in sorted(slots.items(), key=lambda kv: (-kv[1], kv[0]))][:4] or [
            ("sat", "afternoon")
        ]
        n = 0
        for score, vid, at, v in options:
            if score <= 0 or n >= p["proposalsPerSceneWeek"]:
                break
            starts = _next_slot(earliest, *rng.choice(top_slots))
            out.append(
                Plan(
                    plan_id=f"pl_{sc.removeprefix('sc_')}_{len(out):03d}",
                    activity_type=at,
                    venue_id=vid,
                    starts_at=starts,
                    ends_at=starts + timedelta(hours=2),
                    size_min=p["defaultSize"]["min"],
                    size_max=p["defaultSize"]["max"],
                    cost=dict(v.cost),
                    target_interest_ids=tuple(i for i in ACTIVITY_INTERESTS[at] if l2[i] > 0),
                    scene_id=sc,
                    origin="seed",
                )
            )
            n += 1
    return out


def _busy_conflict(busy: list[dict], starts: datetime, ends: datetime, buffer_min: int) -> bool:
    buf = timedelta(minutes=buffer_min)
    return any(parse_dt(b["start"]) < ends + buf and starts - buf < parse_dt(b["end"]) for b in busy)


def _slot(dt: datetime) -> tuple[str, str]:
    lt = dt.astimezone(TZ)
    return _DAYS[lt.weekday()], ("morning" if lt.hour < 12 else "afternoon" if lt.hour < 17 else "evening")


def rank_plans(
    pool: PoolSnapshot,
    plans: list[Plan],
    vectors: Vectors,
    venues: dict[str, Venue],
    tables: LayaTables,
    state: MatchState,
    params: Params,
    rng: random.Random,
) -> dict[str, list[PlanScore]]:
    """ponytail: M0 naive port of the sim adapter."""
    exposures = dict(state.exposures)
    cap = params["plans"]["exposureCapPerDay"]
    boost = params["matching"]["isolationBoost"]
    f = params["feed"]
    met = {x for pair in state.met_pairs for x in pair}
    iso = {uid for uid, u in pool.users.items() if not u["metIds"] and uid not in met}
    out: dict[str, list[PlanScore]] = {}
    for uid in sorted(pool.users):
        u, vec = pool.users[uid], vectors.get(uid, {})
        slots = {(s["day"], s["part"]) for s in u["availability"]}
        scored = []
        for p in plans:
            if uid in p.seed_join_ids:
                continue
            if u["busy"]:
                if _busy_conflict(u["busy"], p.starts_at, p.ends_at, params["calendar"]["minFreeBufferMin"]):
                    continue
            elif _slot(p.starts_at) not in slots:
                continue
            v = venues[p.venue_id]
            minutes = min(
                travel_minutes((u["homeLocation"]["lat"], u["homeLocation"]["lng"]), v.location, m, params)
                for m in u["travel"]["modes"]
            )
            if minutes > u["travel"]["maxMinutes"]:
                continue
            fit = max((vec.get(t, 0.0) for t in p.target_interest_ids), default=0.0)
            if fit <= 0 or exposures.get(p.plan_id, 0) >= cap:
                continue
            score = fit * tables.p_join(uid, p.activity_type) * ((1 + boost) if uid in iso else 1.0)
            shared = [t for t in p.target_interest_ids if vec.get(t)][: params["privacy"]["sharedCoarseMax"]]
            scored.append(PlanScore(uid, p.plan_id, round(score, 6), shared, minutes, {"fit": round(fit, 6)}))
        scored.sort(key=lambda s: (-s.score, s.plan_id))
        out[uid] = scored[: f["size"]]
        for s in out[uid]:
            exposures[s.plan_id] = exposures.get(s.plan_id, 0) + 1
    return out


def form_groups(
    plan: Plan,
    interested_ids: list[str],
    pool: PoolSnapshot,
    cands: dict[str, list[tuple[str, float]]],
    tables: LayaTables,
    state: MatchState,
    params: Params,
    rng: random.Random,
) -> FormResult:
    """ponytail: M0 naive greedy max-min groups; seat priority isolated, then earliest join."""
    cand = {a: dict(lst) for a, lst in cands.items()}
    blocked = {frozenset(x) for x in state.blocked_pairs}
    for uid, u in pool.users.items():
        blocked |= {frozenset((uid, b)) for b in u.get("blockedIds", [])}

    def pair(a: str, b: str) -> float:
        if frozenset((a, b)) in blocked:
            return -1.0
        return max(cand.get(a, {}).get(b, 0.0), cand.get(b, {}).get(a, 0.0)) * tables.p_meet_again(a, b)

    order = {u: k for k, u in enumerate(dict.fromkeys(interested_ids))}
    queue = sorted(order, key=lambda u: (bool(pool.users.get(u, {}).get("metIds")), order[u]))
    lo, hi = plan.size_min, plan.size_max
    groups, unseated = [], []
    while len(queue) >= lo:
        group = [queue.pop(0)]
        while len(group) < hi and queue:
            best = max(queue, key=lambda c: (min(pair(c, g) for g in group), -order[c]))
            if min(pair(best, g) for g in group) < 0:
                break
            group.append(best)
            queue.remove(best)
        if len(group) < lo:
            unseated += group
            continue
        mp = min(pair(a, b) for i, a in enumerate(group) for b in group[i + 1 :])
        groups.append(GroupResult(plan.plan_id, group, round(mp, 6)))
    unseated += queue
    return FormResult(groups, sorted(unseated, key=order.get))
