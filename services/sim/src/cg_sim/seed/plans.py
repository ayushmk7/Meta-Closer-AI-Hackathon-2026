"""plans.jsonl and demo.json. The inventory comes from cg_matching.propose_plans (via the adapter) on the
ground-truth export; titles and descriptions are templated (--fake-muse). The demo plans (hero, nudge,
one more featured) are curated so the stage demo is reproducible, and checked against Maya's filters."""

from __future__ import annotations

import random
from collections import Counter
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from cg_sim import matching_adapter
from cg_sim.contracts import params
from cg_sim.seed import maya
from cg_sim.seed.geo import neighborhood, point_near
from cg_sim.seed.venues import is_open

TZ = ZoneInfo("America/Los_Angeles")
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
# Demo day is 2026-11-13 (local). Plans start >= minLeadHours after its start (local midnight).
HORIZON_START = datetime(2026, 11, 13, 0, 0, tzinfo=TZ).astimezone(UTC)
TITLE_MAX = 60

TITLES = {
    "coffee": "Coffee and good conversation",
    "walk": "Easy walk and talk",
    "hike": "Trail hike, all paces welcome",
    "climbing_session": "Bouldering session, all levels",
    "run": "Social run, no one gets dropped",
    "pickup_sport": "Pickup game, just show up",
    "board_game_night": "Board game night",
    "video_game_session": "Co-op video game session",
    "trivia_night": "Trivia night team-up",
    "concert": "Live music night",
    "museum_visit": "Museum wander",
    "film_screening": "Movie night out",
    "cooking_together": "Cook a meal together",
    "food_crawl": "Snack crawl",
    "brunch": "Weekend brunch",
    "craft_session": "Make something together",
    "ceramics_studio": "Clay night drop-in",
    "photo_walk": "Photo walk",
    "book_club": "Book chat, no homework",
    "language_exchange": "Language exchange hangout",
    "volunteering": "Volunteer shift together",
    "farmers_market": "Farmers market stroll",
    "yoga_class": "Yoga class, then tea",
    "beach_day": "Beach afternoon",
    "picnic": "Picnic in the park",
    "karaoke": "Karaoke, zero judgment",
    "dance_class": "Beginner dance class",
    "hackathon_or_cowork": "Cowork and build session",
    "bike_ride": "Easy group ride",
    "comedy_show": "Comedy show night",
    "lunch": "Long lunch",
}


VIBES = {
    "coffee": "Grab a drink, find a corner table and see where the conversation goes.",
    "walk": "A relaxed stroll at chatting pace. Come as you are.",
    "hike": "A scenic trail at a friendly pace, with breaks for views and snacks.",
    "climbing_session": "Try a few problems, cheer each other on, no experience needed.",
    "run": "An easy-pace loop with a regroup at the end. Nobody gets left behind.",
    "pickup_sport": "Casual games, mixed levels, rotating teams. Just show up.",
    "board_game_night": "Learn a new game or bring a favorite. Teaching is part of the fun.",
    "video_game_session": "Co-op rounds on shared screens. Controllers and snacks provided.",
    "trivia_night": "Team up with strangers, argue over answers, split the bragging rights.",
    "concert": "Live music, a good spot near the stage, and someone to compare favorites with.",
    "museum_visit": "Wander the galleries together and trade takes over coffee after.",
    "film_screening": "Settle in for a good movie, then swap opinions on the way out.",
    "cooking_together": "Everyone chops, stirs and tastes, then you eat what you made.",
    "food_crawl": "Small bites at a few stops. Come hungry and share everything.",
    "brunch": "A slow, sunny table with good food and no rush to leave.",
    "craft_session": "Hands-on making with all supplies set out. Leave with something you made.",
    "ceramics_studio": "Get your hands in the clay at your own pace. Beginners welcome.",
    "photo_walk": "Slow wander looking for good light and odd corners. Phone cameras count.",
    "book_club": "Talk about what you're reading, no homework required.",
    "language_exchange": "Chat in two languages and help each other along. All levels.",
    "volunteering": "A friendly shift doing useful work next to new people.",
    "farmers_market": "Browse the stalls, taste things, and pick up something fresh.",
    "yoga_class": "A gentle class followed by tea. All levels.",
    "beach_day": "Sand, sun and easy conversation. Bring a layer for the wind.",
    "picnic": "Spread a blanket on the grass and share whatever people bring.",
    "karaoke": "Pick a song or just cheer. Zero judgment, loud singalongs.",
    "dance_class": "Learn the basics together and laugh at the missteps. No partner needed.",
    "hackathon_or_cowork": "Heads-down time next to other builders, with a chat break in the middle.",
    "bike_ride": "A mellow group ride with stops along the way. Easy on the hills.",
    "comedy_show": "Catch a live set together and compare favorite bits afterward.",
    "lunch": "An unhurried lunch with good company.",
}


