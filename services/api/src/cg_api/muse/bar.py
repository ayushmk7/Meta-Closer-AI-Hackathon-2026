"""The Muse bar's understanding step (PRD-2 §3.4 askMuse): text -> filter over the viewer's ranked PlanCards.

Muse (low effort, structured output) when live; otherwise keyword matching on activity types and taxonomy labels
with templated replies. A pasted Google Maps link is parsed locally and never fetched (P10).
"""

from __future__ import annotations

import json
import math
import re
from datetime import timedelta
from pathlib import Path
from urllib.parse import unquote_plus

from cg_api.laya import load_questions
from cg_api.muse import Unavailable
from cg_api.muse.copy import TZ, local, on_day
from cg_api.muse.extract import taxonomy

DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
PARTS = {"morning": (5, 12), "afternoon": (12, 17), "evening": (17, 24), "tonight": (17, 24), "night": (17, 24)}
TYPE_WORDS = {
    "climb": "climbing_session",
    "boulder": "climbing_session",
    "pottery": "ceramics_studio",
    "clay": "ceramics_studio",
    "ceramic": "ceramics_studio",
    "wheel": "ceramics_studio",
    "board game": "board_game_night",
    "game night": "board_game_night",
    "video game": "video_game_session",
    "movie": "film_screening",
    "film": "film_screening",
    "music": "concert",
    "gig": "concert",
    "show": "concert",
    "cook": "cooking_together",
    "food": "food_crawl",
    "eat": "food_crawl",
    "craft": "craft_session",
    "photo": "photo_walk",
    "book": "book_club",
    "museum": "museum_visit",
    "market": "farmers_market",
    "beach": "beach_day",
    "bike": "bike_ride",
    "ride": "bike_ride",
    "dance": "dance_class",
    "yoga": "yoga_class",
    "cowork": "hackathon_or_cowork",
    "hackathon": "hackathon_or_cowork",
    "comedy": "comedy_show",
    "jog": "run",
    "volunteer": "volunteering",
    "trivia": "trivia_night",
    "coastal": "walk",
    "stroll": "walk",
}
FOLLOW_UPS = [
    "Something Sunday afternoon",
    "Board games this week",
    "A coastal walk",
    "Climb this weekend",
    "Coffee tomorrow morning",
]
_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["activityTypes", "interestIds", "days", "part", "maxMinutes", "maxCents", "groupSize", "reply"],
    "properties": {
        "activityTypes": {"type": "array", "items": {"type": "string"}},
        "interestIds": {"type": "array", "items": {"type": "string"}},
        "days": {"type": "array", "items": {"type": "string", "description": "YYYY-MM-DD, local"}},
        "part": {"type": ["string", "null"], "enum": ["morning", "afternoon", "evening", None]},
        "maxMinutes": {"type": ["integer", "null"]},
        "maxCents": {"type": ["integer", "null"], "description": "per person; 0 = free"},
        "groupSize": {"type": ["integer", "null"], "description": "people including me"},
        "reply": {"type": "string"},
    },
}


def maps_link(text: str) -> dict | None:
    """{name, lat, lng} from a pasted Google Maps URL, parsed locally (never fetched)."""
    m = re.search(r"https?://\S*google\.[a-z.]+/maps\S*", text)
    if not m:
        return None
    url = m[0]
    name = re.search(r"/place/([^/@?]+)", url)
    at = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url) or re.search(
        r"[?&](?:q|query|destination)=(-?\d+\.\d+)"
        r"(?:,|%2C)(-?\d+\.\d+)",
        url,
    )
    q = re.search(r"[?&](?:q|query)=([^&]+)", url)
    out = {
        "name": unquote_plus(name[1]) if name else (unquote_plus(q[1]) if q and not at else None),
        "lat": float(at[1]) if at else None,
        "lng": float(at[2]) if at else None,
    }
    return out if out["name"] or out["lat"] is not None else None


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def nearest_venue(link: dict, venues: list[dict], max_km: float = 0.5) -> dict | None:
    """By name first (all words of the seeded name appear in the link name), else nearest within max_km."""
    if link.get("name"):
        words = set(re.findall(r"\w+", link["name"].lower()))
        for v in venues:
            if set(re.findall(r"\w+", v["name"].lower())) <= words:
                return v
    if link.get("lat") is None:
        return None
    best = min(
        venues, key=lambda v: km((link["lat"], link["lng"]), (v["location"]["lat"], v["location"]["lng"])), default=None
    )
    if best and km((link["lat"], link["lng"]), (best["location"]["lat"], best["location"]["lng"])) <= max_km:
        return best
    return None


