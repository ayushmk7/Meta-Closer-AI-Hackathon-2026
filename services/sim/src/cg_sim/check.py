"""`cg-sim seed --check`: validate committed seed data against contracts/schemas and the PRD-3 rules."""

from __future__ import annotations

import json
import re
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from cg_sim import maya
from cg_sim.contracts import params, pool_def, schemas, taxonomy
from cg_sim.geo import haversine_km

SEED_FILES = {
    "pool.json": "pool.schema.json",
    "personas.jsonl": "persona.schema.json",
    "activity.jsonl": "activity.schema.json",
    "onboarding.jsonl": "onboarding_transcript.schema.json",
    "demo.json": "demo.schema.json",
}
PRIVATE_KEYS = ["outgoingness", "flakiness", "lowOutgoing", "existingFriends", "archetypes", "groundTruth"]
MAX_POOL_BYTES = 5 * 1024 * 1024
MAYA_TOP_N = 5


def _validators() -> dict[str, Draft202012Validator]:
    registry = Registry()
    for name, schema in schemas().items():
        registry = registry.with_resource(name, Resource.from_contents(schema))
    return {
        name: Draft202012Validator(schema, registry=registry, format_checker=FormatChecker())
        for name, schema in schemas().items()
    }


def _rows(path: Path) -> list[dict]:
    if path.suffix == ".jsonl":
        return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    return [json.loads(path.read_text())]


def _slots(person: dict) -> set[tuple[str, str]]:
    return {(s["day"], s["part"]) for s in person["availability"]}


def check_pool(root: Path, pool_id: str) -> list[str]:
    errors: list[str] = []
    seed_dir, private_dir = root / "seed" / pool_id, root / "sim_private" / pool_id
    if not seed_dir.exists():
        return [f"{pool_id}: missing {seed_dir}"]
    validators = _validators()
    data: dict[str, list[dict]] = {}
    for file_name, schema_name in SEED_FILES.items():
        path = seed_dir / file_name
        if not path.exists():
            errors.append(f"{pool_id}/{file_name}: missing")
            continue
        data[file_name] = rows = _rows(path)
        for number, row in enumerate(rows, 1):
            for err in validators[schema_name].iter_errors(row):
                errors.append(f"{pool_id}/{file_name}:{number}: {err.message}")
    if errors:
        return errors

    pdef = pool_def(pool_id)
    pool = data["pool.json"][0]
    tax_version, leaves, _ = taxonomy()
    for key in ("mode", "center", "radiusKm", "label"):
        if pool[key] != pdef[key]:
            errors.append(f"{pool_id}/pool.json: {key} differs from contracts/modes.yaml")
    if pool["taxonomyVersion"] != tax_version:
        errors.append(f"{pool_id}/pool.json: taxonomyVersion {pool['taxonomyVersion']} != {tax_version}")

    personas = {p["userId"]: p for p in data["personas.jsonl"]}
    if len(personas) != len(data["personas.jsonl"]):
        errors.append(f"{pool_id}: duplicate userIds in personas.jsonl")
    sim = params()["sim"]
    expected = sim["personasEvent"] if pool["mode"] == "event" else sim["personasCity"]
    regulars = [u for u in personas if u != maya.MAYA_ID]
    if len(regulars) != expected:
        errors.append(f"{pool_id}: {len(regulars)} personas, params.sim expects {expected}")

    # Names: fictional, no collisions with the clone's seed people, unique.
    clone = maya.clone_people_names()
    clone_first = {n.split()[0] for n in clone}
    names = [p["displayName"] for u, p in personas.items() if u != maya.MAYA_ID]
    for name in names:
        if name in clone or name.split()[0] in clone_first:
            errors.append(f"{pool_id}: name '{name}' collides with the clone seed")
    if len(set(names)) != len(names):
        errors.append(f"{pool_id}: duplicate display names")

    for uid, p in personas.items():
        if p.get("avatar") and not (seed_dir / p["avatar"]).exists():
            errors.append(f"{pool_id}: {uid} avatar {p['avatar']} missing")
        if "cloneProfileId" in p and uid != maya.MAYA_ID:
            errors.append(f"{pool_id}: cloneProfileId on {uid}; only u_maya may carry it")
        if pool["mode"] == "city" and haversine_km(p["homeLocation"], pool["center"]) > pool["radiusKm"]:
            errors.append(f"{pool_id}: {uid} home outside the pool radius")
    if (seed_dir / "avatars").exists() and not (seed_dir / "avatars" / "PROVENANCE.md").exists():
        errors.append(f"{pool_id}: avatars/PROVENANCE.md missing")

    for file_name in ("activity.jsonl", "onboarding.jsonl"):
        for row in data[file_name]:
            if row["userId"] not in personas:
                errors.append(f"{pool_id}/{file_name}: unknown userId {row['userId']}")
    ids = [a["activityId"] for a in data["activity.jsonl"]]
    if len(set(ids)) != len(ids):
        errors.append(f"{pool_id}/activity.jsonl: duplicate activityIds")

    # Maya
    if pool["mode"] == "city":
        m = personas.get(maya.MAYA_ID)
        if not m or m.get("cloneProfileId") != "maya":
            errors.append(f"{pool_id}: u_maya with cloneProfileId 'maya' missing")

    truth = (
        {r["userId"]: r for r in _rows(private_dir / "ground_truth.jsonl")} if private_dir.exists() else {}
    )
    latent = _rows(private_dir / "latent.jsonl") if private_dir.exists() else []
    if not truth:
        errors.append(f"{pool_id}: sim_private ground truth missing")
    for uid, row in truth.items():
        for item in row["interests"]:
            if item["id"] not in leaves:
                errors.append(f"{pool_id}: ground truth {uid} has unknown interest {item['id']}")
        if uid != maya.MAYA_ID and not 3 <= len(row["interests"]) <= 8:
            errors.append(f"{pool_id}: {uid} has {len(row['interests'])} true interests (want 3 to 8)")

    errors += _check_demo(pool_id, pool, data["demo.json"][0], personas, truth)
    errors += _check_no_private_leak(pool_id, seed_dir, latent, leaves)

    size = sum(f.stat().st_size for f in seed_dir.rglob("*") if f.is_file())
    if size > MAX_POOL_BYTES:
        errors.append(f"{pool_id}: seed is {size / 1e6:.1f} MB (limit about 5 MB)")
    return errors


