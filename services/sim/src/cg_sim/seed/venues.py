"""venues.jsonl: real public places (real names, approximate public coordinates, no booking) plus
fictional bookable businesses in real neighborhoods (invented names, prices and inventory, always
simulated), plus a few sensitive places that connector records reference and plans never use."""

from __future__ import annotations

import random

from cg_sim.seed.geo import neighborhood, point_near

USD = "USD"
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _cost(kind: str, cents: int) -> dict:
    return {"kind": kind, "perPersonCents": cents, "currency": USD}


def _free() -> dict:
    return {"kind": "none", "cost": _cost("free", 0), "capacityPerSlot": 40, "payAtVenueAllowed": False}


def _hours(open_: str, close: str, days: list[str] = DAYS) -> list[dict]:
    return [{"day": d, "open": open_, "close": close} for d in days]


# (venueId, name, neighborhood, address, lat, lng, kind, activityTypes, booking, hours)
CITY_PUBLIC = [
    ("vn_lands_end", "Lands End Trail", "Outer Richmond", "680 Point Lobos Ave", 37.7804, -122.5110, "trail", ["walk", "hike", "photo_walk"], None, None),
    ("vn_ocean_beach", "Ocean Beach", "Outer Sunset", "Great Highway at Judah St", 37.7604, -122.5107, "beach", ["beach_day", "walk", "run", "picnic"], None, None),
    ("vn_dolores_park", "Mission Dolores Park", "Mission", "19th St & Dolores St", 37.7596, -122.4269, "park", ["picnic", "walk", "pickup_sport", "yoga_class"], None, None),
    ("vn_stow_lake", "Stow Lake, Golden Gate Park", "Inner Sunset", "50 Stow Lake Dr", 37.7684, -122.4752, "park", ["walk", "run", "picnic", "bike_ride", "photo_walk"], None, None),
    ("vn_crissy_field", "Crissy Field", "Marina", "1199 E Beach", 37.8039, -122.4645, "park", ["walk", "run", "beach_day", "bike_ride", "picnic"], None, None),
    ("vn_twin_peaks", "Twin Peaks", "Twin Peaks", "501 Twin Peaks Blvd", 37.7544, -122.4477, "trail", ["hike", "walk", "photo_walk"], None, None),
    ("vn_mount_sutro", "Mount Sutro Open Space Reserve", "Cole Valley", "Medical Center Way", 37.7583, -122.4580, "trail", ["hike", "walk", "run"], None, None),
    ("vn_bernal_hill", "Bernal Heights Park", "Bernal Heights", "Bernal Heights Blvd", 37.7432, -122.4142, "park", ["walk", "hike", "photo_walk"], None, None),
    ("vn_batteries_bluffs", "Batteries to Bluffs Trail, Presidio", "Presidio", "Lincoln Blvd", 37.7948, -122.4835, "trail", ["hike", "walk", "photo_walk"], None, None),
    ("vn_glen_canyon", "Glen Canyon Park", "Glen Park", "70 Elk St", 37.7397, -122.4416, "park", ["hike", "walk", "pickup_sport"], None, None),
    ("vn_marina_green", "Marina Green", "Marina", "Marina Blvd", 37.8065, -122.4410, "park", ["run", "picnic", "pickup_sport", "bike_ride"], None, None),
    ("vn_alamo_square", "Alamo Square", "Western Addition", "Steiner St & Hayes St", 37.7764, -122.4346, "park", ["picnic", "walk", "photo_walk"], None, None),
    ("vn_ggp_panhandle", "The Panhandle", "NoPa", "Fell St & Masonic Ave", 37.7724, -122.4467, "park", ["run", "bike_ride", "walk"], None, None),
    ("vn_ferry_market", "Ferry Plaza Farmers Market", "Embarcadero", "1 Ferry Building", 37.7955, -122.3937, "market", ["farmers_market", "food_crawl", "coffee"], None, _hours("08:00", "14:00", ["tue", "thu", "sat"])),
    ("vn_alemany_market", "Alemany Farmers Market", "Bernal Heights", "100 Alemany Blvd", 37.7375, -122.4126, "market", ["farmers_market", "food_crawl"], None, _hours("06:00", "14:00", ["sat"])),
    ("vn_heart_city_market", "Heart of the City Farmers Market", "Civic Center", "1182 Market St", 37.7799, -122.4146, "market", ["farmers_market", "lunch"], None, _hours("07:00", "17:00", ["wed", "sun"])),
    ("vn_main_library", "San Francisco Main Library", "Civic Center", "100 Larkin St", 37.7790, -122.4157, "library", ["book_club", "language_exchange", "hackathon_or_cowork"], None, _hours("10:00", "20:00", ["mon", "tue", "wed", "thu"]) + _hours("12:00", "18:00", ["fri", "sat", "sun"])),
    ("vn_mission_library", "Mission Branch Library", "Mission", "300 Bartlett St", 37.7570, -122.4185, "library", ["book_club", "language_exchange"], None, _hours("10:00", "18:00", ["mon", "tue", "wed", "thu", "fri", "sat"])),
    ("vn_sunset_library", "Sunset Branch Library", "Outer Sunset", "1305 18th Ave", 37.7581, -122.4762, "library", ["book_club", "language_exchange"], None, _hours("10:00", "18:00", ["tue", "wed", "thu", "fri", "sat"])),
    ("vn_de_young", "de Young Museum", "Inner Richmond", "50 Hagiwara Tea Garden Dr", 37.7715, -122.4686, "museum", ["museum_visit"], ("ticket", "pay_at_venue", 2000, 30), _hours("09:30", "17:15", ["tue", "wed", "thu", "fri", "sat", "sun"])),
    ("vn_cal_academy", "California Academy of Sciences", "Inner Sunset", "55 Music Concourse Dr", 37.7699, -122.4661, "museum", ["museum_visit"], ("ticket", "prepaid", 4000, 30), _hours("09:30", "17:00")),
    ("vn_sfmoma", "SFMOMA", "SoMa", "151 3rd St", 37.7857, -122.4011, "museum", ["museum_visit"], ("ticket", "pay_at_venue", 3000, 30), _hours("10:00", "17:00", ["mon", "tue", "fri", "sat", "sun"]) + _hours("13:00", "20:00", ["thu"])),
    ("vn_exploratorium", "Exploratorium", "Embarcadero", "Pier 15", 37.8017, -122.3973, "museum", ["museum_visit"], ("ticket", "prepaid", 3500, 30), _hours("10:00", "17:00", ["tue", "wed", "fri", "sat", "sun"]) + _hours("10:00", "22:00", ["thu"])),
    ("vn_asian_art", "Asian Art Museum", "Civic Center", "200 Larkin St", 37.7802, -122.4161, "museum", ["museum_visit"], ("ticket", "pay_at_venue", 2000, 30), _hours("10:00", "17:00", ["fri", "sat", "sun", "mon"]) + _hours("13:00", "20:00", ["thu"])),
    ("vn_legion_honor", "Legion of Honor", "Outer Richmond", "100 34th Ave", 37.7845, -122.5008, "museum", ["museum_visit"], ("ticket", "pay_at_venue", 2000, 30), _hours("09:30", "17:15", ["tue", "wed", "thu", "fri", "sat", "sun"])),
    ("vn_garden_env", "Garden for the Environment", "Inner Sunset", "7th Ave & Lawton St", 37.7577, -122.4636, "community_garden", ["volunteering", "picnic"], ("reservation", "free", 0, 15), _hours("09:00", "13:00", ["wed", "sat", "sun"])),
    ("vn_food_bank", "SF-Marin Food Bank warehouse", "Potrero Hill", "900 Pennsylvania Ave", 37.7550, -122.3930, "community_center", ["volunteering"], ("reservation", "free", 0, 20), _hours("08:30", "17:00", ["mon", "tue", "wed", "thu", "fri", "sat"])),
    ("vn_beach_cleanup", "Baker Beach", "Presidio", "Gibson Rd", 37.7936, -122.4836, "beach", ["beach_day", "volunteering", "walk", "picnic"], None, None),
    ("vn_sunset_rec", "Sunset Recreation Center", "Outer Sunset", "2201 Lawton St", 37.7568, -122.4867, "community_center", ["pickup_sport", "dance_class", "board_game_night"], ("reservation", "free", 0, 24), _hours("09:00", "21:00", ["mon", "tue", "wed", "thu", "fri"]) + _hours("09:00", "17:00", ["sat"])),
    ("vn_potrero_rec", "Potrero Hill Recreation Center", "Potrero Hill", "801 Arkansas St", 37.7577, -122.3982, "community_center", ["pickup_sport", "run"], ("reservation", "free", 0, 24), _hours("09:00", "21:00", ["mon", "tue", "wed", "thu", "fri", "sat"])),
]

