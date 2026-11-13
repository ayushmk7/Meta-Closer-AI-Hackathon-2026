"""One Monte Carlo run: (world, policy, seed, flake multiplier, join multiplier) -> metrics (+ replay trace).

Daily tick (PRD-3 §6): carousels -> joins -> formation at formsAt -> meetups at startsAt -> state.
Common random numbers: every draw comes from a generator keyed by (seed, day, purpose) with a fixed shape, so
all policies and sweep cells see identical random streams; only decisions differ.
"""

from __future__ import annotations

import random

import numpy as np

from cg_sim import matching_adapter as ma
from cg_sim.mc.world import World

POLICIES = ("random", "greedy", "common_ground")  # default; common_ground_learned via `cg-sim run --policies`
CG = ("common_ground", "common_ground_learned")  # learned = common_ground + MatchState.prefs from update_prefs
# Calibration knob (not a contract param): one day's impression converts at JOIN_DAILY x p_join. At 1/7 almost
# nothing forms in a 300-person pool; 0.5 gives fill rates in a plausible 0.2-0.7 band. The join sweep brackets it.
JOIN_DAILY = 0.5
_PURPOSE = {"join": 1, "show": 2, "meet": 3, "rand": 4}


def _rng(seed: int, day: int, purpose: str) -> np.random.Generator:
    return np.random.default_rng([seed, day, _PURPOSE[purpose]])


def gini(x) -> float:
    x = np.sort(np.asarray(x, float))
    if not len(x) or x.sum() == 0:
        return 0.0
    n = len(x)
    return float((2 * np.arange(1, n + 1) - n - 1) @ x / (n * x.sum()))


def _pool(w: World, met: np.ndarray, members=None) -> dict:
    """The export with live metIds (rank_plans/form_groups read them for isolation priority)."""
    idx = range(len(w.users)) if members is None else members
    us = w.export["users"]
    return {**w.export, "users": [{**us[i], "metIds": [w.users[k] for k in np.flatnonzero(met[i])]} for i in idx]}


def _carousel(w: World, policy: str, d: int, active: np.ndarray, joined: np.ndarray, counts: np.ndarray,
              seed: int, met: np.ndarray, prefs: dict) -> np.ndarray:
    """bool [n, len(active)]: plans shown to each person today."""
    n, k = len(w.users), w.params["feed"]["size"]
    shown = np.zeros((n, len(active)), bool)
    if not len(active):
        return shown
    if policy in CG:
        col = {j: c for c, j in enumerate(active)}
        # Live joiners ride in seedJoinIds: rank_plans then skips plans a person already joined and counts the
        # joins toward fill likelihood, as the backend does with live plans.
        plans = [{**w.plans[j], "seedJoinIds": [w.users[i] for i in np.flatnonzero(joined[:, j])]} for j in active]
        ranked = ma.rank_plans(_pool(w, met), plans, w.vectors, w.venue_by_id, w.tables, {"prefs": prefs},
                               w.params, random.Random(f"{seed}|{d}"))
        ui, pi = w.tables.ui, {w.plans[j]["planId"]: j for j in active}
        for uid, feed in ranked.items():
            for s in feed:
                shown[ui[uid], col[pi[s["plan_id"]]]] = True
        return shown
    ok = w.elig[:, active] & ~joined[:, active]
    if policy == "random":
        score = _rng(seed, d, "rand").random((n, len(active)))
    else:  # greedy: most-joined first, then cosine fit; no cap, no boost, no diversity
        ok &= w.fit[:, active] > 0
        score = counts[active][None, :] * 10.0 + w.fit[:, active]
    score = np.where(ok, score, -np.inf)
    top = np.argsort(-score, axis=1, kind="stable")[:, :k]
    rows = np.arange(n)[:, None]
    shown[rows, top] = np.isfinite(score[rows, top])
    return shown


def _first_come(members: list[int], lo: int, hi: int) -> tuple[list[list[int]], list[int]]:
    groups = [members[i:i + hi] for i in range(0, len(members), hi)]
    if groups and len(groups[-1]) < lo:
        return groups[:-1], groups[-1]
    return groups, []