def _local(y, m, d, hh, mm=0) -> datetime:
    return datetime(y, m, d, hh, mm, tzinfo=TZ).astimezone(UTC)


def _parse(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)


def local_slot(starts: datetime) -> tuple[str, str]:
    lt = starts.astimezone(TZ)
    part = "morning" if lt.hour < 12 else "afternoon" if lt.hour < 17 else "evening"
    return DAYS[lt.weekday()], part


def venue_open(venue: dict, starts: datetime, ends: datetime) -> bool:
    a, b = starts.astimezone(TZ), ends.astimezone(TZ)
    if a.date() != b.date():
        return False
    return is_open(venue, DAYS[a.weekday()], a.strftime("%H:%M"), b.strftime("%H:%M"))


def _title(at: str, venue: dict) -> str:
    base = TITLES.get(at, at.replace("_", " ").capitalize())
    full = f"{base} at {venue['name']}"
    return full if len(full) <= TITLE_MAX else base[:TITLE_MAX]


def _description(at: str) -> str:
    return VIBES.get(at, "A relaxed get-together with people who share your interests.")


def maya_problems(plan: dict, venue: dict, home: dict, p: dict | None = None) -> list[str]:
    """Maya's hard filters for a featured plan: free in her fallback calendar (with buffer), travel
    under her max, targets her interests, not sensitive."""
    p = p or params()
    out = []
    starts, ends = _parse(plan["startsAt"]), _parse(plan["endsAt"])
    buf = timedelta(minutes=p["calendar"]["minFreeBufferMin"])
    for a, b in maya.busy_blocks(datetime(2026, 11, 11, 20, tzinfo=UTC), p["calendar"]["horizonDays"]):
        if a < ends + buf and starts - buf < b:
            out.append(f"{plan['planId']} overlaps Maya's busy block {a:%a %H:%M}Z")
            break
    best = min(matching_adapter.travel_minutes(home, venue["location"], m, p) for m in maya.TRAVEL["modes"])
    if best > maya.TRAVEL["maxMinutes"]:
        out.append(f"{plan['planId']} is {best} min away for Maya (max {maya.TRAVEL['maxMinutes']})")
    maya_l2 = {".".join(k.split(".")[:2]) for k in maya.GROUND_TRUTH}
    if not set(plan["targetInterestIds"]) & maya_l2:
        out.append(f"{plan['planId']} targets none of Maya's interests")
    if venue.get("sensitive"):
        out.append(f"{plan['planId']} is at a sensitive venue")
    return out


def maya_home(pool_id: str, mode: str, personas: list[dict], fake_location: dict) -> dict:
    for row in personas:
        if row["userId"] == maya.MAYA_ID:
            return row["homeLocation"]
    return fake_location


def _plan(pid, pool_id, at, venue, starts, ends, size, targets, scene, origin, joins, title=None) -> dict:
    row = {
        "planId": pid,
        "poolId": pool_id,
        "title": title or _title(at, venue),
        "description": _description(at),
        "activityType": at,
        "venueId": venue["venueId"],
        "startsAt": starts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "endsAt": ends.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "size": size,
        "cost": dict(venue["booking"]["cost"]),
        "targetInterestIds": targets,
        "sceneId": scene,
        "origin": origin,
    }
    if joins:
        row["seedJoinIds"] = joins
    return row