EVENT_PUBLIC = [
    ("vn_bedwell_bayfront", "Bedwell Bayfront Park", "Belle Haven", "1600 Marsh Rd", 37.4924, -122.1693, "park", ["walk", "run", "bike_ride", "picnic", "photo_walk"], None, None),
    ("vn_burgess_park", "Burgess Park", "Menlo Park", "701 Laurel St", 37.4486, -122.1795, "park", ["pickup_sport", "picnic", "run"], None, None),
    ("vn_menlo_library", "Menlo Park Library", "Menlo Park", "800 Alma St", 37.4524, -122.1803, "library", ["book_club", "language_exchange", "hackathon_or_cowork"], None, _hours("10:00", "20:00", ["mon", "tue", "wed", "thu"]) + _hours("10:00", "17:00", ["fri", "sat"]) + _hours("13:00", "17:00", ["sun"])),
    ("vn_stanford_dish", "Stanford Dish Trail", "Stanford", "Stanford Ave & Junipero Serra Blvd", 37.4087, -122.1786, "trail", ["hike", "run", "walk"], None, _hours("06:00", "18:00")),
    ("vn_cantor_arts", "Cantor Arts Center", "Stanford", "328 Lomita Dr", 37.4331, -122.1704, "museum", ["museum_visit"], ("ticket", "free", 0, 30), _hours("11:00", "17:00", ["wed", "thu", "fri", "sat", "sun"])),
    ("vn_ravenswood_preserve", "Ravenswood Open Space Preserve", "East Palo Alto", "Bay Rd", 37.4980, -122.1270, "trail", ["walk", "bike_ride", "photo_walk"], None, None),
    ("vn_menlo_market", "Menlo Park Farmers Market", "Menlo Park", "Chestnut St & Santa Cruz Ave", 37.4530, -122.1823, "market", ["farmers_market", "food_crawl", "coffee"], None, _hours("09:00", "13:00", ["sun"])),
    ("vn_holbrook_palmer", "Holbrook-Palmer Park", "Atherton", "150 Watkins Ave", 37.4626, -122.2016, "park", ["picnic", "walk", "yoga_class"], None, _hours("08:00", "18:00")),
    ("vn_baylands_pa", "Palo Alto Baylands Nature Preserve", "Palo Alto", "2775 Embarcadero Rd", 37.4589, -122.1083, "trail", ["walk", "bike_ride", "photo_walk", "run"], None, None),
]