def simulate(w: World, policy: str, seed: int, flake: float = 1.0, join: float = 1.0,
             trace: bool = False, world_model: str = "tables") -> dict:
    p = w.params
    n, P, days = len(w.users), len(w.plans), w.days
    open_max = p["plans"]["openJoinsMax"]
    pj = np.clip(w.pj * join, 0, 1)
    ps = w.ps
    if world_model == "truth":  # stretch: outcomes also depend on hidden traits the policy never sees
        pj = np.clip(pj * (0.5 + w.outgoing)[:, None], 0, 1)
        ps = ps * (1 - 0.5 * w.flaky)[:, None]
    ps = np.clip(1 - (1 - ps) * flake, 0, 1)  # flake multiplier scales the no-show rate

    joined = np.zeros((n, P), bool)        # interested or seated, ever
    open_join = np.zeros((n, P), bool)     # interested, not yet formed
    join_time = np.full((n, P), np.inf)
    counts = np.zeros(P, int)
    seats: dict[int, list[list[int]]] = {}
    met = np.zeros((n, n), bool)
    together = np.zeros((n, n), np.int16)
    coatt = np.zeros((n, n), np.int16)  # meetups both attended, liked or not
    group_sizes: list[int] = []
    friends = np.zeros((n, n), bool)
    seated_ever = np.zeros(n, bool)
    first_meet = np.full(n, -1)
    n_joins = n_attend = n_seated = n_showed = 0
    formed = np.zeros(P, bool)
    iso_series, friend_series, show_series, frames = [], [], [], []
    wk_seated = wk_showed = 0
    prefs: dict[str, dict[str, float]] = {}  # common_ground_learned only; stays empty otherwise
    learn = policy == "common_ground_learned"
    pref_keys = _pref_keys(w) if learn else None
    alpha = p["matching"]["prefAlpha"]
    week_frame = {"meetups": [], "metPairs": [], "friendships": []}
    low = w.low

    for d in range(days):
        active = np.flatnonzero((w.propose_day <= d) & (w.form_day >= d))
        # 1-2. carousel + joins
        shown = _carousel(w, policy, d, active, joined, counts, seed, met, prefs)
        u = _rng(seed, d, "join").random((n, len(active)))
        n_open = open_join.sum(1)
        fatigue = np.clip(1 - n_open / open_max, 0, 1)[:, None]  # documented fatigue: linear to 0 at openJoinsMax
        new = shown & ~joined[:, active] & (u < pj[:, active] * JOIN_DAILY * fatigue)
        over = np.flatnonzero(n_open + new.sum(1) > open_max)
        for i in over:  # keep the cap exact: drop the excess joins with the highest draws
            cols = np.flatnonzero(new[i])
            drop = cols[np.argsort(u[i, cols])][open_max - n_open[i]:]
            new[i, drop] = False
        ii, cc = np.nonzero(new)
        jj = active[cc]
        joined[ii, jj] = open_join[ii, jj] = True
        join_time[ii, jj] = d + u[ii, cc]
        np.add.at(counts, jj, 1)
        n_joins += len(ii)

        # 3. formation
        for j in active[w.form_day[active] == d]:
            members = [int(i) for i in np.flatnonzero(open_join[:, j])]
            members.sort(key=lambda i: join_time[i, j])
            open_join[:, j] = False
            lo, hi = int(w.size_min[j]), int(w.size_max[j])
            if policy in CG:
                groups = _cg_form(w, j, members, met, seed, d)
            else:
                groups, _ = _first_come(members, lo, hi)
            if groups:
                formed[j] = True
                seats[j] = groups
                for g in groups:
                    seated_ever[g] = True

        # 4. meetups
        starting = [j for j in np.flatnonzero(w.start_day == d) if j in seats]
        if starting:
            us = _rng(seed, d, "show").random((n, P))
            um = _rng(seed, d, "meet").random((n, n))
            for j in starting:
                for g in seats.pop(j):
                    showed = [i for i in g if us[i, j] < ps[i, j]]
                    n_seated += len(g)
                    group_sizes.append(len(g))
                    n_showed += len(showed)
                    wk_seated += len(g)
                    wk_showed += len(showed)
                    liked = set()
                    if learn:  # D: a no-show of mine is -0.5
                        for i in set(g) - set(showed):
                            _learn(prefs, w.users[i], pref_keys[j], -0.5, alpha)
                    if len(showed) < 2:
                        continue
                    n_attend += len(showed)
                    for i in showed:
                        if first_meet[i] < 0:
                            first_meet[i] = d
                    for x, a in enumerate(showed):
                        for b in showed[x + 1:]:
                            a_, b_ = min(a, b), max(a, b)
                            coatt[a_, b_] += 1
                            if not met[a_, b_]:
                                met[a_, b_] = met[b_, a_] = True
                                if trace:
                                    week_frame["metPairs"].append([w.users[a_], w.users[b_]])
                            if um[a_, b_] < w.pm[a_, b_]:
                                liked |= {a_, b_}
                                together[a_, b_] += 1
                                if together[a_, b_] >= p["sim"]["friendshipMeetups"] and not friends[a_, b_]:
                                    friends[a_, b_] = friends[b_, a_] = True
                                    if trace:
                                        week_frame["friendships"].append([w.users[a_], w.users[b_]])
                    if learn:  # D feedback stand-in: +0.5 if I'd meet someone again, else -0.5
                        for i in showed:
                            _learn(prefs, w.users[i], pref_keys[j], 0.5 if i in liked else -0.5, alpha)
                    if trace:
                        x = w.plans[j]
                        week_frame["meetups"].append({
                            "planId": x["planId"], "venueId": x["venueId"], "activityType": x["activityType"],
                            "day": d, "memberIds": [w.users[i] for i in g], "showedIds": [w.users[i] for i in showed]})

        # 5. weekly state
        if d % 7 == 6:
            has_friend = friends.any(1)
            iso_series.append(float((~has_friend[low]).mean()) if low.any() else float("nan"))
            friend_series.append(float(has_friend.mean()))
            show_series.append(wk_showed / wk_seated if wk_seated else float("nan"))
            wk_seated = wk_showed = 0
            if trace:
                frames.append({"week": d // 7 + 1, "isolatedShareLowOut": iso_series[-1],
                               "friendshipShare": friend_series[-1], **week_frame})
                week_frame = {"meetups": [], "metPairs": [], "friendships": []}

    in_horizon = w.form_day < days
    fc = friends.sum(1)
    out = {
        "friendShareW4": friend_series[3] if len(friend_series) > 3 else float("nan"),
        "friendShareW8": friend_series[-1],
        "isolatedLowW8": iso_series[-1],
        "isolatedLowByWeek": [1.0] + iso_series,
        "friendShareByWeek": friend_series,
        "showRateByWeek": show_series,
        "fillRate": float(formed[in_horizon].mean()) if in_horizon.any() else float("nan"),
        "joinToMeetup": n_attend / n_joins if n_joins else float("nan"),
        "showRate": n_showed / n_seated if n_seated else float("nan"),
        "giniFriends": gini(fc),
        "medianDaysFirstMeetup": float(np.median(first_meet[first_meet >= 0])) if (first_meet >= 0).any() else float("nan"),
        # reunion diagnostic: share of met pairs that co-attended >= 2 meetups (liked or not / both liked)
        "repeatCoattendShare": float((coatt >= 2).sum() / max(1, (coatt >= 1).sum())),
        "repeatLikedShare": float((together >= 2).sum() / max(1, (coatt >= 1).sum())),
        "metPairs": int((coatt >= 1).sum()),
        "repeatLikedPairs": int((together >= 2).sum()),
        "meanGroupSize": float(np.mean(group_sizes)) if group_sizes else float("nan"),
        "lowSeatedShare": float(seated_ever[low].mean()) if low.any() else float("nan"),
    }
    if trace:
        out["frames"] = frames
    return out


