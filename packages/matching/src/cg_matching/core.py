"""cg_matching functions (CONTRACTS §10).

ponytail: M0 skeleton. Naive bodies ported from services/sim matching_adapter.py; M1/M2 replace them.
"""

from __future__ import annotations

import math
import random
from collections import Counter
from datetime import datetime, timedelta
from statistics import median_low
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
    if params["matching"]["idf"] and out:
        # Rare shared interests count more. Smoothed so an interest everyone has still weighs 1.
        df = Counter(k for v in out.values() for k in v)
        n = len(out)
        idf = {k: math.log((1 + n) / (1 + c)) + 1 for k, c in df.items()}
        out = {uid: {k: w * idf[k] for k, w in v.items()} for uid, v in out.items()}
    return out


def _cos(a: dict[str, float], b: dict[str, float]) -> float:
    dot = sum(w * b[k] for k, w in a.items() if k in b)
    na, nb = math.sqrt(sum(w * w for w in a.values())), math.sqrt(sum(w * w for w in b.values()))
    return dot / (na * nb) if na and nb else 0.0


def candidates(pool: PoolSnapshot, vectors: Vectors, params: Params) -> dict[str, list[tuple[str, float]]]:
    """Pair affinity: cosine after hard filters (age bands, trust floor, blocks either way); top knnK >= minCosine.
    ponytail: O(n^2) over the pool; fine at 300 users, numpy sparse matmul if pools reach ~5k."""
    m = params["matching"]
    bands = set(m["ageBands"])
    users = pool.users
    ids = sorted(
        u for u in vectors if u in users and users[u].get("trustFloorOk") is not False and vectors[u]
    )

    def ok(a: str, b: str) -> bool:
        ua, ub = users[a], users[b]
        if b in ua["blockedIds"] or a in ub["blockedIds"]:
            return False
        # Bands outside matching.ageBands (30_34) only pair within their own band.
        return ua["ageBand"] == ub["ageBand"] or (ua["ageBand"] in bands and ub["ageBand"] in bands)

    out: dict[str, list[tuple[str, float]]] = {u: [] for u in sorted(users)}
    for a in ids:
        scored = [(b, round(_cos(vectors[a], vectors[b]), 6)) for b in ids if b != a and ok(a, b)]
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


def _home(u: dict) -> tuple[float, float]:
    return u["homeLocation"]["lat"], u["homeLocation"]["lng"]


def _met(pool: PoolSnapshot, state: MatchState) -> set[frozenset[str]]:
    pairs = {frozenset((uid, m)) for uid, u in pool.users.items() for m in u["metIds"]}
    return pairs | {frozenset(p) for p in state.met_pairs}


def _blocked(pool: PoolSnapshot, state: MatchState) -> set[frozenset[str]]:
    pairs = {frozenset((uid, b)) for uid, u in pool.users.items() for b in u["blockedIds"]}
    return pairs | {frozenset(p) for p in state.blocked_pairs}


def _joined(plan: Plan, pool: PoolSnapshot, state: MatchState) -> list[str]:
    """Everyone already in, join order: seed joins, then the export's live joins, then state.open_joins."""
    return list(
        dict.fromkeys(
            [*plan.seed_join_ids, *pool.joined(plan.plan_id), *state.open_joins.get(plan.plan_id, [])]
        )
    )


def _target_vector(plan: Plan, params: Params) -> dict[str, float]:
    f = params["matching"]["parentWeightFactor"]
    v: dict[str, float] = {}
    for t in plan.target_interest_ids:
        parts = t.split(".")
        for depth in range(len(parts), 0, -1):
            k = ".".join(parts[:depth])
            v[k] = max(v.get(k, 0.0), f ** (len(parts) - depth))
    return v