# Fictional bookable businesses: (kind, activityTypes, booking kind, cost kind, cents, capacity, payAtVenue, hours, names)
TEMPLATES = [
    ("cafe", ["coffee", "brunch", "language_exchange", "book_club"], "reservation", "pay_at_venue", 900, 12, True, ("07:00", "17:00"), ["Fogline Coffee", "Little Kettle Cafe", "Ninth Hour Coffee", "Paper Lantern Cafe", "Saltwind Coffee Bar", "Morning Tide Cafe"]),
    ("restaurant", ["brunch", "lunch", "food_crawl"], "reservation", "pay_at_venue", 2400, 10, True, ("10:00", "22:00"), ["Copper Pot Kitchen", "Juniper & Rye", "Nopal Table", "Harbor Noodle House", "Golden Ladle Dim Sum"]),
    ("game_cafe", ["board_game_night", "video_game_session"], "day_pass", "prepaid", 1200, 16, True, ("12:00", "23:00"), ["Meeple Harbor", "Dice & Dumplings", "Critical Hit Game Lounge", "Rook & Pawn Cafe"]),
    ("climbing_gym", ["climbing_session", "yoga_class"], "day_pass", "prepaid", 2800, 20, True, ("06:00", "22:00"), ["Crux Collective", "Basalt Bouldering", "Overhang SF"]),
    ("studio", ["ceramics_studio", "craft_session"], "class", "prepaid", 4000, 8, True, ("10:00", "21:00"), ["Kilnworks Studio", "Slip & Glaze", "Mud Room Ceramics"]),
    ("art_studio", ["craft_session", "photo_walk"], "class", "prepaid", 3000, 10, True, ("11:00", "21:00"), ["Inkwell Print Shop", "Open Easel Studio", "Thread & Needle Workshop"]),
    ("bar", ["trivia_night", "karaoke"], "reservation", "pay_at_venue", 1500, 24, True, ("17:00", "23:59"), ["The Quizzical Owl", "Fog City Taproom", "Lucky Penny Lounge"]),
    ("karaoke_lounge", ["karaoke"], "reservation", "pay_at_venue", 2000, 10, True, ("18:00", "23:59"), ["Echo Box Karaoke", "High Note Rooms"]),
    ("music_venue", ["concert", "comedy_show"], "ticket", "prepaid", 2500, 40, False, ("18:00", "23:59"), ["The Velvet Static", "Lowtide Hall", "Rusty Anchor Comedy Club"]),
    ("cinema", ["film_screening"], "ticket", "prepaid", 1600, 30, False, ("12:00", "23:30"), ["Reel Fog Cinema", "Marquee Microcinema"]),
    ("yoga_studio", ["yoga_class", "dance_class"], "class", "prepaid", 2200, 16, True, ("06:30", "21:00"), ["Still Point Yoga", "Sunroom Movement", "Two Left Feet Dance Studio"]),
    ("cooking_school", ["cooking_together", "food_crawl"], "class", "prepaid", 5500, 10, False, ("11:00", "21:00"), ["Pantry Lab Cooking School", "Salt & Ember Kitchen"]),
    ("cowork", ["hackathon_or_cowork", "coffee"], "day_pass", "prepaid", 1500, 20, True, ("08:00", "22:00"), ["Commonwealth Cowork", "Hackhaus SF", "Byte Loft"]),
    ("bike_shop", ["bike_ride"], "reservation", "free", 0, 15, False, ("08:00", "18:00"), ["Spoke & Spindle Bikes", "Lowgear Cycle Co-op"]),
    ("run_shop", ["run"], "reservation", "free", 0, 25, False, ("07:00", "19:00"), ["Stride Lab Running"]),
]