def _check_demo(pool_id: str, pool: dict, demo: dict, personas: dict, truth: dict) -> list[str]:
    errors: list[str] = []
    featured = demo["featuredIds"]
    if demo["poolId"] != pool_id:
        errors.append(f"{pool_id}/demo.json: poolId mismatch")
    for uid in featured + demo["counterpartIds"] + [demo["publicFeaturedId"], demo["privateFeaturedId"]]:
        if uid not in personas:
            errors.append(f"{pool_id}/demo.json: {uid} not in personas")
    if errors:
        return errors
    if len(set(featured)) != len(featured):
        errors.append(f"{pool_id}/demo.json: duplicate featuredIds")
    if demo["liveUserId"] != demo["publicFeaturedId"] or demo["liveUserId"] not in featured:
        errors.append(f"{pool_id}/demo.json: liveUserId must be publicFeaturedId and featured")
    if demo["privateFeaturedId"] not in featured:
        errors.append(f"{pool_id}/demo.json: privateFeaturedId not featured")
    if not set(featured) <= set(demo["counterpartIds"]):
        errors.append(f"{pool_id}/demo.json: counterpartIds must include every featured ID")
    if personas[demo["publicFeaturedId"]]["profileVisibility"] != "public":
        errors.append(f"{pool_id}/demo.json: publicFeaturedId is not public")
    if personas[demo["privateFeaturedId"]]["profileVisibility"] != "private":
        errors.append(f"{pool_id}/demo.json: privateFeaturedId is not private")
    if haversine_km(demo["fakeLocation"], pool["center"]) > pool["radiusKm"]:
        errors.append(f"{pool_id}/demo.json: fakeLocation outside the pool")

    # Hard filters with Maya (PRD-2 §3.3). Maya's profile comes from the city pool.
    maya_p = personas.get(maya.MAYA_ID)
    if maya_p is None:  # event pool: Maya opts in from the city pool and stands at fakeLocation
        maya_p = maya.persona(demo["fakeLocation"])
    m = params()["matching"]
    maya_top = [k for k, _ in sorted(maya.GROUND_TRUTH.items(), key=lambda kv: -kv[1])[:MAYA_TOP_N]]
    for uid in featured:
        p = personas[uid]
        if p["ageBand"] not in m["ageBands"]:
            errors.append(f"{pool_id}: featured {uid} age band {p['ageBand']} fails the hard filter")
        if len(_slots(p) & _slots(maya_p)) < m["minOverlapSlotsPerWeek"]:
            errors.append(f"{pool_id}: featured {uid} has too little availability overlap with Maya")
        if (
            pool["mode"] == "city"
            and haversine_km(p["homeLocation"], maya_p["homeLocation"]) > m["distanceMaxKm"]
        ):
            errors.append(f"{pool_id}: featured {uid} is too far from Maya")
        shared = {i["id"] for i in truth.get(uid, {}).get("interests", [])} & set(maya.GROUND_TRUTH)
        if not shared:
            errors.append(f"{pool_id}: featured {uid} shares no interest with Maya")
    pub = {i["id"] for i in truth[demo["publicFeaturedId"]]["interests"]}
    if len(pub & set(maya_top)) < 2:
        errors.append(f"{pool_id}: publicFeaturedId shares fewer than 2 of Maya's top interests")
    priv = {i["id"] for i in truth[demo["privateFeaturedId"]]["interests"]}
    if len(priv & set(maya.GROUND_TRUTH)) < 1:
        errors.append(f"{pool_id}: privateFeaturedId shares none of Maya's interests")
    return errors


def _check_no_private_leak(pool_id: str, seed_dir: Path, latent: list[dict], leaves: dict) -> list[str]:
    """No hidden-trait field, taxonomy ID or trait value from sim_private appears under data/seed/."""
    errors: list[str] = []
    blob = "\n".join(p.read_text() for p in sorted(seed_dir.glob("*.json*")))
    for key in PRIVATE_KEYS:
        if f'"{key}"' in blob:
            errors.append(f"{pool_id}: private field '{key}' found in data/seed")
    leaf_hits = sorted(k for k in leaves if k in blob)
    if leaf_hits:
        errors.append(f"{pool_id}: taxonomy IDs in data/seed (ground truth leak): {leaf_hits[:3]}")
    for row in latent:
        for key in ("outgoingness", "flakiness"):
            value = f"{row[key]}"
            if len(value.split(".")[-1]) >= 3 and re.search(rf"(?<![\d.]){re.escape(value)}(?!\d)", blob):
                errors.append(
                    f"{pool_id}: hidden trait value {value} ({row['userId']}.{key}) appears in data/seed"
                )
    return errors
