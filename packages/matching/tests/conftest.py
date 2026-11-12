import random
from datetime import UTC, datetime
from pathlib import Path

import pytest

from cg_matching import LayaTables, MatchState, Params, Plan, PoolSnapshot, Venue

PARAMS = Path(__file__).resolve().parents[3] / "contracts" / "params.yaml"
NOW = datetime(2026, 11, 12, 20, 0, tzinfo=UTC)  # Thu 12:00 PT


def user(uid, interests, home=(37.77, -122.42), **kw):
    """interests: {id: weight} (shown, non-sensitive) or {id: dict(weight=.., visibility=.., sensitive=..)}."""
    ints = []
    for iid, w in interests.items():
        d = w if isinstance(w, dict) else {"weight": w}
        ints.append({"id": iid, "visibility": "shown", "sensitive": False} | d)
    return {
        "userId": uid,
        "synthetic": True,
        "profileVisibility": "public",
        "homeLocation": {"lat": home[0], "lng": home[1]},
        "neighborhood": "Mission",
        "ageBand": "22_25",
        "availability": [{"day": "sat", "part": p} for p in ("morning", "afternoon", "evening")],
        "groupSize": {"min": 3, "max": 6},
        "interests": ints,
        "groupOnly": True,
        "connectionIds": [],
        "blockedIds": [],
        "travel": {"maxMinutes": 35, "modes": ["transit"]},
        "busy": [],
        "signals": [],
        "metIds": [],
    } | kw


def export(users, plans=()):
    return {
        "poolId": "pool_test",
        "mode": "city",
        "generatedAt": "2026-11-12T20:00:00Z",
        "taxonomyVersion": 1,
        "questionsVersion": 2,
        "users": users,
        "plans": list(plans),
    }


def venue(vid="vn_clay", types=("ceramics_studio",), loc=(37.776, -122.424), cap=12, **kw):
    return {
        "venueId": vid,
        "name": vid,
        "neighborhood": "Hayes Valley",
        "address": "1 Test St",
        "location": {"lat": loc[0], "lng": loc[1]},
        "kind": "studio",
        "activityTypes": list(types),
        "booking": {
            "kind": "class",
            "cost": {"kind": "prepaid", "perPersonCents": 3500, "currency": "USD"},
            "capacityPerSlot": cap,
            "payAtVenueAllowed": True,
        },
    } | kw


def plan(
    pid="pl_wheel", at="ceramics_studio", vid="vn_clay", targets=("arts_crafts.ceramics",), size=(3, 5), **kw
):
    return {
        "planId": pid,
        "poolId": "pool_test",
        "title": "Wheel",
        "description": "Wheel night",
        "activityType": at,
        "venueId": vid,
        "startsAt": "2026-11-14T18:00:00Z",  # Sat 10:00 PT
        "endsAt": "2026-11-14T20:00:00Z",
        "size": {"min": size[0], "max": size[1]},
        "cost": {"kind": "prepaid", "perPersonCents": 3500, "currency": "USD"},
        "targetInterestIds": list(targets),
        "sceneId": "sc_makers",
        "origin": "seed",
    } | kw


@pytest.fixture
def params():
    return Params.from_yaml(PARAMS)


@pytest.fixture
def ctx(params):
    """Ten makers who like ceramics in varying degrees, plus two hikers."""
    users = [
        user(f"u_{i:04d}", {"arts_crafts.ceramics": 0.5 + i / 40, "food_drink.coffee_tea": 0.4})
        for i in range(10)
    ]
    users += [user(f"u_h{i}", {"outdoors.hiking": 0.9}) for i in range(2)]
    pool = PoolSnapshot.from_export(export(users))
    return {
        "pool": pool,
        "venues": {"vn_clay": Venue.from_record(venue())},
        "plans": [Plan.from_record(plan())],
        "tables": LayaTables(),
        "state": MatchState(),
        "rng": random.Random(7),
    }