CITY_BUSINESS_HOODS = [
    "Mission", "Hayes Valley", "Inner Sunset", "Outer Sunset", "Inner Richmond", "Outer Richmond", "SoMa",
    "Noe Valley", "Castro", "Haight-Ashbury", "Lower Haight", "NoPa", "North Beach", "Marina", "Potrero Hill",
    "Dogpatch", "Bernal Heights", "Mission Bay", "Cole Valley", "Russian Hill",
]
EVENT_BUSINESS_HOODS = ["Menlo Park", "Belle Haven", "Redwood City", "East Palo Alto", "Willows"]
STREETS = {
    "city": ["Valencia St", "Divisadero St", "Irving St", "Clement St", "Hayes St", "Folsom St", "24th St", "Haight St", "Columbus Ave", "Chestnut St", "18th St", "Cortland Ave", "Judah St", "Polk St"],
    "event": ["Santa Cruz Ave", "El Camino Real", "Willow Rd", "Broadway", "University Ave", "Middlefield Rd"],
}

# Demo anchors: the hero studio (fictional, Hayes Valley) and the event-pool hero cafe.
HERO_CITY = ("vn_clay_hour", "Clay Hour Studio", "Hayes Valley", "512 Hayes St", 37.7765, -122.4250, "studio", ["ceramics_studio", "craft_session"], ("class", "prepaid", 3500, 8), _hours("09:00", "21:00"))
# The city nudge's restaurant (fictional, Hayes Valley): Maya's frequent dinner spot, reservation, pay there.
NUDGE_CITY = ("vn_little_fern", "Little Fern Kitchen", "Hayes Valley", "418 Hayes St", 37.7768, -122.4236, "restaurant", ["food_crawl", "brunch", "lunch"], ("reservation", "pay_at_venue", 3200, 12), _hours("11:00", "22:00"))
# Demo venue photos: copies of the clone's licensed images (facebook-clone/assets/provenance.md), by venueId.
# Every venue of a demo featuredPlanIds plan has a photo (ux-fable N-P0-3: no empty blue blocks on the demo path).
PHOTOS = {
    "vn_little_fern": "salad.jpg",
    "vn_clay_hour": "pottery.jpg",
    "vn_meeple_harbor": "coffee.jpg",
    "vn_commonwealth_cowork": "workspace.jpg",
    "vn_nopal_table": "weekend-breakfast.jpg",
    "vn_bayside_commons": "cafe.jpg",
    "vn_bedwell_bayfront": "coast-1.jpg",
    "vn_kilnworks_studio": "paintbrushes.jpg",
}
PHOTO_PROVENANCE = """# Venue photo provenance

Each `vn_*.jpg` here is a copy of a Facebook clone image, an Unsplash photo used under the Unsplash
license. Source URL, license and SHA-256 are recorded in `facebook-clone/assets/provenance.md`.
The venues are fictional; the photos are stand-ins and show no real business.

{rows}"""
HERO_EVENT = ("vn_bayside_commons", "Bayside Commons Cafe", "Belle Haven", "1180 Willow Rd", 37.4801, -122.1560, "cafe", ["lunch", "coffee", "walk"], ("reservation", "prepaid", 1400, 12), _hours("08:00", "16:00"))

