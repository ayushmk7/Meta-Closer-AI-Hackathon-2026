"""Static world for one pool: people, 8 weeks of plan inventory, hard-filter masks, Laya tables, CG carousels.

Everything here is policy-independent and built once per pool (then shipped to worker processes).
"""

from __future__ import annotations

import copy
import json
import math
import random
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import numpy as np

from cg_sim import matching_adapter as ma
from cg_sim.contracts import data_dir
from cg_sim.contracts import params as load_params
from cg_sim.seed.generate import ground_truth_export
from cg_sim.seed.plans import venue_open

TZ = ZoneInfo("America/Los_Angeles")
DAY0 = datetime(2026, 11, 13, tzinfo=TZ)  # demo day, local midnight; sim day 0


def _jsonl(path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def _dt(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)


def day_of(t: datetime) -> int:
    return (t.astimezone(TZ).date() - DAY0.date()).days


class Tables:
    """LayaTables duck type (.p_join/.p_show/.p_meet_again) over dense arrays."""

    def __init__(self, users: list[str], acts: list[str], pj: np.ndarray, ps: np.ndarray, pm: np.ndarray):
        self.ui = {u: i for i, u in enumerate(users)}
        self.ai = {a: i for i, a in enumerate(acts)}
        self.pj, self.ps, self.pm = pj, ps, pm

    def p_join(self, u, t):
        return float(self.pj[self.ui[u], self.ai[t]])

    def p_show(self, u, t):
        return float(self.ps[self.ui[u], self.ai[t]])

    def p_meet_again(self, a, b):
        return float(self.pm[self.ui[a], self.ui[b]])


def load_tables(pool_id: str, users: list[str], acts: list[str], fake: bool) -> tuple[Tables, bool]:
    """(tables, is_fake). fake: S2's precompute.build_tables with the hash LayaClient (render_state inside, so
    values equal the backend's LAYA_FAKE); else data/laya_tables/<pool>/*.parquet."""
    if fake:
        from cg_sim import laya, precompute
        from cg_sim.seed.export import load_ground_truth_export

        act_rows, meet_rows = precompute.build_tables(
            load_ground_truth_export(pool_id), precompute.load_activity(pool_id), laya.LayaClient(fake=True))
    else:
        import pyarrow.parquet as pq

        d = data_dir() / "laya_tables" / pool_id
        act_rows, meet_rows = (pq.read_table(d / f).to_pylist() for f in ("activity.parquet", "meet_again.parquet"))
        fake = json.loads((d / "manifest.json").read_text())["layaModel"] == "fake"
    n, na = len(users), len(acts)
    ui, ai = {u: i for i, u in enumerate(users)}, {a: i for i, a in enumerate(acts)}
    pj, ps = np.full((n, na), 0.5), np.full((n, na), 0.5)
    for r in act_rows:
        if r["user_id"] in ui and r["activity_type"] in ai:
            pj[ui[r["user_id"]], ai[r["activity_type"]]] = r["p_join"]
            ps[ui[r["user_id"]], ai[r["activity_type"]]] = r["p_show"]
    pm = np.full((n, n), 0.2)  # ponytail: pairs outside each user's top-K default to a low prior
    for r in meet_rows:
        if r["user_a"] in ui and r["user_b"] in ui:
            a, b = ui[r["user_a"]], ui[r["user_b"]]
            pm[a, b] = pm[b, a] = r["p_meet_again"]
    return Tables(users, acts, pj, ps, pm), fake


@dataclass
class World:
    pool_id: str
    params: dict
    weeks: int
    users: list[str]
    low: np.ndarray            # bool [n]  low-outgoing (sim_private)
    outgoing: np.ndarray       # float [n] (sim_private; truth world only)
    flaky: np.ndarray          # float [n]
    people: list[dict]         # replay statics
    venues: list[dict]
    plans: list[dict]          # global inventory over all weeks
    propose_day: np.ndarray    # int [P]
    form_day: np.ndarray       # int [P]
    start_day: np.ndarray      # int [P]
    size_min: np.ndarray
    size_max: np.ndarray
    elig: np.ndarray           # bool [n, P]  calendar + travel hard filters
    fit: np.ndarray            # float [n, P]
    pj: np.ndarray             # float [n, P]  p_join for the plan's activity
    ps: np.ndarray             # float [n, P]
    pm: np.ndarray             # float [n, n]
    tables: Tables
    export: dict               # pool_export used by the adapter (busy stripped)
    cg_feed: list[list[np.ndarray]] = field(default_factory=list)  # [day][user] -> plan indices

    @property
    def days(self) -> int:
        return self.weeks * 7


def build(pool_id: str, fake_laya: bool = True, weeks: int | None = None, limit_users: int | None = None,
          overrides: dict | None = None) -> World:
    p = copy.deepcopy(load_params())
    for dotted, v in (overrides or {}).items():
        sec, key = dotted.split(".")
        p[sec][key] = v
    weeks = weeks or p["sim"]["weeks"]
    seed_dir, priv = data_dir() / "seed" / pool_id, data_dir() / "sim_private" / pool_id
    personas = _jsonl(seed_dir / "personas.jsonl")
    truth = _jsonl(priv / "ground_truth.jsonl")
    if limit_users:  # toy pool: people from the biggest scenes first, so a small pool still has dense scenes
        size = Counter(t["scene"] for t in truth)
        order = sorted(truth, key=lambda t: (-size[t["scene"]] if t["scene"] else 1, t["scene"] or "", t["userId"]))
        keep = {t["userId"] for t in order[:limit_users]}
        personas = [x for x in personas if x["userId"] in keep]
        truth = [t for t in truth if t["userId"] in keep]
    latent = {x["userId"]: x for x in _jsonl(priv / "latent.jsonl")}
    venues = [v for v in _jsonl(seed_dir / "venues.jsonl") if not v.get("sensitive")]
    vby = {v["venueId"]: v for v in venues}
    # ponytail: busy blocks only cover 14 days, so the 8-week sim uses availability slots everywhere.
    export = ground_truth_export(pool_id, personas, truth, [])
    users = [u["userId"] for u in export["users"]]
    ui = {u: i for i, u in enumerate(users)}
    n = len(users)
    scene_of = {t["userId"]: t["scene"] for t in truth if t["scene"]}

    plans: list[dict] = []
    pdays = []
    for w in range(weeks):
        hs = (DAY0 + timedelta(days=7 * w)).astimezone(UTC)
        for raw in ma.propose_plans(export, venues, scene_of, p, random.Random(f"{pool_id}|w{w}"), hs):
            v = vby.get(raw["venueId"])
            s, e = _dt(raw["startsAt"]), _dt(raw["endsAt"])
            if not v or raw["activityType"] not in v["activityTypes"] or not venue_open(v, s, e):
                continue
            plans.append({**raw, "planId": f"w{w}_{raw['planId']}", "poolId": pool_id, "seedJoinIds": []})
            pdays.append(max(0, 7 * (w - 1)))  # ponytail: horizon week w is proposed (shown) a week ahead
    lead = timedelta(hours=p["plans"]["formLeadHours"])
    start_day = np.array([day_of(_dt(x["startsAt"])) for x in plans])
    propose_day = np.array(pdays)
    form_day = np.maximum(np.array([day_of(_dt(x["startsAt"]) - lead) for x in plans]), propose_day)
    keep = start_day < 7 * weeks
    plans = [x for x, k in zip(plans, keep) if k]
    start_day, propose_day, form_day = start_day[keep], propose_day[keep], form_day[keep]
    P = len(plans)

    acts = sorted({x["activityType"] for x in plans} | set(ma.ACTIVITY_INTERESTS))
    tables, fake_tables = load_tables(pool_id, users, acts, fake_laya)
    act_i = np.array([tables.ai[x["activityType"]] for x in plans], dtype=int)

    vectors = ma.build_vectors(export, p)
    elig = np.zeros((n, P), bool)
    fit = np.zeros((n, P))
    slot_of = [ma._slot(_dt(x["startsAt"])) for x in plans]
    for i, u in enumerate(export["users"]):
        slots = {(s["day"], s["part"]) for s in u["availability"]}
        vec = vectors[u["userId"]]
        mins = {}
        for j, x in enumerate(plans):
            vid = x["venueId"]
            if vid not in mins:
                loc = vby[vid]["location"]
                mins[vid] = min(ma.travel_minutes(u["homeLocation"], loc, m, p) for m in u["travel"]["modes"])
            ok_travel = export["mode"] == "event" or mins[vid] <= u["travel"]["maxMinutes"]
            elig[i, j] = ok_travel and slot_of[j] in slots
            fit[i, j] = max((vec.get(t, 0.0) for t in x["targetInterestIds"]), default=0.0)

    tr = {t["userId"]: t for t in truth}
    people = [{"userId": u["userId"], "lat": u["homeLocation"]["lat"], "lng": u["homeLocation"]["lng"],
               "sceneId": tr[u["userId"]]["scene"], "lowOutgoing": bool(latent[u["userId"]]["lowOutgoing"])}
              for u in export["users"]]
    world = World(
        pool_id=pool_id, params=p, weeks=weeks, users=users,
        low=np.array([latent[u]["lowOutgoing"] for u in users]),
        outgoing=np.array([latent[u]["outgoingness"] for u in users]),
        flaky=np.array([latent[u]["flakiness"] for u in users]),
        people=people,
        venues=[{"venueId": v["venueId"], "name": v["name"], "lat": v["location"]["lat"],
                 "lng": v["location"]["lng"]} for v in venues],
        plans=plans, propose_day=propose_day, form_day=form_day, start_day=start_day,
        size_min=np.array([x["size"]["min"] for x in plans]), size_max=np.array([x["size"]["max"] for x in plans]),
        # ponytail: fake p_join is a hash of the state, blind to interests; real Laya reads them. Scale by fit
        # for fake tables so an irrelevant impression converts at ~0, as it would with real tables.
        elig=elig, fit=fit, pj=tables.pj[:, act_i] * (fit if fake_tables else 1.0), ps=tables.ps[:, act_i], pm=tables.pm,
        tables=tables, export=export,
    )
    # Common Ground carousels via the shared rank_plans, cached per day.
    # ponytail: valid while rank_plans ignores per-user state beyond a per-user scale (fallback: isolation boost
    # rescales a user's own scores; exposures restart daily). Real cg_matching -> call per day per run instead.
    for d in range(world.days):
        active = [j for j in range(P) if propose_day[j] <= d <= form_day[j]]
        ranked = ma.rank_plans(export, [plans[j] for j in active], vectors, vby, tables, {}, p, random.Random(d))
        idx = {plans[j]["planId"]: j for j in active}
        world.cg_feed.append([np.array([idx[s["plan_id"]] for s in ranked.get(u, [])], dtype=int) for u in users])
    assert all(len(x) == n for x in world.cg_feed) and ui
    return world


def cells(params: dict) -> list[tuple[float, float]]:
    """(flake, join) multipliers, row-major; the 1.0 x 1.0 cell is the replay cell."""
    m = params["sim"]["sweepMultipliers"]
    return [(f, j) for f in m for j in m]


def ci95(x) -> tuple[float, float, float]:
    x = np.asarray(x, float)
    x = x[~np.isnan(x)]
    if not len(x):
        return math.nan, math.nan, math.nan
    h = 1.96 * x.std(ddof=1) / math.sqrt(len(x)) if len(x) > 1 else 0.0
    return float(x.mean()), float(x.mean() - h), float(x.mean() + h)
