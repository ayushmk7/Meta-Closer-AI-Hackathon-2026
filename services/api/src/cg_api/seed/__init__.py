"""Seed load (PRD-2 §3.1): data/seed/<poolId>/ -> store, plus per-user derivation (signals, busy, extraction).

Falls back to the tiny built-in seed (./tiny) when data/seed/<poolId>/ does not exist (AGENT_RULES R4).
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path

from cg_api import contracts
from cg_api.ports import ports
from cg_api.settings import get_settings
from cg_api.store import bridge, store

log = logging.getLogger("cg_api.seed")
TINY = Path(__file__).parent / "tiny"
# Demo clock for rule-based signals (CONTRACTS Decisions: horizon anchor 2026-11-13T12:00:00-08:00), so a
# reload gives the same signals whatever the wall clock says (D2).
ANCHOR = datetime(2026, 11, 13, 20, 0, tzinfo=UTC)
_FILES = {"personas": "persona", "activity": "activity", "connectors": "connector_record", "venues": "venue",
          "plans": "plan"}  # fmt: skip


def seed_dir(pool_id: str) -> Path:
    d = get_settings().data_dir / "seed" / pool_id
    if (d / "pool.json").exists():
        return d
    if json.loads((TINY / "pool.json").read_text())["poolId"] == pool_id:
        log.warning("data/seed/%s missing; using the tiny built-in seed", pool_id)
        return TINY
    raise FileNotFoundError(pool_id)


def _read(d: Path) -> dict:
    """Parse and schema-validate every seed file. Raises ValueError listing the first bad lines."""
    out, bad = {}, []
    for single, schema in (("pool", "pool"), ("demo", "demo")):
        out[single] = json.loads((d / f"{single}.json").read_text())
        bad += [f"{single}.json: {e.message}" for e in contracts.seed_validator(schema).iter_errors(out[single])]
    for name, schema in _FILES.items():
        v, rows = contracts.seed_validator(schema), []
        path = d / f"{name}.jsonl"
        for n, line in enumerate(path.read_text().splitlines() if path.exists() else [], 1):
            if line.strip():
                row = json.loads(line)
                bad += [f"{name}.jsonl:{n}: {e.message}" for e in v.iter_errors(row)]
                rows.append(row)
        out[name] = rows
    if bad:
        raise ValueError(f"{len(bad)} invalid seed rows: " + "; ".join(bad[:5]))
    return out


def new_user(persona: dict, synthetic: bool, mode: str, pool_id: str) -> dict:
    p = get_settings().params
    m = p["muse"]
    return {
        "persona": persona,
        "synthetic": synthetic,
        "optedIn": synthetic,
        "setupComplete": synthetic,
        "mode": mode if synthetic else None,
        "poolId": pool_id if synthetic else None,
        "profileVisibility": persona["profileVisibility"],
        "neighborhood": persona["neighborhood"],
        "groupSize": dict(persona["groupSize"]),
        "availability": list(persona["availability"]),
        "travel": dict(
            persona.get("travel") or {"maxMinutes": p["travel"]["defaultMaxMinutes"], "modes": ["transit", "walk"]}
        ),
        "museSettings": {
            "spendWithoutAskingCents": m["spendWithoutAskingCentsDefault"],
            "autoReschedule": m["autoRescheduleDefault"],
            "autoBackfill": m["autoBackfillDefault"],
            "calendarHolds": m["calendarHoldsDefault"],
            "leaveByReminders": m["leaveByRemindersDefault"],
        },
        "interests": {},
        "signals": {},
        "connectors": {},
        "busy": [],
        "muted": set(),
        "removedInterests": set(),
        "deletedSignals": set(),
        "unlocks": [],
    }


async def load(pool_id: str, reextract: bool = False, job: dict | None = None) -> dict:
    data = _read(seed_dir(pool_id))
    pool, demo = data["pool"], data["demo"]
    mode, maya = pool["mode"], demo["mayaId"]
    store.__init__()  # fresh world
    store.pool, store.demo, store.seed_dir = pool, demo, str(seed_dir(pool_id))
    store.venues = {v["venueId"]: v for v in data["venues"]}
    ports.extractor.venue = lambda vid: store.venues.get(vid)  # late-bound: survives reset and reload
    for persona in data["personas"]:
        store.users[persona["userId"]] = new_user(persona, persona["userId"] != maya, mode, pool["poolId"])
    for kind in ("activity", "connectors"):
        target = store.activity if kind == "activity" else store.records
        for row in data[kind]:
            if row["userId"] in store.users:  # records for unknown users are ignored (CONTRACTS Decisions)
                target.setdefault(row["userId"], []).append(row)
    users = list(store.users.values())
    for i, u in enumerate(users):
        if u["synthetic"]:
            for provider in u["persona"]["connectedProviders"]:
                u["connectors"][provider] = {
                    "connectedAt": u["persona"]["joinedAt"],
                    "lastSyncAt": u["persona"]["joinedAt"],
                }
            await derive(u["persona"]["userId"], reextract=reextract)
        if job is not None:
            job["progress"] = round((i + 1) / len(users), 3)
    for plan in data["plans"]:
        store.plans[plan["planId"]] = {**plan, "status": "open"}
        for k, uid in enumerate(plan.get("seedJoinIds", [])):
            if uid in store.users:
                jid = f"jn_{plan['planId'].removeprefix('pl_')}_{k}"
                store.joins[jid] = {"joinId": jid, "planId": plan["planId"], "userId": uid, "status": "interested",
                                    "createdAt": pool.get("generatedAt") or ANCHOR.strftime("%Y-%m-%dT%H:%M:%SZ")}  # fmt: skip
    d = get_settings().params["demo"]
    store.demo_state = {
        "counterpart": d["counterpartDefault"],
        "liveUserId": demo["liveUserId"],
        "forcedYes": d["forcedYesDefault"],
        "relaxCheckin": d["relaxCheckinDefault"],
        "failNextBooking": False,
        "simulatedPayments": d["simulatedPayments"],
        "fakeLocation": demo["fakeLocation"],
    }
    _maybe_tables(pool["poolId"])
    bridge.build()  # slice C's World shares plans/joins/...; must run before the snapshot
    store.snapshot()
    summary = {
        "poolId": pool["poolId"],
        "users": len(store.users),
        "venues": len(store.venues),
        "plans": len(store.plans),
    }
    log.info("seed loaded from %s: %s", store.seed_dir, summary)
    return summary


def _maybe_tables(pool_id: str) -> None:
    from cg_api.internal.pools import load_tables  # local: internal imports seed

    try:
        load_tables(pool_id)
    except FileNotFoundError:
        log.info("no data/laya_tables/%s yet; Laya rows are computed live", pool_id)


# ---------- per-user derivation ----------
def active_records(uid: str) -> list[dict]:
    connected = store.users[uid]["connectors"]
    return [r for r in store.records.get(uid, []) if r["provider"] in connected]


async def derive(uid: str, reextract: bool = False) -> None:
    """Recompute busy blocks, rule-based signals and extracted interests from active records + activity."""
    u = store.users[uid]
    recs = active_records(uid)
    u["busy"] = [b for b in u["busy"] if b["source"] == "device_calendar"] + [
        {"start": r["at"], "end": r["end"], "source": r["provider"]} for r in recs if r["kind"] == "busy" and "end" in r
    ]
    old = u["signals"]
    sigs = {s["signalId"]: s for s in rule_signals(uid, recs)}
    extracted = await _extract(uid, [r for r in recs if r["kind"] != "busy"], reextract)
    for s in extracted.get("signals", []):
        s.setdefault("signalId", _sid(uid, s.get("kind", "post"), ",".join(s.get("recordIds", []))))
        sigs.setdefault(s["signalId"], s)
    for sid, s in sigs.items():  # keep the owner's visibility choice across re-derivation
        if sid in old:
            s["visibility"] = old[sid]["visibility"]
    u["signals"] = {sid: s for sid, s in sigs.items() if sid not in u["deletedSignals"]}
    _apply_interests(u, extracted.get("interests", []))
    bridge.sync(uid)


def _apply_interests(u: dict, items: list[dict]) -> None:
    tax = contracts.taxonomy()
    kept = {k: v for k, v in u["interests"].items() if v["source"] in ("manual", "muse_bar")}
    for it in items:
        node = tax.get(it.get("id", ""))
        if node and node["id"] in u["removedInterests"]:
            continue
        if not node or node["level"] != 3:
            log.warning("extraction returned unknown or non-leaf interest %r; dropped", it.get("id"))
            continue
        sensitive = node["sensitive"] or bool(it.get("sensitive"))
        prev = u["interests"].get(node["id"])
        kept[node["id"]] = {
            "id": node["id"],
            "weight": float(min(1.0, max(0.0, it.get("weight", 0.5)))),
            "visibility": prev["visibility"] if prev else ("hidden" if sensitive else it.get("visibility", "shown")),
            "sensitive": sensitive,
            "source": it.get("source", "activity"),
            **({"evidence": it["evidence"]} if it.get("evidence") else {}),
            **({"provider": it["provider"]} if it.get("provider") else {}),
        }
    u["interests"] = kept


async def _extract(uid: str, records: list[dict], reextract: bool) -> dict:
    """ports.extractor, cached by content hash in services/api/.cache/extract/."""
    payload = {"activity": store.activity.get(uid, []), "records": records}
    key = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    path = Path(__file__).resolve().parents[3] / ".cache" / "extract" / f"{type(ports.extractor).__name__}-{key}.json"
    if path.exists() and not reextract:
        return json.loads(path.read_text())
    out = await ports.extractor.extract(uid, payload["activity"], records)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out))
    return out


def _sid(uid: str, kind: str, key: str) -> str:
    return "si_" + hashlib.sha256(f"{uid}|{kind}|{key}".encode()).hexdigest()[:10]


def _signal(uid, provider, kind, key, label, venue_id, observed, strength, record_ids, sensitive=False) -> dict:
    return {
        "signalId": _sid(uid, kind, key),
        "provider": provider,
        "kind": kind,
        "label": label,
        "interestIds": [],  # ponytail: rule signals carry no interests; extraction (slice D) adds them
        "venueId": venue_id,
        "observedAt": observed,
        "strength": round(strength, 3),
        "visibility": "hidden" if sensitive else "shown",
        "sensitive": sensitive,
        "recordIds": record_ids,
    }


def rule_signals(uid: str, recs: list[dict]) -> list[dict]:
    """frequent_place, saved_place, routine and ticket signals; no model needed (PRD-2 §3.1)."""
    p = get_settings().params["nudges"]
    out, visits = [], defaultdict(list)
    since = ANCHOR - timedelta(days=30)
    for r in recs:
        venue = store.venues.get(r.get("venueId", ""))
        sensitive = bool(venue and venue.get("sensitive"))
        place = (
            (f"a {venue['kind'].replace('_', ' ')}" if sensitive else venue["name"])
            if venue
            else r.get("placeName", "a place")
        )
        if r["kind"] == "place_visit" and venue and _dt(r["at"]) >= since:
            visits[venue["venueId"]].append(r)
        elif r["kind"] == "saved_place":
            out.append(_signal(uid, r["provider"], "saved_place", r["recordId"], f"Saved {place}", r.get("venueId"),
                               r["at"], 0.5, [r["recordId"]], sensitive))  # fmt: skip
        elif r["kind"] == "routine":
            rt = r["routine"]
            label = f"{rt['activity'].replace('_', ' ').capitalize()} on {rt['day'].capitalize()} {rt['part']}s"
            label += f" around {rt['area']}" if rt.get("area") else ""
            key = f"{rt['activity']}|{rt['day']}|{rt['part']}"
            out.append(
                _signal(uid, r["provider"], "routine", key, label, r.get("venueId"), r["at"], 0.7, [r["recordId"]])
            )
        elif r["kind"] == "ticket" and _dt(r["at"]) >= ANCHOR:
            out.append(_signal(uid, r["provider"], "ticket", r["recordId"], f"Ticket for {r.get('eventName', 'an event')}",
                               r.get("venueId"), r["at"], 0.8, [r["recordId"]], sensitive))  # fmt: skip
    for vid, rs in sorted(visits.items()):
        if len(rs) >= p["frequentPlaceVisits30d"]:
            venue = store.venues[vid]
            sensitive = bool(venue.get("sensitive"))
            label = (
                f"Regular visits to a {venue['kind'].replace('_', ' ')}"
                if sensitive
                else f"{len(rs)} visits to {venue['name']} this month"
            )
            last = max(r["at"] for r in rs)
            strength = min(1.0, len(rs) / (2 * p["frequentPlaceVisits30d"]) + 0.2)
            out.append(_signal(uid, rs[0]["provider"], "frequent_place", vid, label, vid, last, strength,
                               [r["recordId"] for r in rs], sensitive))  # fmt: skip
    # dedupe routines (same routine on many records): last record wins
    return list({s["signalId"]: s for s in out}.values())


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s)
