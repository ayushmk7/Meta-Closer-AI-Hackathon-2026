"""`cg-sim seed --check`: validate committed seed data against contracts/schemas and the PRD-3 rules.
validate_contracts.py skips missing files, so presence is enforced here."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from cg_sim.contracts import params, pool_def, schemas, taxonomy
from cg_sim.seed import maya
from cg_sim.seed.geo import haversine_km
from cg_sim.seed.plans import HORIZON_START, TITLE_MAX, maya_problems, venue_open

SEED_FILES = {
    "pool.json": "pool.schema.json",
    "personas.jsonl": "persona.schema.json",
    "activity.jsonl": "activity.schema.json",
    "connectors.jsonl": "connector_record.schema.json",
    "venues.jsonl": "venue.schema.json",
    "plans.jsonl": "plan.schema.json",
    "demo.json": "demo.schema.json",
}
PRIVATE_KEYS = ["outgoingness", "flakiness", "lowOutgoing", "existingFriends", "archetypes", "groundTruth",
                "frequentPlaces", "sensitivePlace"]
MAX_POOL_BYTES = 8 * 1024 * 1024
MAYA_TOP_N = 5
REF = datetime(2026, 11, 11, 20, 0, tzinfo=UTC)


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


def _t(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)


def _dupes(rows: list[dict], key: str) -> bool:
    ids = [r[key] for r in rows]
    return len(set(ids)) != len(ids)


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
    if not (seed_dir / "avatars" / "PROVENANCE.md").exists():
        errors.append(f"{pool_id}: avatars/PROVENANCE.md missing")
    if errors:
        return errors

    p = params()
    pdef = pool_def(pool_id)
    pool = data["pool.json"][0]
    tax_version, leaves, _ = taxonomy()
    for key in ("mode", "center", "radiusKm", "label"):
        if pool[key] != pdef[key]:
            errors.append(f"{pool_id}/pool.json: {key} differs from contracts/modes.yaml")
    if pool["taxonomyVersion"] != tax_version:
        errors.append(f"{pool_id}/pool.json: taxonomyVersion {pool['taxonomyVersion']} != {tax_version}")
    for file_name, key in (("personas.jsonl", "userId"), ("activity.jsonl", "activityId"),
                           ("connectors.jsonl", "recordId"), ("venues.jsonl", "venueId"), ("plans.jsonl", "planId")):
        if _dupes(data[file_name], key):
            errors.append(f"{pool_id}/{file_name}: duplicate {key}s")

    personas = {r["userId"]: r for r in data["personas.jsonl"]}
    expected = p["sim"]["personasEvent"] if pool["mode"] == "event" else p["sim"]["personasCity"]
    if len([u for u in personas if u != maya.MAYA_ID]) != expected:
        errors.append(f"{pool_id}: persona count differs from params.sim ({expected})")
    errors += _check_personas(pool_id, pool, seed_dir, personas)

    known = set(personas) | {maya.MAYA_ID}
    for file_name in ("activity.jsonl", "connectors.jsonl"):
        for row in data[file_name]:
            if row["userId"] not in known:
                errors.append(f"{pool_id}/{file_name}: unknown userId {row['userId']}")

    venues = {v["venueId"]: v for v in data["venues.jsonl"]}
    if not any(v.get("sensitive") for v in venues.values()):
        errors.append(f"{pool_id}/venues.jsonl: no sensitive place")
    for r in data["connectors.jsonl"]:
        if r.get("venueId") and r["venueId"] not in venues:
            errors.append(f"{pool_id}/connectors.jsonl {r['recordId']}: unknown venue {r['venueId']}")
    plans = {x["planId"]: x for x in data["plans.jsonl"]}
    errors += _check_plans(pool_id, pdef, plans, venues, personas, leaves)
    if pool["mode"] == "city":
        errors += _check_maya_records(pool_id, data["connectors.jsonl"], venues, personas)

    truth = {r["userId"]: r for r in _rows(private_dir / "ground_truth.jsonl")} if (private_dir / "ground_truth.jsonl").exists() else {}
    latent = _rows(private_dir / "latent.jsonl") if (private_dir / "latent.jsonl").exists() else []
    if not truth or not latent:
        errors.append(f"{pool_id}: sim_private ground_truth/latent missing")
    for uid, row in truth.items():
        for item in row["interests"]:
            if item["id"] not in leaves:
                errors.append(f"{pool_id}: ground truth {uid} has unknown interest {item['id']}")
        if uid != maya.MAYA_ID and not 3 <= len(row["interests"]) <= 8:
            errors.append(f"{pool_id}: {uid} has {len(row['interests'])} true interests (want 3 to 8)")

    errors += check_demo(pool_id, pool, data["demo.json"][0], personas, truth, plans, venues)
    errors += _check_no_private_leak(pool_id, seed_dir, latent, leaves)

    size = sum(f.stat().st_size for f in seed_dir.rglob("*") if f.is_file())
    if size > MAX_POOL_BYTES:
        errors.append(f"{pool_id}: seed is {size / 1e6:.1f} MB (limit about 8 MB)")
    return errors


def _check_personas(pool_id, pool, seed_dir, personas) -> list[str]:
    errors = []
    clone = maya.clone_people_names()
    clone_first = {n.split()[0] for n in clone}
    names = [r["displayName"] for u, r in personas.items() if u != maya.MAYA_ID]
    for name in names:
        if name in clone or name.split()[0] in clone_first:
            errors.append(f"{pool_id}: name '{name}' collides with the clone seed")
    if len(set(names)) != len(names):
        errors.append(f"{pool_id}: duplicate display names")
    for uid, r in personas.items():
        if r.get("avatar") and not (seed_dir / r["avatar"]).exists():
            errors.append(f"{pool_id}: {uid} avatar {r['avatar']} missing")
        if "cloneProfileId" in r and uid != maya.MAYA_ID:
            errors.append(f"{pool_id}: cloneProfileId on {uid}; only u_maya may carry it")
        if r["groupSize"]["min"] < 3 or r["groupSize"]["max"] < r["groupSize"]["min"]:
            errors.append(f"{pool_id}: {uid} groupSize {r['groupSize']} (want min >= 3)")
        if uid != maya.MAYA_ID and not 1 <= len(r["connectedProviders"]) <= 4:
            errors.append(f"{pool_id}: {uid} connects {len(r['connectedProviders'])} providers (want 1 to 4)")
        if pool["mode"] == "city" and haversine_km(r["homeLocation"], pool["center"]) > pool["radiusKm"]:
            errors.append(f"{pool_id}: {uid} home outside the pool radius")
    if pool["mode"] == "city":
        m = personas.get(maya.MAYA_ID)
        if not m or m.get("cloneProfileId") != "maya":
            errors.append(f"{pool_id}: u_maya with cloneProfileId 'maya' missing")
        elif m["connectedProviders"]:
            errors.append(f"{pool_id}: u_maya must start with no connected providers")
    elif maya.MAYA_ID in personas:
        errors.append(f"{pool_id}: u_maya belongs to the city pool only")
    return errors


def _check_plans(pool_id, pdef, plans, venues, personas, leaves) -> list[str]:
    errors = []
    p = params()
    start = HORIZON_START + timedelta(hours=p["plans"]["minLeadHours"])
    end = HORIZON_START + timedelta(days=p["plans"]["horizonDays"])
    if pdef.get("window"):
        end = min(end, _t(pdef["window"]["end"]))
    for pid, x in plans.items():
        v = venues.get(x["venueId"])
        if v is None:
            errors.append(f"{pool_id}: plan {pid} at unknown venue")
            continue
        if x["poolId"] != pool_id:
            errors.append(f"{pool_id}: plan {pid} poolId mismatch")
        if v.get("sensitive"):
            errors.append(f"{pool_id}: plan {pid} at sensitive venue {v['venueId']}")
        if x["activityType"] not in v["activityTypes"]:
            errors.append(f"{pool_id}: plan {pid} venue does not support {x['activityType']}")
        s, e = _t(x["startsAt"]), _t(x["endsAt"])
        if not venue_open(v, s, e):
            errors.append(f"{pool_id}: plan {pid} venue closed at that time")
        if s < start or e > end or e <= s:
            errors.append(f"{pool_id}: plan {pid} outside the plan horizon/window")
        if len(x["title"]) > TITLE_MAX:
            errors.append(f"{pool_id}: plan {pid} title over {TITLE_MAX} chars")
        if x["size"]["min"] < 3 or x["size"]["max"] < x["size"]["min"]:
            errors.append(f"{pool_id}: plan {pid} size {x['size']}")
        if x["cost"] != v["booking"]["cost"]:
            errors.append(f"{pool_id}: plan {pid} cost differs from its venue booking")
        for t in x["targetInterestIds"]:
            if t.count(".") != 1 or any(k.startswith(t + ".") and leaf.sensitive for k, leaf in leaves.items()):
                errors.append(f"{pool_id}: plan {pid} target {t} must be a non-sensitive level-2 interest")
        joins = x.get("seedJoinIds", [])
        if maya.MAYA_ID in joins:
            errors.append(f"{pool_id}: plan {pid} seedJoinIds include u_maya")
        if len(joins) >= x["size"]["max"] or len(set(joins)) != len(joins) or not set(joins) <= set(personas):
            errors.append(f"{pool_id}: plan {pid} bad seedJoinIds")
    return errors


def maya_frequent_visits(records: list[dict], venue_id: str) -> int:
    lo = REF - timedelta(days=30)
    return sum(
        1 for r in records
        if r["userId"] == maya.MAYA_ID and r["kind"] == "place_visit" and r.get("venueId") == venue_id
        and lo <= _t(r["at"]) <= REF
    )


def _check_maya_records(pool_id, records, venues, personas) -> list[str]:
    errors = []
    mine = [r for r in records if r["userId"] == maya.MAYA_ID]
    if maya_frequent_visits(records, maya.FREQUENT_VENUE) < 4:
        errors.append(f"{pool_id}: Maya needs >= 4 Lands End visits in the last 30 days")
    saved = [venues[r["venueId"]] for r in mine if r["kind"] == "saved_place"]
    if not any("ceramics_studio" in v["activityTypes"] for v in saved):
        errors.append(f"{pool_id}: Maya needs a saved ceramics studio")
    sens = sorted(_t(r["at"]) for r in mine if r["kind"] == "place_visit" and venues[r["venueId"]].get("sensitive"))
    if len(sens) < 4 or any((b - a).days != 7 for a, b in zip(sens, sens[1:])):
        errors.append(f"{pool_id}: Maya needs weekly visits to a sensitive place")
    if sum(r["provider"] == "eventbrite" and r["kind"] == "ticket" for r in mine) != 1:
        errors.append(f"{pool_id}: Maya needs exactly one Eventbrite ticket")
    if not any(r["provider"] == "google_calendar" and r["kind"] == "busy" for r in mine):
        errors.append(f"{pool_id}: Maya needs calendar busy blocks")
    return errors


def check_demo(pool_id, pool, demo, personas, truth, plans, venues) -> list[str]:
    errors: list[str] = []
    if demo["poolId"] != pool_id:
        errors.append(f"{pool_id}/demo.json: poolId mismatch")
    ids = [demo["heroPlanId"], demo["nudgePlanId"], *demo["featuredPlanIds"]]
    users = [demo["liveUserId"], *demo["counterpartIds"], demo.get("privateCounterpartId") or demo["liveUserId"]]
    errors += [f"{pool_id}/demo.json: unknown plan {x}" for x in ids if x not in plans]
    errors += [f"{pool_id}/demo.json: unknown user {u}" for u in users if u not in personas]
    if errors:
        return errors
    featured = demo["featuredPlanIds"]
    if len(set(featured)) != len(featured):
        errors.append(f"{pool_id}/demo.json: duplicate featuredPlanIds")
    if demo["heroPlanId"] not in featured or demo["nudgePlanId"] not in featured:
        errors.append(f"{pool_id}/demo.json: featuredPlanIds must include hero and nudge plans")

    home = personas[maya.MAYA_ID]["homeLocation"] if maya.MAYA_ID in personas else demo["fakeLocation"]
    for pid in featured:
        errors += [f"{pool_id}/demo.json: {e}" for e in maya_problems(plans[pid], venues[plans[pid]["venueId"]], home)]

    hero, nudge = plans[demo["heroPlanId"]], plans[demo["nudgePlanId"]]
    if hero["cost"]["kind"] != "prepaid":
        errors.append(f"{pool_id}/demo.json: hero plan must be prepaid")
    if nudge["cost"]["kind"] != "free":
        errors.append(f"{pool_id}/demo.json: nudge plan must be free")
    if nudge["origin"] != "signal":
        errors.append(f"{pool_id}/demo.json: nudge plan origin must be signal")
    if pool["mode"] == "city" and nudge["venueId"] != maya.FREQUENT_VENUE:  # CONTRACTS Decisions: city only
        errors.append(f"{pool_id}/demo.json: nudge plan must be at Maya's frequent place {maya.FREQUENT_VENUE}")

    maya_top = {k for k, _ in sorted(maya.GROUND_TRUTH.items(), key=lambda kv: -kv[1])[:MAYA_TOP_N]}
    joins = set(hero.get("seedJoinIds", []))
    live = demo["liveUserId"]
    if personas[live]["profileVisibility"] != "public":
        errors.append(f"{pool_id}/demo.json: liveUserId must be public")
    if len({i["id"] for i in truth[live]["interests"]} & maya_top) < 2:
        errors.append(f"{pool_id}/demo.json: liveUserId shares fewer than 2 of Maya's top interests")
    if live in joins:
        errors.append(f"{pool_id}/demo.json: liveUserId must not be pre-joined to the hero plan")
    if live not in demo["counterpartIds"]:
        errors.append(f"{pool_id}/demo.json: liveUserId must be in counterpartIds")
    priv = demo.get("privateCounterpartId")
    if not priv or personas[priv]["profileVisibility"] != "private" or priv not in joins:
        errors.append(f"{pool_id}/demo.json: privateCounterpartId must be private and pre-joined to the hero plan")
    elif not {i["id"] for i in truth[priv]["interests"]} & set(maya.GROUND_TRUTH):
        errors.append(f"{pool_id}/demo.json: privateCounterpartId shares no interest with Maya")
    if not any(personas[u]["profileVisibility"] == "private" for u in demo["counterpartIds"]):
        errors.append(f"{pool_id}/demo.json: counterpartIds need a private profile")
    if not joins <= set(demo["counterpartIds"]) or len(joins) + 1 < hero["size"]["min"]:
        errors.append(f"{pool_id}/demo.json: counterpartIds cannot form the hero plan with Maya")
    if haversine_km(demo["fakeLocation"], home if pool["mode"] == "city" else pool["center"]) > 1.0:
        errors.append(f"{pool_id}/demo.json: fakeLocation not near Maya's neighborhood / the event")
    return errors


def _check_no_private_leak(pool_id: str, seed_dir: Path, latent: list[dict], leaves: dict) -> list[str]:
    """No hidden-trait field, leaf taxonomy ID or trait value from sim_private appears under data/seed/.
    (Plans carry level-2 targets by contract; leaves never.)"""
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
                errors.append(f"{pool_id}: hidden trait value {value} ({row['userId']}.{key}) appears in data/seed")
    return errors
