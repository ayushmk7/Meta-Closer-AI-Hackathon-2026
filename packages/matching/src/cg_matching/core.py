"""cg_matching functions (CONTRACTS §10, PRD-2 §3.3). Pure and deterministic for the given rng/seed."""

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
    """Leiden communities on the kNN graph (edge weight = cosine), deterministic for `seed`.
    Scene ID = sc_ + the community's top two shared level-2 interests (leaf names). Users with no candidate edge
    (or alone in their community) get no scene."""
    import igraph as ig
    import leidenalg

    ids = sorted(set(cands) | {b for lst in cands.values() for b, _ in lst})
    idx = {u: i for i, u in enumerate(ids)}
    edges: dict[tuple[int, int], float] = {}
    for a, lst in sorted(cands.items()):
        for b, w in lst:
            e = (min(idx[a], idx[b]), max(idx[a], idx[b]))
            edges[e] = max(edges.get(e, 0.0), w)
    if not edges:
        return {}
    keys = sorted(edges)
    g = ig.Graph(n=len(ids), edges=keys)
    part = leidenalg.find_partition(
        g,
        leidenalg.RBConfigurationVertexPartition,
        weights=[edges[e] for e in keys],
        resolution_parameter=params["matching"]["leidenResolution"],
        seed=seed,
    )
    comms = sorted(([ids[i] for i in c] for c in part if len(c) > 1), key=lambda c: (-len(c), min(c)))
    out: dict[str, str] = {}
    used: Counter[str] = Counter()
    for members in comms:
        w: Counter[str] = Counter()
        for m in members:
            if m in pool.users:
                w.update(_level_weights(pool.users[m], 2))
        top = [k for k, _ in sorted(w.items(), key=lambda kv: (-kv[1], kv[0]))[:2]]
        base = "sc_" + ("_".join(k.split(".")[1] for k in top) or "mixed")
        used[base] += 1
        sid = base if used[base] == 1 else f"{base}_{used[base]}"
        out |= {m: sid for m in members}
    return dict(sorted(out.items()))


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
    params: Params | None = None,
) -> list[tuple[str, int]]:
    """(interest ID at `level`, count of other joined users who have it) for interests the viewer has.
    Empty below params.privacy.crowdMinCount other joined users (P2). Pass `params` for the pure path; None falls back to Params.default(), the package's
    only I/O."""
    min_count = (params or Params.default())["privacy"]["crowdMinCount"]
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


def _open_at(v: Venue, starts: datetime, ends: datetime) -> bool:
    if not v.hours:
        return True  # parks, trails
    ls, le = starts.astimezone(TZ), ends.astimezone(TZ)
    day = _DAYS[ls.weekday()]
    return (
        any(
            h["day"] == day and h["open"] <= ls.strftime("%H:%M") and le.strftime("%H:%M") <= h["close"]
            for h in v.hours
        )
        and ls.date() == le.date()
    )


def _free(pool: PoolSnapshot, uid: str, starts: datetime, ends: datetime, buffer_min: int) -> bool:
    if busy := pool.busy[uid]:
        return not _busy_conflict(busy, starts, ends, buffer_min)
    return _slot(starts) in {(s["day"], s["part"]) for s in pool.users[uid]["availability"]}