def keyword_filter(text: str, now_iso: str, contracts_dir: Path) -> dict:
    t = f" {text.lower()} "
    types = load_questions(contracts_dir)["activityTypes"]
    found = [a for a in types if re.search(rf"\b{a.replace('_', ' ').removesuffix('_session')}", t)]
    found += [a for w, a in TYPE_WORDS.items() if re.search(rf"\b{w}", t)]
    tax = taxonomy(contracts_dir)
    interests = [
        k
        for k, v in tax.items()
        if v["level"] >= 2
        and not v["sensitive"]
        and re.search(rf"\b{re.escape(v['label'].lower().removesuffix('s'))}", t)
    ]
    today = local(now_iso).date()
    days: list = []
    if "today" in t or "tonight" in t:
        days = [today]
    elif "tomorrow" in t:
        days = [today + timedelta(1)]
    elif "weekend" in t:
        # this weekend's Saturday (yesterday on a Sunday); on Sunday "this weekend" is just today
        sat = today - timedelta(1) if today.weekday() == 6 else today + timedelta((5 - today.weekday()) % 7)
        if "next weekend" in t:
            days = [sat + timedelta(7), sat + timedelta(8)]
        else:
            days = [today] if today.weekday() == 6 else [sat, sat + timedelta(1)]
    elif "this week" in t:
        days = [today + timedelta(i) for i in range(7 - today.weekday())]
    else:
        for i, name in enumerate(DAYS):
            if re.search(rf"\b{name}|\b{name[:3]}\b", t):
                days.append(today + timedelta((i - today.weekday()) % 7))
    part = next((p for p in PARTS if re.search(rf"\b{p}", t)), None)
    mins = re.search(r"(\d+)\s*(?:min|minutes)", t)
    price = re.search(r"(?:under|less than|below|max|up to)\s*\$\s*(\d+)|\$\s*(\d+)\s*(?:or less|max)", t)
    if re.search(r"\bfree\b", t):
        max_cents = 0
    elif price:
        max_cents = int(price[1] or price[2]) * 100
    else:  # ponytail: "cheap" means $20 or less, a guess until Muse sets it
        max_cents = 2000 if re.search(r"\b(cheap|budget|inexpensive)\b", t) else None
    size = re.search(r"\b(?:group of|party of)\s*(\d{1,2})\b|\b(\d{1,2})\s*(people|of us|friends)\b", t)
    group = None
    if size:  # "me and 2 friends" is a group of 3
        group = int(size[1] or size[2]) + (1 if size[3] == "friends" else 0)
    elif re.search(r"\bsmall group\b", t):
        group = 4
    return {
        "maxCents": max_cents,
        "groupSize": group,
        "activityTypes": list(dict.fromkeys(found)),
        "interestIds": interests,
        "days": [d.isoformat() for d in days],
        "part": "evening" if part in ("tonight", "night") else part,
        "maxMinutes": int(mins[1]) if mins else None,
        "link": maps_link(text),
    }


def apply(cards: list[dict], f: dict, venue_id: str | None = None) -> list[dict]:
    """Keep ranked order; every given constraint must hold."""
    out = []
    for c in cards:
        start = local(c["startsAt"])
        if venue_id and c["venue"]["venueId"] != venue_id:
            continue
        if f["activityTypes"] and c["activityType"] not in f["activityTypes"]:
            continue
        if not f["activityTypes"] and f["interestIds"]:
            shared = {s["interest"]["id"] for s in (c.get("crowd") or {}).get("sharedWithYou", [])}
            blob = f"{c['title']} {c.get('reason', '')}".lower()
            if not any(i in shared or i.split(".")[-1].replace("_", " ") in blob for i in f["interestIds"]):
                continue
        if f["days"] and start.date().isoformat() not in f["days"]:
            continue
        if f["part"] and not PARTS[f["part"]][0] <= start.hour < PARTS[f["part"]][1]:
            continue
        if f["maxMinutes"] and (c.get("travel") or {}).get("minutes", 0) > f["maxMinutes"]:
            continue
        if f.get("maxCents") is not None and c["cost"]["perPersonCents"] > f["maxCents"]:
            continue
        if f.get("groupSize") and not c["size"]["min"] <= f["groupSize"] <= c["size"]["max"]:
            continue
        out.append(c)
    return out