def _related(a: str, b: str) -> bool:
    return a == b or a.startswith(b + ".") or b.startswith(a + ".")


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
    """Per user, best first, at most feed.size. Three passes:

    1. Hard filters and base score per (user, plan): p_join x p_show x fit x travel penalty x signal x isolation.
    2. Fill likelihood per plan: (joined + sum of p_join of the top exposureCap scorers who have the plan in their
       top feed.size) / size.min. Plans below plans.fillLikelihoodFloor are dropped for everyone.
    3. Global greedy allocation, highest score first (ties: isolated first, then rng), under the per-plan exposure
       cap (minus today's state.exposures) and each user's feed.size / maxPerActivityType / maxPerScene caps.
       The isolation boost therefore acts across users: isolated people win contested exposure slots.
    """
    pp, m, f = params["plans"], params["matching"], params["feed"]
    cap, boost = pp["exposureCapPerDay"], m["isolationBoost"]
    buffer_min = params["calendar"]["minFreeBufferMin"]
    met = _met(pool, state)
    iso = {uid for uid in pool.users if not any(uid in pair for pair in met)}
    joined = {p.plan_id: _joined(p, pool, state) for p in plans}
    targets = {p.plan_id: _target_vector(p, params) for p in plans}

    # Pass 1
    rows: dict[str, list[dict]] = {}
    for uid in sorted(pool.users):
        u, vec = pool.users[uid], vectors.get(uid, {})
        rows[uid] = []
        if u.get("trustFloorOk") is False or not vec:
            continue
        slots = {(s["day"], s["part"]) for s in u["availability"]}
        gmin, gmax = u["groupSize"]["min"], u["groupSize"]["max"]
        vis = [s for s in u["signals"] if s["visibility"] == "shown" and not s["sensitive"]]
        for p in plans:
            v = venues.get(p.venue_id)
            if v is None or v.sensitive or uid in joined[p.plan_id]:
                continue
            if p.invitee_ids and uid not in p.invitee_ids:
                continue
            if p.size_max < gmin or p.size_min > gmax:
                continue
            if u["busy"]:
                if _busy_conflict(u["busy"], p.starts_at, p.ends_at, buffer_min):
                    continue
            elif _slot(p.starts_at) not in slots:
                continue
            minutes = min(travel_minutes(_home(u), v.location, mode, params) for mode in u["travel"]["modes"])
            if minutes > u["travel"]["maxMinutes"]:
                continue
            fit = _cos(vec, targets[p.plan_id])
            if fit <= 0:
                continue
            pj, ps = tables.p_join(uid, p.activity_type), tables.p_show(uid, p.activity_type)
            # ponytail: linear travel penalty, 1.0 at the door down to 0.5 at the user's limit.
            travel_pen = 1 - 0.5 * minutes / max(u["travel"]["maxMinutes"], 1)
            sig = [
                s["signalId"]
                for s in vis
                if s.get("venueId") == p.venue_id
                or any(_related(i, t) for i in s["interestIds"] for t in p.target_interest_ids)
            ]
            base = pj * ps * fit * travel_pen * ((1 + m["signalBoost"]) if sig else 1.0)
            base *= (1 + boost) if uid in iso else 1.0
            shared = list(
                dict.fromkeys(l2 for t in p.target_interest_ids if (l2 := _prefix(t, 2)) and vec.get(l2))
            )
            rows[uid].append(
                {
                    "plan": p,
                    "base": base,
                    "fit": fit,
                    "p_join": pj,
                    "p_show": ps,
                    "minutes": minutes,
                    "signal_ids": sig,
                    "shared": shared[: params["privacy"]["sharedCoarseMax"]],
                }
            )

    # Pass 2
    interest: dict[
        str, list[tuple[float, float]]
    ] = {}  # planId -> [(base, p_join)] from users ranking it top-K
    for rs in rows.values():
        for r in sorted(rs, key=lambda r: (-r["base"], r["plan"].plan_id))[: f["size"]]:
            interest.setdefault(r["plan"].plan_id, []).append((r["base"], r["p_join"]))
    fill = {}
    for p in plans:
        top = sorted(interest.get(p.plan_id, []), reverse=True)[:cap]
        fill[p.plan_id] = min(1.0, (len(joined[p.plan_id]) + sum(pj for _, pj in top)) / max(p.size_min, 1))

    # Pass 3
    cands = [
        (r["base"] * fill[pid], uid in iso, rng.random(), uid, r)
        for uid, rs in rows.items()
        for r in rs
        if fill[pid := r["plan"].plan_id] >= pp["fillLikelihoodFloor"]
    ]
    cands.sort(key=lambda c: (-c[0], not c[1], c[2], c[3]))
    left = {p.plan_id: cap - state.exposures.get(p.plan_id, 0) for p in plans}
    out: dict[str, list[PlanScore]] = {uid: [] for uid in rows}
    by_type: dict[str, Counter[str]] = {uid: Counter() for uid in rows}
    by_scene: dict[str, Counter[str]] = {uid: Counter() for uid in rows}
    for score, isolated, _, uid, r in cands:
        p = r["plan"]
        if left[p.plan_id] <= 0 or len(out[uid]) >= f["size"]:
            continue
        if by_type[uid][p.activity_type] >= f["maxPerActivityType"]:
            continue
        if p.scene_id and by_scene[uid][p.scene_id] >= f["maxPerScene"]:
            continue
        left[p.plan_id] -= 1
        by_type[uid][p.activity_type] += 1
        if p.scene_id:
            by_scene[uid][p.scene_id] += 1
        debug = {k: round(r[k], 6) for k in ("fit", "p_join", "p_show")} | {
            "fill": round(fill[p.plan_id], 6),
            "isolated": isolated,
            "signal_ids": r["signal_ids"],
        }
        out[uid].append(PlanScore(uid, p.plan_id, round(score, 6), r["shared"], r["minutes"], debug))
    return out