def build(pool_id, mode, rng: random.Random, export, venues, people, personas, scene_of, pdef, iso):
    p = params()
    by_id = {v["venueId"]: v for v in venues}
    roles = {}
    for person in people:
        roles.setdefault(person.role, []).append(person)
    live, private, hero_join = roles["live"][0], roles["private"][0], roles["hero_join"][0]
    others = [x.user_id for x in roles.get("counterpart", [])]

    start = HORIZON_START + timedelta(hours=p["plans"]["minLeadHours"])
    end = HORIZON_START + timedelta(days=p["plans"]["horizonDays"])
    if pdef.get("window"):
        end = min(end, _parse(pdef["window"]["end"]))

    # Curated demo plans.
    if mode == "city":
        prefix = "pl_sf"
        hero = _plan(f"{prefix}_hero_wheel", pool_id, "ceramics_studio", by_id["vn_clay_hour"],
                     _local(2026, 11, 14, 10), _local(2026, 11, 14, 12), {"min": 3, "max": 5},
                     ["arts_crafts.ceramics"], None, "seed", [private.user_id, hero_join.user_id],
                     title="Saturday wheel-throwing drop-in")
        # a table for 4: three pre-joined, Maya makes four; pay at the venue, so no approval
        nudge = _plan(f"{prefix}_little_fern_table", pool_id, "food_crawl", by_id[maya.FREQUENT_VENUE],
                      _local(2026, 11, 15, 19), _local(2026, 11, 15, 20, 30), {"min": 4, "max": 4},
                      ["food_drink.eating_out"], None, "signal", [others[0], others[1], hero_join.user_id],
                      title="Sunday small plates at Little Fern Kitchen")
    else:
        prefix = "pl_evt"
        hero = _plan(f"{prefix}_hero_lunch_walk", pool_id, "lunch", by_id["vn_bayside_commons"],
                     _local(2026, 11, 14, 11), _local(2026, 11, 14, 12, 30), {"min": 3, "max": 5},
                     ["tech_career.building"], None, "seed", [private.user_id, hero_join.user_id],
                     title="Lunch walk with other solo hackers")
        nudge = _plan(f"{prefix}_bayfront_walk", pool_id, "walk", by_id["vn_bedwell_bayfront"],
                      _local(2026, 11, 15, 9), _local(2026, 11, 15, 10, 30), {"min": 3, "max": 6},
                      ["outdoors.hiking"], None, "signal", [others[0]],
                      title="Sunday morning bay trail walk")
    game_cafe = next(v for v in venues if v["kind"] == "game_cafe")
    third = _plan(f"{prefix}_wed_game_night", pool_id, "board_game_night", game_cafe,
                  _local(2026, 11, 18, 18, 30), _local(2026, 11, 18, 21), {"min": 3, "max": 6},
                  ["games.board_games"], None, "seed", [others[1]])
    curated = [hero, nudge, third]
    for c in curated:  # Leiden scene of the pre-joined members (first joiner's on a tie)
        c["sceneId"] = next((sc for sc, _ in Counter(scene_of[u] for u in c["seedJoinIds"] if u in scene_of)
                             .most_common(1)), None)

    # Proposed inventory.
    members: dict[str, list] = {}
    for person in people:
        members.setdefault(scene_of.get(person.user_id), []).append(person)
    proposed = []
    for raw in matching_adapter.propose_plans(export, venues, scene_of, p, rng, HORIZON_START):
        v = by_id.get(raw["venueId"])
        starts, ends = _parse(raw["startsAt"]), _parse(raw["endsAt"])
        if not v or v.get("sensitive") or raw["activityType"] not in v["activityTypes"]:
            continue
        if starts < start or ends > end or not venue_open(v, starts, ends):
            continue
        targets = sorted({".".join(t.split(".")[:2]) for t in raw["targetInterestIds"]})
        day, part = local_slot(starts)
        size = raw["size"]
        cands = [x.user_id for x in members.get(raw.get("sceneId"), [])
                 if {"day": day, "part": part} in x.slots and x.user_id != live.user_id]
        k = min(rng.choice([0, 0, 1, 1, 2]), size["min"] - 1, len(cands))
        joins = sorted(rng.sample(cands, k)) if k else []
        proposed.append(_plan(raw["planId"], pool_id, raw["activityType"], v, starts, ends, size, targets,
                              raw.get("sceneId"), raw.get("origin") or "seed", joins))

    if mode == "city":
        _, lat, lng, _, spread = neighborhood(maya.MAYA_HOOD)
        fake = point_near(rng, lat, lng, spread / 2)
    else:
        c = pdef["center"]
        fake = point_near(rng, c["lat"], c["lng"], 150)
    home = maya_home(pool_id, mode, personas, fake)
    extra = [x for x in proposed if not maya_problems(x, by_id[x["venueId"]], home, p)
             and x["activityType"] not in {c["activityType"] for c in curated}]
    featured = [hero["planId"], nudge["planId"], third["planId"]] + [x["planId"] for x in extra[:2]]
    demo = {
        "poolId": pool_id,
        "mayaId": maya.MAYA_ID,
        "featuredPlanIds": featured,
        "heroPlanId": hero["planId"],
        "nudgePlanId": nudge["planId"],
        "liveUserId": live.user_id,
        "counterpartIds": [live.user_id, private.user_id, hero_join.user_id] + others,
        "privateCounterpartId": private.user_id,
        "fakeLocation": fake,
    }
    return curated + proposed, demo