RELAX = ("venue", "groupSize", "maxCents", "part", "days", "maxMinutes")  # dropped in this order; activity stays


def best(cards: list[dict], f: dict, venue_id: str | None) -> tuple[list[dict], bool]:
    """(plans, relaxed): every constraint first, then drop the least important ones until something fits."""
    f = dict(f)
    hit = apply(cards, f, venue_id)
    if hit:
        return hit, False
    for k in RELAX:
        if k == "venue":
            venue_id = None
        else:
            f[k] = None if k != "days" else []
        hit = apply(cards, f, venue_id)
        if hit:
            return hit, True
    return [], False


def venue_in_text(text: str, venues: list[dict]) -> dict | None:
    """A seeded venue named in the text (all its name words appear), longest name first. E.g. a share's promptText."""
    words = set(re.findall(r"\w+", text.lower()))
    named = [v for v in venues if set(re.findall(r"\w+", v["name"].lower())) <= words]
    return max(named, key=lambda v: len(v["name"]), default=None)


def reply(plans: list[dict], f: dict, relaxed: bool = False) -> str:
    if not plans:
        return "I couldn't find a plan for that yet. Try another day, or ask me for something close to it."
    if relaxed:
        n = len(plans)
        return f"I couldn't find exactly that, so here {'is the closest plan' if n == 1 else f'are the {n} closest'}."
    if not any(
        f.get(k) is not None and f.get(k) != []
        for k in ("activityTypes", "interestIds", "days", "part", "maxMinutes", "maxCents", "groupSize", "link")
    ):
        return "Here's what's coming up near you."
    first = plans[0]
    if len(plans) == 1:
        return f"I found one that fits: {first['title']}{on_day(first['title'], first['startsAt'])}."
    count = (first.get("crowd") or {}).get("interestedCount", 0)
    tail = f" {first['title']} already has {count} people in." if count >= 2 else ""
    return f"I found {len(plans)} plans that fit.{tail}"


def follow_ups(text: str) -> list[str]:
    return [p for p in FOLLOW_UPS if p.lower() not in text.lower()][:3]


async def understand(
    muse, text: str, history: list[dict], now_iso: str, contracts_dir: Path
) -> tuple[dict, str | None]:
    """(filter, Muse's reply or None). Falls back to keywords on any Muse failure or an invalid answer."""
    fb = keyword_filter(text, now_iso, contracts_dir)
    types = set(load_questions(contracts_dir)["activityTypes"])
    tax = taxonomy(contracts_dir)
    now = local(now_iso)
    try:
        r = await muse.respond(
            "bar",
            [
                {
                    "role": "system",
                    "content": "You are Muse in the Common Ground Plans tab. Turn the request into a "
                    "filter over plans. Reply in 1 or 2 short first-person sentences, no emoji. Local time now: "
                    f"{now.strftime('%A %Y-%m-%d %H:%M')} ({TZ.key}). Activity types: {sorted(types)}.",
                },
                *history[-6:],
                {"role": "user", "content": text},
            ],
            schema=_SCHEMA,
        )
        j = r["json"]
        f = {
            "activityTypes": [a for a in j["activityTypes"] if a in types],
            "interestIds": [i for i in j["interestIds"] if i in tax and not tax[i]["sensitive"]],
            "days": [d for d in j["days"] if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d)],
            "part": j["part"] if j["part"] in PARTS else None,
            "maxMinutes": j["maxMinutes"],
            "maxCents": j["maxCents"] if isinstance(j["maxCents"], int) and j["maxCents"] >= 0 else None,
            "groupSize": j["groupSize"] if isinstance(j["groupSize"], int) and 1 < j["groupSize"] <= 20 else None,
            "link": fb["link"],
        }
        return f, (j["reply"].strip() or None)
    except (Unavailable, KeyError, TypeError, json.JSONDecodeError):
        return fb, None
