"""connectors.jsonl for synthetic personas: what their connected apps would hand Muse over the 30 days
before REF and the next params.calendar.horizonDays. Consistent with ground truth, with noise."""

from __future__ import annotations

import random
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from cg_sim.matching_adapter import ACTIVITY_INTERESTS

TZ = ZoneInfo("America/Los_Angeles")
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
PART_HOURS = {"morning": ("08:00", "12:00"), "afternoon": ("12:00", "17:00"), "evening": ("17:30", "21:30")}
VISIT_HOURS = {"morning": (8, 11), "afternoon": (12, 16), "evening": (18, 20)}

ARTIST_WORDS_A = ["Velvet", "Paper", "Neon", "Quiet", "Golden", "Static", "Lunar", "Wild", "Hollow", "Coastal", "Midnight", "Copper"]
ARTIST_WORDS_B = ["Harbor", "Echoes", "Gardens", "Machines", "Tides", "Parade", "Satellites", "Foxes", "Lanterns", "Saints", "Ghosts"]
GENRES = {
    "music.listening.indie_rock": "indie rock",
    "music.listening.hip_hop": "hip hop",
    "music.listening.electronic": "electronic",
    "music.listening.jazz": "jazz",
    "music.listening.classical": "classical",
    "music.listening.kpop": "k-pop",
    "music.listening.latin_music": "latin",
    "music.live_music.concerts": "indie pop",
    "music.live_music.festivals": "electronic",
    "music.live_music.open_mics": "folk",
}
POST_TEXT = [
    "Good session today at {place}.",
    "{place}, again. Not complaining.",
    "Golden hour at {place}.",
    "Small win: finally made it to {place}.",
]


def _local(d: date, h: int, m: int = 0) -> datetime:
    return datetime(d.year, d.month, d.day, h, m, tzinfo=TZ)


def _hm(d: date, hm: str) -> datetime:
    h, m = map(int, hm.split(":"))
    return _local(d, h, m)


def choose_providers(rng: random.Random, interest_ids: list[str], force_maps: bool) -> list[str]:
    l2 = {".".join(i.split(".")[:2]) for i in interest_ids}
    athletic = bool(l2 & {"sports_fitness.running", "outdoors.cycling", "outdoors.hiking"})
    musical = any(i.startswith("music.") for i in l2)
    picks = []
    if force_maps or rng.random() < 0.8:
        picks.append("google_maps")
    if rng.random() < 0.7:
        picks.append("google_calendar")
    if rng.random() < (0.8 if athletic else 0.05):
        picks.append("strava")
    if rng.random() < (0.75 if musical else 0.2):
        picks.append("spotify")
    if rng.random() < 0.3:
        picks.append("eventbrite")
    if rng.random() < 0.35:
        picks.append("instagram")
    if not picks:
        picks.append("google_maps")
    keep = [p for p in picks if p in ("google_maps", "google_calendar")]
    extra = [p for p in picks if p not in keep]
    return keep + extra[: 4 - len(keep)]


def venues_for(interest_ids: list[str], venues: list[dict]) -> list[dict]:
    l2 = {".".join(i.split(".")[:2]) for i in interest_ids}
    out = []
    for v in venues:
        if v.get("sensitive"):
            continue
        if any(l2 & set(ACTIVITY_INTERESTS.get(t, [])) for t in v["activityTypes"]):
            out.append(v)
    return out


