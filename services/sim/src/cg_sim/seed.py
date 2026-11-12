"""`cg-sim seed`: deterministic seed data for one pool.

Writes data/seed/<poolId>/ (public, read by the backend) and data/sim_private/<poolId>/ (hidden
traits and ground truth, read only by sim and dashboard). Same pool and seed, same bytes."""

from __future__ import annotations

import json
import random
import shutil
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

from cg_sim import __version__, avatars, maya, text
from cg_sim.contracts import Leaf, data_dir, params, pool_def, taxonomy
from cg_sim.geo import neighborhood, point_near, sample_home
from cg_sim.names import full_name_pool, initials
from cg_sim.scenes import ARCHETYPES

# Fixed "now" for generated timestamps; never the wall clock, so output is reproducible.
REF_TIME = datetime(2026, 11, 11, 20, 0, tzinfo=UTC)
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
PARTS = ["morning", "afternoon", "evening"]
SENSITIVE_SHARE = 0.10
PRIVATE_SHARE = 0.30


@dataclass
class Person:
    user_id: str
    first: str
    last: str
    hood: str
    home: dict
    age_band: str
    visibility: str
    slots: list[dict]
    group_size: dict
    joined_at: datetime
    interests: list[tuple[Leaf, float]]
    noise: list[Leaf]
    archetypes: list[str]
    outgoingness: float
    flakiness: float
    low_outgoing: bool
    existing_friends: int
    has_avatar: bool = True
    has_bio: bool = True
    role: str = "regular"  # regular | featured_public | featured_private | featured
    extra: dict = field(default_factory=dict)


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _rng(pool_id: str, seed: int, purpose: str) -> random.Random:
    return random.Random(f"{pool_id}|{seed}|{purpose}")


def _sort_slots(slots: list[dict]) -> list[dict]:
    return sorted(slots, key=lambda s: (DAYS.index(s["day"]), PARTS.index(s["part"])))


def _sample_slots(rng: random.Random, must: list[dict] | None = None) -> list[dict]:
    all_slots = [{"day": d, "part": p} for d in DAYS for p in PARTS]
    weights = [
        (3 if p == "evening" else 1)
        * (3 if d in ("sat", "sun") else 1)
        * (0.3 if p == "morning" and d not in ("sat", "sun") else 1)
        for d in DAYS
        for p in PARTS
    ]
    k = rng.randint(3, 8)
    chosen = list(must or [])
    while len(chosen) < k:
        slot = rng.choices(all_slots, weights=weights)[0]
        if slot not in chosen:
            chosen.append(slot)
    return _sort_slots(chosen)


def _weights(rng: random.Random, n: int) -> list[float]:
    top = rng.uniform(0.7, 0.95)
    out = [top]
    for _ in range(n - 1):
        out.append(max(0.15, out[-1] * rng.uniform(0.7, 0.95)))
    return [round(w, 2) for w in out]


def _interests(
    rng: random.Random, mode: str, leaves: dict[str, Leaf]
) -> tuple[list[str], list[tuple[Leaf, float]]]:
    names = list(ARCHETYPES)
    w = [ARCHETYPES[a][1 if mode == "event" else 0] for a in names]
    picked = [rng.choices(names, weights=w)[0]]
    if rng.random() < 0.4:
        second = rng.choices(names, weights=w)[0]
        if second != picked[0]:
            picked.append(second)
    n = rng.randint(3, 8)
    pool = list(ARCHETYPES[picked[0]][2])
    rng.shuffle(pool)
    if len(picked) > 1:
        extra = [x for x in ARCHETYPES[picked[1]][2] if x not in pool]
        rng.shuffle(extra)
        # interleave so the second scene shows up among the top interests too
        pool = [x for pair in zip(pool, extra) for x in pair] + pool[len(extra) :] + extra[len(pool) :]
    ids = pool[:n]
    plain = [k for k, leaf in leaves.items() if not leaf.sensitive]
    if rng.random() < 0.3 and len(ids) < 8:
        wild = rng.choice(plain)
        if wild not in ids:
            ids.append(wild)
    if rng.random() < SENSITIVE_SHARE:
        sensitive = sorted(k for k, leaf in leaves.items() if leaf.sensitive)
        if len(ids) >= 8:
            ids = ids[:7]
        ids.append(rng.choice(sensitive))
    ws = _weights(rng, len(ids))
    return picked, [(leaves[i], w) for i, w in zip(ids, ws)]


def _group_size(rng: random.Random) -> dict:
    lo = rng.choice([2, 2, 2, 3])
    hi = max(lo, rng.choice([3, 4, 4, 4, 5, 6, 8]))
    return {"min": lo, "max": hi}


