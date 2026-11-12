"""Thin dict-in / dict-out shim over cg_matching (CONTRACTS §10, packages/matching).

Kept so mc, laya and seed call one place with plain records; all logic lives in cg_matching.
pool = pool_export dict, plans/venues = schema records, state = MatchState or a dict (camelCase or snake_case),
tables = LayaTables, a path to data/laya_tables/<pool>/, a duck-typed fake, or None (cg_matching defaults).
Results are plain dicts (PlanScore / FormResult .to_dict()).
"""

from __future__ import annotations

import random
import re
from datetime import datetime
from pathlib import Path

import cg_matching as _cgm
from cg_matching import ACTIVITY_INTERESTS  # noqa: F401  (re-export)

HAVE_MATCHING = True  # kept for callers that report which engine ran


def _snap(pool: dict):
    return _cgm.PoolSnapshot.from_export(pool)


def _params(params: dict):
    return params if isinstance(params, _cgm.Params) else _cgm.Params(params)


def _state(state):
    if isinstance(state, _cgm.MatchState):
        return state
    return _cgm.MatchState(**{re.sub(r"(?<!^)([A-Z])", r"_\1", k).lower(): v for k, v in (state or {}).items()})


def _tables(tables):
    if tables is None:
        return _cgm.LayaTables()
    return _cgm.LayaTables.from_dir(Path(tables)) if isinstance(tables, (str, Path)) else tables


def _slot(starts: datetime) -> tuple[str, str]:
    """(day, part) of a UTC start in America/Los_Angeles."""
    from zoneinfo import ZoneInfo

    lt = starts.astimezone(ZoneInfo("America/Los_Angeles"))
    return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][lt.weekday()], (
        "morning" if lt.hour < 12 else "afternoon" if lt.hour < 17 else "evening"
    )


def propose_plans(pool: dict, venues: list[dict], scene_of: dict[str, str], params: dict, rng: random.Random,
                  horizon_start: datetime) -> list[dict]:
    out = _cgm.propose_plans(_snap(pool), [_cgm.Venue.from_record(v) for v in venues], scene_of, _params(params),
                             rng, horizon_start)
    return [p.to_record() for p in out]


def travel_minutes(origin: dict, dest: dict, mode: str, params: dict) -> int:
    return _cgm.travel_minutes((origin["lat"], origin["lng"]), (dest["lat"], dest["lng"]), mode, _params(params))


def build_vectors(pool: dict, params: dict):
    return _cgm.build_vectors(_snap(pool), _params(params))


def candidates(pool: dict, vectors, params: dict) -> dict[str, list[tuple[str, float]]]:
    return _cgm.candidates(_snap(pool), vectors, _params(params))


def scenes(pool: dict, cands, params: dict, seed: int) -> dict[str, str]:
    return _cgm.scenes(_snap(pool), cands, _params(params), seed)


def rank_plans(pool: dict, plans: list[dict], vectors, venues: dict[str, dict], tables, state, params: dict,
               rng: random.Random) -> dict[str, list[dict]]:
    snap, prm = _snap(pool), _params(params)
    out = _cgm.rank_plans(snap, [_cgm.Plan.from_record(p) for p in plans], vectors or _cgm.build_vectors(snap, prm),
                          {k: _cgm.Venue.from_record(v) for k, v in venues.items()}, _tables(tables), _state(state),
                          prm, rng)
    return {u: [s.to_dict() for s in ss] for u, ss in out.items()}


def form_groups(plan: dict, interested_ids: list[str], pool: dict, cands, tables, state, params: dict,
                rng: random.Random) -> dict:
    res = _cgm.form_groups(_cgm.Plan.from_record(plan), interested_ids, _snap(pool), cands, _tables(tables),
                           _state(state), _params(params), rng)
    return res.to_dict()