def _pref_keys(w: World) -> list[list[str]]:
    """cg_matching.plan_pref_keys per plan (act:, vn:, int:), so sim and backend learn on the same keys."""
    import cg_matching as cgm

    return [cgm.plan_pref_keys(cgm.Plan.from_record(x), cgm.Venue.from_record(w.venue_by_id[x["venueId"]]))
            for x in w.plans]


def _learn(prefs: dict, uid: str, keys: list[str], r: float, alpha: float) -> None:
    import cg_matching as cgm

    prefs[uid] = cgm.update_prefs(prefs.get(uid, {}), keys, r, alpha)


def _cg_form(w: World, j: int, members: list[int], met: np.ndarray, seed: int, d: int) -> list[list[int]]:
    """Shared form_groups on a mini pool of just the interested people. Met pairs ride in metIds (_pool); cands
    gives pair() its affinity (with {} every pair scored 0 and splits followed queue order). ponytail: state stays
    {}: venue capacity never binds here (seats are not scarce) and seat_history only reorders an unbinding queue."""
    if len(members) < w.size_min[j]:
        return []
    ids = [w.users[i] for i in members]
    pool = _pool(w, met, members)
    res = ma.form_groups(w.plans[j], ids, pool, w.cands, w.tables, {}, w.params, random.Random(f"{seed}|{d}|{j}"))
    ui = w.tables.ui
    return [[ui[m] for m in g["member_ids"]] for g in res["groups"]]
