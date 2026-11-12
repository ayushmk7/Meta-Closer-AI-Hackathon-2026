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