SENSITIVE_CITY = [
    ("vn_sunset_meditation", "Sunset Meditation Center", "Inner Sunset", "1420 Irving St", 37.7638, -122.4729, "meditation_center", ["yoga_class"]),
    ("vn_hillside_church", "Hillside Community Church", "Noe Valley", "3955 24th St", 37.7513, -122.4321, "place_of_worship", ["volunteering"]),
    ("vn_mission_clinic", "Mission Street Health Clinic", "Mission", "2650 Mission St", 37.7547, -122.4187, "clinic", ["walk"]),
    ("vn_castro_support", "Castro Community Room (support groups)", "Castro", "4100 18th St", 37.7608, -122.4352, "support_group_space", ["book_club"]),
]
SENSITIVE_EVENT = [
    ("vn_menlo_clinic", "Willow Road Health Clinic", "Menlo Park", "795 Willow Rd", 37.4605, -122.1690, "clinic", ["walk"]),
    ("vn_belle_haven_chapel", "Belle Haven Community Chapel", "Belle Haven", "1290 Hollyburne Ave", 37.4790, -122.1612, "place_of_worship", ["volunteering"]),
]


def _record(vid, name, hood, address, lat, lng, kind, types, booking, hours, sensitive=False) -> dict:
    if booking is None:
        b = _free()
    else:
        bkind, ckind, cents, cap = booking
        b = {
            "kind": bkind,
            "cost": _cost(ckind, cents),
            "capacityPerSlot": cap,
            "payAtVenueAllowed": ckind == "prepaid",
        }
    out = {
        "venueId": vid,
        "name": name,
        "neighborhood": hood,
        "address": address,
        "location": {"lat": lat, "lng": lng},
        "kind": kind,
        "activityTypes": types,
    }
    if hours:
        out["hours"] = hours
    out["booking"] = b
    if sensitive:
        out["sensitive"] = True
    return out


def _slug(name: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in name.lower()).strip("_").replace("__", "_")


def build(mode: str, rng: random.Random, total: int) -> list[dict]:
    public = EVENT_PUBLIC if mode == "event" else CITY_PUBLIC
    hero = HERO_EVENT if mode == "event" else HERO_CITY
    sensitive = SENSITIVE_EVENT if mode == "event" else SENSITIVE_CITY
    hoods = EVENT_BUSINESS_HOODS if mode == "event" else CITY_BUSINESS_HOODS
    streets = STREETS[mode]

    out = [_record(*v) for v in public] + [_record(*hero)] + ([] if mode == "event" else [_record(*NUDGE_CITY)])
    used = {v["name"] for v in out}
    n_business = total - len(out) - len(sensitive)
    # Round-robin over templates so every activity type is covered before any repeats.
    picks = [(t, name) for k in range(6) for t in TEMPLATES if k < len(t[8]) for name in [t[8][k]]]
    if mode == "event":
        picks = [p for p in picks if p[0][0] not in ("bike_shop",)]
    for template, name in picks[: max(0, n_business)]:
        kind, types, bkind, ckind, cents, cap, pay_ok, (o, c), _ = template
        if name in used:
            continue
        used.add(name)
        hood = rng.choice(hoods)
        _, lat, lng, _, spread = neighborhood(hood)
        loc = point_near(rng, lat, lng, spread)
        price = int(round(cents * rng.uniform(0.85, 1.2) / 100.0)) * 100 if cents else 0
        out.append(
            {
                "venueId": f"vn_{_slug(name)}",
                "name": name,
                "neighborhood": hood,
                "address": f"{rng.randint(100, 3999)} {rng.choice(streets)}",
                "location": loc,
                "kind": kind,
                "activityTypes": types,
                "hours": _hours(o, c),
                "booking": {
                    "kind": bkind,
                    "cost": _cost(ckind, price),
                    "capacityPerSlot": cap,
                    "payAtVenueAllowed": pay_ok and ckind == "prepaid",
                },
            }
        )
    out += [_record(*v, None, None, sensitive=True) for v in sensitive]
    return out


def is_open(venue: dict, local_day: str, start_hm: str, end_hm: str) -> bool:
    """Absent hours = always open. Times are local 'HH:MM'; plans never cross midnight."""
    if "hours" not in venue:
        return True
    return any(h["day"] == local_day and h["open"] <= start_hm and end_hm <= h["close"] for h in venue["hours"])