# Featured people for Maya's first drop. Each shares specific Maya interests (planted, so the demo
# is reproducible); `own` interests make them distinct people rather than Maya clones.
FEATURED = {
    "city": [
        (
            "featured_public",
            "Outer Sunset",
            "26_29",
            [
                "outdoors.hiking.coastal_hikes",
                "outdoors.gardening.community_gardens",
                "arts_crafts.ceramics.handbuilding",
            ],
            ["outdoors.nature.birdwatching", "food_drink.cooking.sourdough"],
        ),
        (
            "featured",
            "Cole Valley",
            "26_29",
            ["games.board_games.strategy_games", "social_community.neighborhood.farmers_markets"],
            ["games.tabletop_rpg.dnd", "food_drink.eating_out.trying_new_spots", "music.live_music.concerts"],
        ),
        (
            "featured_private",
            "Inner Richmond",
            "22_25",
            ["arts_crafts.visual_art.painting", "arts_crafts.photography.street_photography"],
            ["travel.local_exploring.hidden_gems", "food_drink.coffee_tea.specialty_coffee"],
        ),
        (
            "featured",
            "Inner Sunset",
            "22_25",
            ["outdoors.gardening.community_gardens", "food_drink.cooking.home_cooking"],
            ["sports_fitness.mind_body.yoga", "culture.reading.book_clubs"],
        ),
    ],
    "event": [
        (
            "featured_public",
            "Belle Haven",
            "26_29",
            [
                "tech_career.building.hackathons",
                "outdoors.hiking.coastal_hikes",
                "outdoors.gardening.community_gardens",
            ],
            ["tech_career.building.ai_ml", "food_drink.coffee_tea.specialty_coffee"],
        ),
        (
            "featured",
            "Menlo Park",
            "22_25",
            ["tech_career.building.hackathons", "games.board_games.strategy_games"],
            ["tech_career.startups.product_design", "games.video_games.indie_games"],
        ),
        (
            "featured_private",
            "Willows",
            "22_25",
            ["arts_crafts.ceramics.handbuilding", "tech_career.building.hackathons"],
            ["tech_career.building.hardware_electronics", "music.listening.electronic"],
        ),
        (
            "featured",
            "East Palo Alto",
            "26_29",
            ["arts_crafts.photography.street_photography", "arts_crafts.visual_art.painting"],
            ["tech_career.building.coding_side_projects", "travel.local_exploring.city_walks"],
        ),
    ],
}


def _featured_person(rng: random.Random, spec: tuple, base: Person, leaves: dict[str, Leaf]) -> Person:
    role, hood, age_band, shared, own = spec
    weights = [round(w, 2) for w in sorted((rng.uniform(0.6, 0.9) for _ in shared + own), reverse=True)]
    ids = shared + own
    # Shared interests lead, so they are the strongest signal in the activity.
    interests = [(leaves[i], w) for i, w in zip(ids, weights)]
    must = [
        {"day": "sat", "part": "morning"},
        {"day": "sun", "part": "afternoon"},
        {"day": "wed", "part": "evening"},
    ]
    _, home = sample_home(rng, "city", hood)
    base.hood, base.home, base.age_band = hood, home, age_band
    base.visibility = "private" if role == "featured_private" else "public"
    base.slots = _sample_slots(rng, must)
    base.group_size = {"min": 2, "max": rng.choice([4, 5])}
    base.interests = interests
    base.noise = base.noise[:1]
    base.archetypes = []
    base.outgoingness = round(rng.uniform(0.65, 0.85), 4)
    base.flakiness = round(rng.uniform(0.05, 0.15), 4)
    base.low_outgoing = False
    base.existing_friends = rng.randint(3, 8)
    base.has_avatar = True
    base.has_bio = base.visibility == "public"
    base.role = role
    return base