def persona_records(
    rng: random.Random,
    *,
    user_id: str,
    providers: list[str],
    interests: list[str],
    slots: list[dict],
    hood: str,
    venues: list[dict],
    sensitive_venue: dict | None,
    ref: datetime,
    horizon_days: int,
    frequent: bool,
    iso,
) -> tuple[list[dict], dict]:
    """Records plus a private summary (for ground truth / signal-recall eval)."""
    rows: list[dict] = []
    truth: dict = {"frequentPlaces": [], "routines": [], "sensitivePlace": None}
    ref_day = ref.astimezone(TZ).date()
    plain = [i for i in interests]
    fit = venues_for(plain, venues) or [v for v in venues if not v.get("sensitive")]
    public = [v for v in venues if not v.get("sensitive")]

    def add(**kw):
        rows.append({"recordId": f"cr_{user_id[2:]}_{len(rows) + 1:03d}", "userId": user_id, **kw})

    def past_day(lo: int = 1, hi: int = 30) -> date:
        return ref_day - timedelta(days=rng.randint(lo, hi))

    def visit(v: dict, d: date, part: str):
        h = rng.randint(*VISIT_HOURS[part])
        a = _local(d, h, rng.choice([0, 15, 30, 45]))
        add(provider="google_maps", kind="place_visit", at=iso(a), end=iso(a + timedelta(minutes=rng.choice([45, 60, 90, 120]))), venueId=v["venueId"])

    if "google_maps" in providers or sensitive_venue:
        if frequent:
            v = rng.choice(fit)
            n = rng.randint(3, 6)
            for d in sorted({past_day() for _ in range(n)}):
                visit(v, d, rng.choice(slots)["part"])
            truth["frequentPlaces"].append(v["venueId"])
        for _ in range(rng.randint(1, 3)):  # one-off noise visits
            visit(rng.choice(public), past_day(), rng.choice(["morning", "afternoon", "evening"]))
        for v in rng.sample(fit, min(len(fit), rng.randint(0, 2))):
            add(provider="google_maps", kind="saved_place", at=iso(_local(past_day(), rng.randint(19, 22))), venueId=v["venueId"])
        if sensitive_venue:
            offset = (ref_day.weekday() - rng.randint(0, 6)) % 7 or 7  # weekly, most recent before REF
            part = rng.choice(["morning", "evening"])
            for k in range(4):
                visit(sensitive_venue, ref_day - timedelta(days=offset + 7 * k), part)
            truth["sensitivePlace"] = sensitive_venue["venueId"]

    if "strava" in providers:
        acts = []
        if any(i.startswith(("sports_fitness.running", "outdoors.hiking.trail_running")) for i in interests):
            acts.append("run")
        if any(i.startswith("outdoors.cycling") for i in interests):
            acts.append("ride")
        if not acts:
            acts.append(rng.choice(["run", "walk"]))
        for act in acts:
            s = rng.choice(slots)
            add(provider="strava", kind="routine", at=iso(_local(past_day(1, 7), rng.randint(*VISIT_HOURS[s["part"]]))),
                routine={"activity": act, "day": s["day"], "part": s["part"], "area": hood})
            truth["routines"].append({"activity": act, "day": s["day"], "part": s["part"]})

    if "spotify" in providers:
        genres = [GENRES[i] for i in interests if i in GENRES] or [rng.choice(list(GENRES.values()))]
        for _ in range(rng.randint(2, 4)):
            name = f"{rng.choice(['The ', ''])}{rng.choice(ARTIST_WORDS_A)} {rng.choice(ARTIST_WORDS_B)}"
            add(provider="spotify", kind="artist", at=iso(_local(past_day(), 12)), artist=name, genre=rng.choice(genres))

    if "eventbrite" in providers:
        shows = [v for v in public if set(v["activityTypes"]) & {"concert", "comedy_show", "museum_visit", "film_screening"}]
        for _ in range(rng.randint(1, 2)):
            v = rng.choice(shows)
            d = ref_day + timedelta(days=rng.randint(2, horizon_days))
            add(provider="eventbrite", kind="ticket", at=iso(_local(d, 19 if "museum_visit" not in v["activityTypes"] else 14)),
                eventName=f"{v['name']}: {rng.choice(['live night', 'special event', 'late show', 'season opener'])}", venueId=v["venueId"])

    if "instagram" in providers:
        for v in rng.sample(fit, min(len(fit), rng.randint(1, 3))):
            add(provider="instagram", kind="post", at=iso(_local(past_day(), rng.randint(9, 21))), venueId=v["venueId"],
                text=rng.choice(POST_TEXT).format(place=v["name"]))

    if "google_calendar" in providers:
        free = {(s["day"], s["part"]) for s in slots}
        for k in range(horizon_days + 1):
            d = ref_day + timedelta(days=k)
            day = DAYS[d.weekday()]
            blocks = []
            for part, (a, b) in PART_HOURS.items():
                if (day, part) not in free and rng.random() < (0.9 if part != "evening" else 0.5):
                    blocks.append([_hm(d, a), _hm(d, b)])
            merged: list[list[datetime]] = []
            for a, b in blocks:
                if merged and a - merged[-1][1] <= timedelta(minutes=30):
                    merged[-1][1] = b
                else:
                    merged.append([a, b])
            for a, b in merged:
                if b > ref:
                    add(provider="google_calendar", kind="busy", at=iso(a), end=iso(b))
    return rows, truth
