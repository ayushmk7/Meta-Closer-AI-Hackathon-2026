"""Read-only ground-truth API for other sim slices (--use-ground-truth stand-in for
GET /internal/v1/pools/{id}/export). Reads committed data/seed + data/sim_private; never writes."""

from __future__ import annotations

import json
from pathlib import Path

from cg_sim.contracts import data_dir
from cg_sim.matching_adapter import ACTIVITY_INTERESTS
from cg_sim.seed.generate import ground_truth_export

ROUTINE_INTERESTS = {"run": ["sports_fitness.running"], "ride": ["outdoors.cycling"], "walk": ["travel.local_exploring"]}
SIGNAL_STRENGTH = 0.8


def _jsonl(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text().splitlines() if x.strip()]


def load_ground_truth(pool_id: str, root: Path | None = None) -> dict[str, dict]:
    """userId -> ground_truth.jsonl row (role, scene, archetypes, interests, noise, frequentPlaces, routines, sensitivePlace)."""
    root = root or data_dir()
    return {r["userId"]: r for r in _jsonl(root / "sim_private" / pool_id / "ground_truth.jsonl")}


def ground_truth_signals(pool_id: str, root: Path | None = None) -> dict[str, dict]:
    """userId -> {frequentPlaces: [venueId], routines: [{activity, day, part}], sensitivePlace: venueId | None}.
    Seeded truth, regardless of which providers the person connected."""
    return {
        uid: {
            "frequentPlaces": list(t.get("frequentPlaces", [])),
            "routines": list(t.get("routines", [])),
            "sensitivePlace": t.get("sensitivePlace"),
        }
        for uid, t in load_ground_truth(pool_id, root).items()
    }


def load_ground_truth_export(pool_id: str, root: Path | None = None, with_signals: bool = True) -> dict:
    """pool_export.schema.json dict from committed files. With signals: each user's `signals` holds what the
    backend would extract from connected providers (google_maps -> frequent places incl. sensitive ones as
    hidden+sensitive; strava -> routines)."""
    root = root or data_dir()
    seed_dir = root / "seed" / pool_id
    personas = _jsonl(seed_dir / "personas.jsonl")
    truth = list(load_ground_truth(pool_id, root).values())
    export = ground_truth_export(pool_id, personas, truth, _jsonl(seed_dir / "connectors.jsonl"))
    if not with_signals:
        return export
    venues = {v["venueId"]: v for v in _jsonl(seed_dir / "venues.jsonl")}
    signals = ground_truth_signals(pool_id, root)
    providers = {p["userId"]: set(p["connectedProviders"]) for p in personas}
    for u in export["users"]:
        uid, out = u["userId"], []
        s, conn = signals.get(uid, {}), providers.get(uid, set())

        def add(provider, kind, interests, venue_id, sensitive, out=out, uid=uid):
            out.append({
                "signalId": f"si_{uid[2:]}_{len(out) + 1:02d}", "provider": provider, "kind": kind,
                "interestIds": interests, "venueId": venue_id, "strength": SIGNAL_STRENGTH,
                "visibility": "hidden" if sensitive else "shown", "sensitive": sensitive,
            })

        if "google_maps" in conn:
            for vid in s.get("frequentPlaces", []):
                types = venues[vid]["activityTypes"]
                add("google_maps", "frequent_place", sorted({i for t in types for i in ACTIVITY_INTERESTS.get(t, [])}), vid, False)
            if s.get("sensitivePlace"):
                add("google_maps", "frequent_place", [], s["sensitivePlace"], True)
        if "strava" in conn:
            for r in s.get("routines", []):
                add("strava", "routine", ROUTINE_INTERESTS.get(r["activity"], []), None, False)
        u["signals"] = out
    return export
