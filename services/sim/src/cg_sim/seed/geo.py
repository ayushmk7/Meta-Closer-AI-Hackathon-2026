"""Neighborhoods and home locations. Real neighborhood names, approximate centroids."""

from __future__ import annotations

import math
import random

# name, lat, lng, weight (residential areas weigh more), spread in metres (smaller near water)
SF_NEIGHBORHOODS: list[tuple[str, float, float, float, float]] = [
    ("Inner Sunset", 37.7602, -122.4664, 4, 350),
    ("Outer Sunset", 37.7550, -122.4935, 5, 450),
    ("Parkside", 37.7420, -122.4880, 2, 400),
    ("Inner Richmond", 37.7801, -122.4645, 4, 350),
    ("Outer Richmond", 37.7775, -122.4930, 4, 400),
    ("Mission", 37.7599, -122.4148, 6, 400),
    ("Noe Valley", 37.7502, -122.4337, 3, 350),
    ("Castro", 37.7609, -122.4350, 3, 300),
    ("Duboce Triangle", 37.7670, -122.4320, 1, 200),
    ("Cole Valley", 37.7650, -122.4500, 1, 200),
    ("Haight-Ashbury", 37.7692, -122.4481, 3, 300),
    ("Lower Haight", 37.7717, -122.4310, 2, 250),
    ("Hayes Valley", 37.7759, -122.4245, 2, 250),
    ("NoPa", 37.7764, -122.4420, 2, 250),
    ("Western Addition", 37.7810, -122.4320, 2, 300),
    ("Lower Pacific Heights", 37.7860, -122.4340, 2, 250),
    ("Pacific Heights", 37.7925, -122.4382, 2, 300),
    ("Marina", 37.8000, -122.4370, 2, 250),
    ("Russian Hill", 37.8000, -122.4194, 2, 250),
    ("North Beach", 37.8015, -122.4103, 2, 250),
    ("Nob Hill", 37.7930, -122.4161, 2, 250),
    ("Tenderloin", 37.7847, -122.4141, 1, 200),
    ("SoMa", 37.7785, -122.4056, 3, 350),
    ("Mission Bay", 37.7706, -122.3916, 2, 250),
    ("Potrero Hill", 37.7605, -122.4009, 2, 300),
    ("Dogpatch", 37.7577, -122.3890, 1, 200),
    ("Bernal Heights", 37.7389, -122.4152, 3, 350),
    ("Glen Park", 37.7338, -122.4337, 1, 250),
    ("Excelsior", 37.7244, -122.4272, 2, 350),
    ("Bayview", 37.7310, -122.3920, 2, 350),
    ("West Portal", 37.7405, -122.4660, 1, 250),
]

# Event pool: attendees staying or living near the venue in modes.yaml.
EVENT_NEIGHBORHOODS: list[tuple[str, float, float, float, float]] = [
    ("Belle Haven", 37.4790, -122.1600, 3, 350),
    ("Menlo Park", 37.4530, -122.1817, 3, 400),
    ("East Palo Alto", 37.4690, -122.1410, 2, 350),
    ("Willows", 37.4600, -122.1630, 2, 300),
    ("Redwood City", 37.4850, -122.2100, 2, 400),
]


def neighborhoods_for(mode: str) -> list[tuple[str, float, float, float, float]]:
    return EVENT_NEIGHBORHOODS if mode == "event" else SF_NEIGHBORHOODS


def neighborhood(name: str) -> tuple[str, float, float, float, float]:
    for row in SF_NEIGHBORHOODS + EVENT_NEIGHBORHOODS:
        if row[0] == name:
            return row
    raise KeyError(name)


def haversine_km(a: dict, b: dict) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (a["lat"], a["lng"], b["lat"], b["lng"]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def point_near(rng: random.Random, lat: float, lng: float, spread_m: float) -> dict:
    """A point around a centroid, clamped to 1.5 x spread so it stays in the neighborhood."""
    while True:
        dx, dy = rng.gauss(0, spread_m / 2), rng.gauss(0, spread_m / 2)
        if math.hypot(dx, dy) <= spread_m * 1.5:
            break
    dlat = dy / 111_320
    dlng = dx / (111_320 * math.cos(math.radians(lat)))
    return {"lat": round(lat + dlat, 5), "lng": round(lng + dlng, 5)}


def sample_home(rng: random.Random, mode: str, name: str | None = None) -> tuple[str, dict]:
    rows = neighborhoods_for(mode)
    row = neighborhood(name) if name else rng.choices(rows, weights=[r[3] for r in rows])[0]
    return row[0], point_near(rng, row[1], row[2], row[4])