def _windows(horizon_start: datetime, params: Params) -> list[datetime]:
    """Local morning/afternoon/evening starts in [start + minLeadHours, start + horizonDays]."""
    p = params["plans"]
    lo, hi = (
        horizon_start + timedelta(hours=p["minLeadHours"]),
        horizon_start + timedelta(days=p["horizonDays"]),
    )
    day0 = lo.astimezone(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    out = []
    for d in range(p["horizonDays"] + 1):
        for h in _PARTS.values():
            local = (day0 + timedelta(days=d)).replace(hour=h)  # wall-clock arithmetic, DST-safe
            if lo <= local <= hi:
                out.append(local.astimezone(horizon_start.tzinfo))
    return out


PLAN_HOURS = 2  # ponytail: every proposed plan runs 2 h; per-activity durations if Muse copy needs them


def propose_plans(
    pool: PoolSnapshot,
    venues: list[Venue],
    scene_of: dict[str, str],
    params: Params,
    rng: random.Random,
    horizon_start: datetime,
) -> list[Plan]:
    """Per scene: its top activity types (ACTIVITY_INTERESTS x members' level-2 weights) x the nearest open public
    venues for them x the window most members are free, up to plans.proposalsPerSceneWeek. Plus one origin=signal
    plan per strong visible frequent_place/routine signal at a known venue. IDs carry the horizon date so nightly
    runs never reuse one."""
    pp = params["plans"]
    buffer_min = params["calendar"]["minFreeBufferMin"]
    strong = params["nudges"]["minSignalStrength"]
    stamp = horizon_start.astimezone(TZ).strftime("%Y%m%d")
    usable = sorted((v for v in venues if not v.sensitive), key=lambda v: v.venue_id)
    by_id = {v.venue_id: v for v in usable}
    windows = _windows(horizon_start, params)
    members: dict[str, list[str]] = {}
    for uid, sc in sorted(scene_of.items()):
        if uid in pool.users:
            members.setdefault(sc, []).append(uid)

    def make(
        pid: str, at: str, v: Venue, starts: datetime, targets: list[str], sc: str | None, origin: str
    ) -> Plan:
        return Plan(
            plan_id=pid,
            activity_type=at,
            venue_id=v.venue_id,
            starts_at=starts,
            ends_at=starts + timedelta(hours=PLAN_HOURS),
            size_min=pp["defaultSize"]["min"],
            size_max=pp["defaultSize"]["max"],
            cost=dict(v.cost),
            target_interest_ids=tuple(targets),
            scene_id=sc,
            origin=origin,
        )

    def best_window(v: Venue, people: list[str], taken: set[datetime]) -> datetime | None:
        scored = []
        for w in windows:
            if w in taken or not _open_at(v, w, w + timedelta(hours=PLAN_HOURS)):
                continue
            free = sum(_free(pool, u, w, w + timedelta(hours=PLAN_HOURS), buffer_min) for u in people)
            if free:
                scored.append((free, w))
        if not scored:
            return None
        top = max(f for f, _ in scored)
        # rng breaks ties among the best windows so scenes don't all pile onto the same slot.
        return rng.choice(sorted(w for f, w in scored if f == top))

    out: list[Plan] = []
    seen_venue_at: set[tuple[str, datetime]] = set()
    for sc in sorted(members):
        people = members[sc]
        l2: Counter[str] = Counter()
        for u in people:
            l2.update(_level_weights(pool.users[u], 2))
        homes = [_home(pool.users[u]) for u in people]
        types = sorted(
            ((sum(l2[i] for i in ints), at) for at, ints in ACTIVITY_INTERESTS.items()),
            key=lambda t: (-t[0], t[1]),
        )
        options = []
        for score, at in types:
            if score <= 0:
                break
            near = sorted(
                (
                    sum(travel_minutes(h, v.location, "transit", params) for h in homes) / len(homes),
                    v.venue_id,
                )
                for v in usable
                if at in v.activity_types
            )
            options += [(at, by_id[vid]) for _, vid in near[:2]]
        taken: set[datetime] = set()
        n = 0
        for at, v in options:
            if n >= pp["proposalsPerSceneWeek"]:
                break
            if (w := best_window(v, people, taken)) is None or (v.venue_id, w) in seen_venue_at:
                continue
            taken.add(w)
            seen_venue_at.add((v.venue_id, w))
            targets = [i for i in ACTIVITY_INTERESTS[at] if l2[i] > 0]
            out.append(make(f"pl_{sc.removeprefix('sc_')}_{stamp}_{n:02d}", at, v, w, targets, sc, "seed"))
            n += 1

    # Signal plans: one per venue a strong visible frequent_place/routine signal points at.
    sig_venues: dict[str, list[tuple[str, list[str]]]] = {}
    for uid, u in sorted(pool.users.items()):
        for s in u["signals"]:
            ok = s["visibility"] == "shown" and not s["sensitive"] and s["strength"] >= strong
            if ok and s["kind"] in ("frequent_place", "routine") and s.get("venueId") in by_id:
                sig_venues.setdefault(s["venueId"], []).append((uid, s["interestIds"]))
    for vid, hits in sorted(sig_venues.items()):
        v = by_id[vid]
        sig_l2 = Counter(p for _, ints in hits for i in ints if (p := _prefix(i, 2)))
        at = min(v.activity_types, key=lambda t: (-sum(sig_l2[i] for i in ACTIVITY_INTERESTS.get(t, [])), t))
        people = [u for u, _ in hits]
        if (w := best_window(v, people, set())) is None or (vid, w) in seen_venue_at:
            continue
        seen_venue_at.add((vid, w))
        targets = [i for i in ACTIVITY_INTERESTS.get(at, []) if sig_l2[i] > 0] or ACTIVITY_INTERESTS.get(
            at, []
        )[:1]
        if targets:
            out.append(
                make(
                    f"pl_sig_{vid.removeprefix('vn_')}_{stamp}",
                    at,
                    v,
                    w,
                    targets,
                    scene_of.get(people[0]),
                    "signal",
                )
            )
    return out


def _busy_conflict(
    busy: list[tuple[datetime, datetime]], starts: datetime, ends: datetime, buffer_min: int
) -> bool:
    buf = timedelta(minutes=buffer_min)
    return any(bs < ends + buf and starts - buf < be for bs, be in busy)


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
            if busy := pool.busy[uid]:
                if _busy_conflict(busy, p.starts_at, p.ends_at, buffer_min):
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

    if fixed := [u for u in state.fixed_ids.get(plan.plan_id, []) if u in pool.users]:
        return _backfill(
            plan, fixed, [u for u in queue if u not in fixed], hi, lo, pair, umax, shares_ok, worst, order
        )

    # Split size: plan cap, lowered to the median member's own max so the split fits most people.
    split = min(hi, median_low([umax(u) for u in queue[:seats]] or [hi]))
    k = max(1, -(-seats // split))  # ceil
    while k > 1 and seats // k < g["strangerSizeMin"]:
        k -= 1
    seats = min(seats, k * split)  # k lowered for the stranger minimum must not overflow the cap
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
    unseated += waiting + [u for u in order if u not in elig]  # unknown or under the trust floor
    return FormResult(out, sorted(dict.fromkeys(unseated), key=order.get))


def _backfill(plan, fixed, waiting, hi, lo, pair, umax, shares_ok, worst, order) -> FormResult:
    group = list(fixed)
    target = min(hi, max(lo(group), len(group) + 1))
    while len(group) < target:
        n = len(group) + 1
        fits = [
            c
            for c in waiting
            if umax(c) >= n
            and all(umax(x) >= n for x in group)
            and min(pair(c, x) for x in group) >= 0
            and (n < 3 or shares_ok(c, [*group, c]))
        ]
        if not fits:
            break
        best = max(fits, key=lambda c: (min(pair(c, x) for x in group), -waiting.index(c)))
        group.append(best)
        waiting.remove(best)
    rank = {u: k for k, u in enumerate(group)} | order
    if len(group) < lo(group):
        return FormResult(
            [], [*group, *sorted(waiting, key=order.get)]
        )  # caller cancels or offers alternatives
    return FormResult(
        [GroupResult(plan.plan_id, sorted(group, key=rank.get), round(worst(group), 6))],
        sorted(waiting, key=order.get),
    )
