"""A tiny hand-built world: Maya, four others, two venues, three plans. Fixed clock."""

from datetime import UTC, datetime

import pytest

from cg_api.domain import stubs
from cg_api.domain.world import World, load_params, load_taxonomy
from cg_api.settings import get_settings

CONTRACTS = get_settings().contracts_dir
NOW = datetime(2026, 11, 12, 18, 0, tzinfo=UTC)


def interests(*ids, hidden=(), sensitive=()):
    return [
        {
            "id": i,
            "weight": 0.8,
            "visibility": "hidden" if i in hidden else "shown",
            "sensitive": i in sensitive,
        }
        for i in (*ids, *hidden)
    ]


def person(uid, name, hood="Inner Sunset", lat=37.76, lng=-122.46, private=False):
    return {
        "userId": uid,
        "displayName": name,
        "firstName": name.split()[0],
        "initials": "".join(p[0] for p in name.split()),
        "avatar": f"avatars/{uid}.png",
        "profileVisibility": "private" if private else "public",
        "homeLocation": {"lat": lat, "lng": lng},
        "neighborhood": hood,
        "groupSize": {"min": 3, "max": 5},
        "travel": {"maxMinutes": 40, "modes": ["transit", "walk"]},
        "bio": f"{name} bio",
    }


SECRET_SIGNAL = "SECRET clinic visits"


@pytest.fixture
def world():
    return make_world(stubs)


def make_world(match):
    w = World(
        match=match,
        on_formed=lambda w, mt: None,  # agent runs are tested on their own (test_runner.py)
        on_decided=lambda w, a: None,
        on_approval=lambda w, a: None,
        params=load_params(CONTRACTS / "params.yaml"),
        taxonomy=load_taxonomy(CONTRACTS / "taxonomy.yaml"),
        demo={"mayaId": "u_maya", "featuredPlanIds": ["pl_walk", "pl_hero"]},
        now=lambda: NOW,
    )
    w.add_user(
        person("u_maya", "Maya Chen"),
        optedIn=True,
        interests=interests(
            "arts_crafts.ceramics.wheel_throwing",
            "outdoors.hiking.coastal_hikes",
            "games.board_games.strategy_games",
            hidden=("music.listening.jazz",),
        ),
        signals=[
            {
                "signalId": "si_0001",
                "provider": "google_maps",
                "kind": "frequent_place",
                "label": "You've walked Lands End 4 times this month",
                "interestIds": ["outdoors.hiking"],
                "venueId": "vn_trail",
                "visibility": "shown",
                "sensitive": False,
                "strength": 0.8,
            },
            {
                "signalId": "si_0002",
                "provider": "google_maps",
                "kind": "frequent_place",
                "label": SECRET_SIGNAL,
                "interestIds": ["health_support.support_communities"],
                "venueId": "vn_trail",
                "visibility": "hidden",
                "sensitive": True,
                "strength": 0.9,
            },
        ],
        busy=[{"start": "2026-11-19T02:00:00Z", "end": "2026-11-19T04:00:00Z"}],
    )
    w.add_user(
        person("u_dan", "Daniel Okafor", hood="Hayes Valley", lat=37.776, lng=-122.424),
        optedIn=True,
        interests=interests(
            "arts_crafts.ceramics.wheel_throwing",
            "outdoors.hiking.coastal_hikes",
            "music.listening.jazz",
            "identity_values.faith.buddhism",
            sensitive=("identity_values.faith.buddhism",),
        ),
    )
    w.add_user(
        person("u_rosa", "Rosa Diaz", private=True),
        optedIn=True,
        interests=interests(
            "arts_crafts.ceramics.wheel_throwing",
            "games.board_games.party_games",
            "music.playing_music.drums",
        ),
    )
    w.add_user(
        person("u_kai", "Kai Lee"),
        optedIn=True,
        interests=interests("arts_crafts.ceramics.glazing"),
    )
    w.add_user(
        person("u_zed", "Zed Park"),
        optedIn=True,
        interests=interests("arts_crafts.ceramics.handbuilding"),
    )
    w.venues["vn_clay"] = {
        "venueId": "vn_clay",
        "name": "Clay Hour Studio",
        "neighborhood": "Hayes Valley",
        "address": "Hayes St",
        "location": {"lat": 37.7765, "lng": -122.4241},
        "kind": "studio",
        "activityTypes": ["ceramics_studio"],
        "booking": {
            "kind": "class",
            "cost": {"kind": "prepaid", "perPersonCents": 3500, "currency": "USD"},
            "capacityPerSlot": 5,
            "payAtVenueAllowed": True,
        },
    }
    w.venues["vn_trail"] = {
        "venueId": "vn_trail",
        "name": "Lands End Trail",
        "neighborhood": "Outer Richmond",
        "address": "680 Point Lobos Ave",
        "location": {"lat": 37.7804, "lng": -122.511},
        "kind": "trail",
        "activityTypes": ["walk"],
        "booking": {
            "kind": "none",
            "cost": {"kind": "free", "perPersonCents": 0, "currency": "USD"},
            "capacityPerSlot": 40,
            "payAtVenueAllowed": False,
        },
    }
    base = {"poolId": "pool_sf_city", "description": "d", "origin": "seed"}
    prepaid = {"kind": "prepaid", "perPersonCents": 3500, "currency": "USD"}
    w.add_plan(
        {
            **base,
            "planId": "pl_hero",
            "title": "Saturday wheel-throwing drop-in",
            "activityType": "ceramics_studio",
            "venueId": "vn_clay",
            "startsAt": "2026-11-14T18:00:00Z",
            "endsAt": "2026-11-14T20:00:00Z",
            "size": {"min": 3, "max": 5},
            "cost": prepaid,
            "targetInterestIds": ["arts_crafts.ceramics"],
            "seedJoinIds": ["u_dan", "u_rosa"],
            "createdAt": "2026-11-12T10:00:00Z",
        }
    )
    w.add_plan(
        {
            **base,
            "planId": "pl_hero2",
            "title": "Sunday wheel-throwing",
            "activityType": "ceramics_studio",
            "venueId": "vn_clay",
            "startsAt": "2026-11-15T22:00:00Z",
            "endsAt": "2026-11-16T00:00:00Z",
            "size": {"min": 3, "max": 5},
            "cost": prepaid,
            "targetInterestIds": ["arts_crafts.ceramics"],
        }
    )
    w.add_plan(
        {
            **base,
            "planId": "pl_walk",
            "title": "Sunday coastal walk",
            "activityType": "walk",
            "venueId": "vn_trail",
            "origin": "signal",
            "startsAt": "2026-11-15T17:00:00Z",
            "endsAt": "2026-11-15T18:30:00Z",
            "size": {"min": 3, "max": 6},
            "cost": {"kind": "free", "perPersonCents": 0, "currency": "USD"},
            "targetInterestIds": ["outdoors.hiking"],
        }
    )
    return w