def _shared_l2(pool: PoolSnapshot) -> dict[str, set[str]]:
    return {uid: set(_level_weights(u, 2)) for uid, u in pool.users.items()}


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
    """Seat priority picks who gets the seats; then a max-min-pairwise split into groups.

    Seats = min(eligible, state.venue_capacity[venue]). Priority: isolated (no met connections), then most often
    left unseated (state.seat_history), then earliest join. Groups: as few as fit within size.max, sizes balanced,
    never below the stranger minimum (groups.metSizeMin when everyone in the group has met). Each member's own
    groupSize.max is respected. Groups of 3+ need every member to share >= minSharedWithOthers level-2 interests
    with >= minOthers others; a violator is swapped for the best waiting person or dropped.
    """
    g = params["groups"]
    hi = min(plan.size_max, g["sizeMax"])
    met, blocked = _met(pool, state), _blocked(pool, state)
    l2 = _shared_l2(pool)
    aff = {a: dict(lst) for a, lst in cands.items()}
    order = {u: k for k, u in enumerate(dict.fromkeys(interested_ids))}
    elig = [u for u in order if u in pool.users and pool.users[u].get("trustFloorOk") is not False]
    iso = {u for u in elig if not any(u in pair for pair in met)}
    queue = sorted(elig, key=lambda u: (u not in iso, -state.seat_history.get(u, 0), order[u]))
    seats = min(len(queue), state.venue_capacity.get(plan.venue_id, len(queue)))

    def pair(a: str, b: str) -> float:
        if frozenset((a, b)) in blocked:
            return -1.0
        return max(aff.get(a, {}).get(b, 0.0), aff.get(b, {}).get(a, 0.0)) * tables.p_meet_again(a, b)

    def umax(u: str) -> int:
        return pool.users[u]["groupSize"]["max"]

    def lo(group: list[str]) -> int:
        all_met = all(frozenset((a, b)) in met for i, a in enumerate(group) for b in group[i + 1 :])
        return max(plan.size_min, g["metSizeMin"] if all_met else g["strangerSizeMin"])

    def shares_ok(m: str, group: list[str]) -> bool:
        need = min(g["minOthers"], len(group) - 1)
        return sum(len(l2[m] & l2[o]) >= g["minSharedWithOthers"] for o in group if o != m) >= need

    def worst(group: list[str]) -> float:
        return min((pair(a, b) for i, a in enumerate(group) for b in group[i + 1 :]), default=0.0)

    # Split size: plan cap, lowered to the median member's own max so the split fits most people.
    split = min(hi, median_low([umax(u) for u in queue[:seats]] or [hi]))
    k = max(1, -(-seats // split))  # ceil
    while k > 1 and seats // k < g["strangerSizeMin"]:
        k -= 1
    sizes = [seats // k + (i < seats % k) for i in range(k)]
    groups: list[list[str]] = []
    # Seats go by priority: candidates come from the next free seats' worth of the queue; someone further
    # back steps in only when nobody in that window can join (blocked, size preference).
    rest, placed = list(queue), 0
    for size in sizes:
        if not rest or placed >= seats:
            break
        group = [rest.pop(0)]
        while len(group) < size and rest and placed + len(group) < seats:
            n = len(group) + 1
            fits = [c for c in rest if umax(c) >= n and all(umax(x) >= n for x in group)]
            fits = [c for c in fits if min(pair(c, x) for x in group) >= 0]
            if not fits:
                break
            window = set(rest[: seats - placed - len(group)])
            near = [c for c in fits if c in window]
            best = (
                max(near, key=lambda c: (min(pair(c, x) for x in group), -queue.index(c)))
                if near
                else fits[0]
            )
            group.append(best)
            rest.remove(best)
        placed += len(group)
        groups.append(group)
    waiting = rest

    # ponytail: one pass of pairwise swaps between groups that raises the lower of the two minima. A real
    # local search (repeat until no gain) if group quality on big plans ever matters.
    for gi, ga in enumerate(groups):
        for gb in groups[gi + 1 :]:
            for ia, a in enumerate(ga):
                for ib, b in enumerate(gb):
                    na, nb = ga[:ia] + [b] + ga[ia + 1 :], gb[:ib] + [a] + gb[ib + 1 :]
                    if min(worst(na), worst(nb)) > min(worst(ga), worst(gb)):
                        ga[ia], gb[ib] = b, a
                        a = b  # keep scanning with the swapped-in member

    out, unseated = [], []
    for group in groups:
        while len(group) >= 3 and (bad := [x for x in group if not shares_ok(x, group)]):
            drop = max(bad, key=lambda x: queue.index(x))  # lowest priority violator goes
            group.remove(drop)
            swap = next(
                (
                    c
                    for c in waiting
                    if min((pair(c, x) for x in group), default=0) >= 0
                    and umax(c) >= len(group) + 1
                    and shares_ok(c, [*group, c])
                ),
                None,
            )
            unseated.append(drop)
            if swap:
                waiting.remove(swap)
                group.append(swap)
        if len(group) < lo(group):
            unseated += group
            continue
        out.append(GroupResult(plan.plan_id, sorted(group, key=order.get), round(worst(group), 6)))
    unseated += waiting
    return FormResult(out, sorted(dict.fromkeys(unseated), key=order.get))