def build_people(pool_id: str, seed: int) -> list[Person]:
    pdef = pool_def(pool_id)
    mode = pdef["mode"]
    sim = params()["sim"]
    n = sim["personasEvent"] if mode == "event" else sim["personasCity"]
    _, leaves, _ = taxonomy()

    clone_names = maya.clone_people_names()
    forbidden_first = {name.split()[0] for name in clone_names}
    forbidden_last = {name.split()[-1] for name in clone_names}
    names = full_name_pool(_rng(pool_id, seed, "names"), n, forbidden_first, forbidden_last)

    rng = _rng(pool_id, seed, "people")
    low_idx = set(rng.sample(range(n), round(n * sim["lowOutgoingShare"])))
    private_idx = set(rng.sample(range(n), round(n * PRIVATE_SHARE)))
    prefix = "u_e" if mode == "event" else "u_"
    width = 3 if mode == "event" else 4
    age_bands = ["18_21", "22_25", "26_29", "30_34"]
    age_w = [30, 40, 22, 8] if mode == "event" else [12, 40, 36, 12]
    joined_lo = datetime(2026, 11, 8, tzinfo=UTC) if mode == "event" else datetime(2026, 6, 1, tzinfo=UTC)
    joined_span = (REF_TIME - timedelta(days=1) - joined_lo).total_seconds()

    people: list[Person] = []
    for i in range(n):
        prng = _rng(pool_id, seed, f"person:{i}")
        first, last = names[i]
        hood, home = sample_home(prng, mode)
        archetypes, interests = _interests(prng, mode, leaves)
        held = {leaf.id for leaf, _ in interests}
        plain = sorted(k for k, leaf in leaves.items() if not leaf.sensitive and k not in held)
        noise = [leaves[k] for k in prng.sample(plain, prng.randint(1, 3))]
        low = i in low_idx
        people.append(
            Person(
                user_id=f"{prefix}{i + 1:0{width}d}",
                first=first,
                last=last,
                hood=hood,
                home=home,
                age_band=prng.choices(age_bands, weights=age_w)[0],
                visibility="private" if i in private_idx else "public",
                slots=_sample_slots(prng),
                group_size=_group_size(prng),
                joined_at=joined_lo + timedelta(seconds=int(prng.uniform(0, joined_span) // 60 * 60)),
                interests=interests,
                noise=noise,
                archetypes=archetypes,
                outgoingness=round(prng.uniform(0.03, 0.33) if low else prng.uniform(0.36, 0.98), 4),
                flakiness=round(min(0.95, prng.betavariate(2, 5)), 4),
                low_outgoing=low,
                existing_friends=prng.randint(0, 2) if low else prng.randint(2, 14),
                has_avatar=prng.random() < 0.85,
                has_bio=prng.random() < (0.5 if i in private_idx else 0.75),
            )
        )

    frng = _rng(pool_id, seed, "featured")
    specs = FEATURED[mode]
    for idx, spec in zip(sorted(frng.sample(range(n), len(specs))), frng.sample(specs, len(specs))):
        _featured_person(frng, spec, people[idx], leaves)
    return people


def _persona(p: Person, prng: random.Random) -> dict:
    out = {
        "userId": p.user_id,
        "displayName": f"{p.first} {p.last}",
        "firstName": p.first,
        "initials": initials(p.first, p.last),
        "avatar": f"avatars/{p.user_id}.png" if p.has_avatar else None,
        "profileVisibility": p.visibility,
        "homeLocation": p.home,
        "neighborhood": p.hood,
        "ageBand": p.age_band,
    }
    if p.has_bio:
        b = text.bio(prng, [leaf for leaf, _ in p.interests])
        if b:
            out["bio"] = b
    out["availability"] = p.slots
    out["groupSize"] = p.group_size
    out["joinedAt"] = _iso(p.joined_at)
    return out


def _activity(p: Person, prng: random.Random, area: str) -> list[dict]:
    outgoing = 0.9 if p.role.startswith("featured") else p.outgoingness
    items = text.activity_items(
        prng, interests=p.interests, noise_leaves=p.noise, outgoingness=outgoing, hood=p.hood, area=area
    )
    weeks = prng.randint(2, 4)
    span = weeks * 7 * 24 * 60
    stamped = sorted(
        ((REF_TIME - timedelta(minutes=prng.randint(30, span)), item) for item in items), key=lambda t: t[0]
    )
    return [_activity_row(p.user_id, k, at, item) for k, (at, item) in enumerate(stamped, 1)]


def _activity_row(user_id: str, k: int, at: datetime, item: dict) -> dict:
    return {
        "activityId": f"act_{user_id[2:]}_{k:03d}",
        "userId": user_id,
        "kind": item["kind"],
        "at": _iso(at),
        **{key: v for key, v in item.items() if key != "kind"},
    }


def _dump_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n" for r in rows))


def _dump_json(path: Path, obj: dict) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def generate(pool_id: str, seed: int, root: Path | None = None) -> dict:
    """Write seed + sim_private for one pool under `root` (default CG_DATA_DIR). Returns a summary."""
    root = root or data_dir()
    pdef = pool_def(pool_id)
    mode = pdef["mode"]
    tax_version, leaves, _ = taxonomy()
    people = build_people(pool_id, seed)
    area = "Peninsula" if mode == "event" else "SF"

    seed_dir, private_dir = root / "seed" / pool_id, root / "sim_private" / pool_id
    for d in (seed_dir, private_dir):
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)
    (seed_dir / "avatars").mkdir()

    personas, activity, onboarding, truth, latent = [], [], [], [], []
    if mode == "city":
        mrng = _rng(pool_id, seed, "maya")
        _, maya_home = sample_home(mrng, "city", maya.MAYA_HOOD)
        personas.append(maya.persona(maya_home))
        activity += [
            _activity_row(maya.MAYA_ID, k, at, item)
            for k, (at, item) in enumerate(sorted(maya.activity(), key=lambda t: t[0]), 1)
        ]
        shutil.copyfile(maya.clone_avatar_path(), seed_dir / "avatars" / f"{maya.MAYA_ID}.jpg")
        truth.append(
            {
                "userId": maya.MAYA_ID,
                "role": "maya",
                "archetypes": [],
                "interests": [
                    {"id": k, "weight": w, "sensitive": leaves[k].sensitive}
                    for k, w in maya.GROUND_TRUTH.items()
                ],
                "noise": [],
            }
        )
        latent.append(
            {
                "userId": maya.MAYA_ID,
                "outgoingness": 0.45,
                "flakiness": 0.1,
                "lowOutgoing": False,
                "existingFriends": 12,
            }
        )

    for p in people:
        prng = _rng(pool_id, seed, f"text:{p.user_id}")
        personas.append(_persona(p, prng))
        activity += _activity(p, prng, area)
        onboarding.append(
            {
                "userId": p.user_id,
                "turns": text.onboarding(
                    prng,
                    first=p.first,
                    hood=p.hood,
                    interests=p.interests,
                    outgoingness=p.outgoingness,
                    group_size=p.group_size,
                    slots=p.slots,
                ),
            }
        )
        if p.has_avatar:
            (seed_dir / "avatars" / f"{p.user_id}.png").write_bytes(
                avatars.render_png(_rng(pool_id, seed, f"avatar:{p.user_id}"))
            )
        truth.append(
            {
                "userId": p.user_id,
                "role": p.role,
                "archetypes": p.archetypes,
                "interests": [
                    {"id": leaf.id, "weight": w, "sensitive": leaf.sensitive} for leaf, w in p.interests
                ],
                "noise": [leaf.id for leaf in p.noise],
            }
        )
        latent.append(
            {
                "userId": p.user_id,
                "outgoingness": p.outgoingness,
                "flakiness": p.flakiness,
                "lowOutgoing": p.low_outgoing,
                "existingFriends": p.existing_friends,
            }
        )

    pool_json = {
        "poolId": pool_id,
        "mode": mode,
        "label": pdef["label"],
        "description": pdef.get("description", ""),
        "center": pdef["center"],
        "radiusKm": pdef["radiusKm"],
        "window": pdef.get("window"),
        "generator": f"cg-sim {__version__}",
        "rngSeed": seed,
        "taxonomyVersion": tax_version,
    }
    _dump_json(seed_dir / "pool.json", pool_json)
    _dump_jsonl(seed_dir / "personas.jsonl", personas)
    _dump_jsonl(seed_dir / "activity.jsonl", activity)
    _dump_jsonl(seed_dir / "onboarding.jsonl", onboarding)
    _dump_json(seed_dir / "demo.json", _demo(pool_id, seed, mode, people))
    (seed_dir / "avatars" / "PROVENANCE.md").write_text(
        avatars.PROVENANCE.format(maya=avatars.MAYA_PROVENANCE if mode == "city" else "")
    )
    _dump_jsonl(private_dir / "ground_truth.jsonl", truth)
    _dump_jsonl(private_dir / "latent.jsonl", latent)
    return {"poolId": pool_id, "people": len(personas), "activity": len(activity)}


def _demo(pool_id: str, seed: int, mode: str, people: list[Person]) -> dict:
    by_role: dict[str, list[Person]] = {}
    for p in people:
        by_role.setdefault(p.role, []).append(p)
    public, private = by_role["featured_public"][0], by_role["featured_private"][0]
    others = by_role.get("featured", [])
    featured = [public.user_id, others[0].user_id, private.user_id] + [p.user_id for p in others[1:]]
    rng = _rng(pool_id, seed, "demo")
    regulars = [p.user_id for p in people if p.role == "regular" and not p.low_outgoing]
    counterparts = featured + sorted(rng.sample(regulars, 3))
    if mode == "city":
        _, lat, lng, _, spread = neighborhood(maya.MAYA_HOOD)
        fake = point_near(rng, lat, lng, spread / 2)
    else:
        center = pool_def(pool_id)["center"]
        fake = point_near(rng, center["lat"], center["lng"], 150)
    return {
        "poolId": pool_id,
        "mayaId": maya.MAYA_ID,
        "featuredIds": featured,
        "publicFeaturedId": public.user_id,
        "privateFeaturedId": private.user_id,
        "liveUserId": public.user_id,
        "counterpartIds": counterparts,
        "fakeLocation": fake,
    }
