"""Extraction (PRD-2 §3.1): interests and signals from activity + active connector records. Implements ports.Extractor.

Muse proposes (structured output, effort high), rules add place/routine/ticket signals, Laya gates sensitivity and
sets strength. Without Muse the keyword fallback runs. Output is owner-only; busy records are never sent anywhere.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from collections import Counter
from collections.abc import Callable
from datetime import datetime, timedelta
from functools import cache
from pathlib import Path

import yaml

from cg_api.laya import load_questions, render
from cg_api.muse import Unavailable

log = logging.getLogger("cg_api.muse.extract")
MAX_INTERESTS = 12
RULE_KINDS = {"frequent_place", "saved_place", "routine", "ticket"}
_TEXT = ("text", "photoCaption", "groupName", "eventName", "pageName", "listingTitle")

# fallback only: words people use that are not the taxonomy label
ALIASES = {
    "clay": "arts_crafts.ceramics.wheel_throwing",
    "pottery": "arts_crafts.ceramics.wheel_throwing",
    "ceramic": "arts_crafts.ceramics.wheel_throwing",
    "handbuild": "arts_crafts.ceramics.handbuilding",
    "paintbrush": "arts_crafts.visual_art.painting",
    "sketch": "arts_crafts.visual_art.drawing_sketching",
    "photo walk": "arts_crafts.photography.street_photography",
    "camera": "arts_crafts.photography.street_photography",
    "garden": "outdoors.gardening.community_gardens",
    "planting": "outdoors.gardening.community_gardens",
    "basil": "outdoors.gardening.houseplants",
    "book swap": "social_community.neighborhood.book_swaps",
    "market": "social_community.neighborhood.farmers_markets",
    "hackathon": "tech_career.building.hackathons",
    "coffee": "food_drink.coffee_tea.specialty_coffee",
    "recipe": "food_drink.cooking.home_cooking",
    "board game": "games.board_games.strategy_games",
    "game night": "games.board_games.strategy_games",
    "coast": "outdoors.hiking.coastal_hikes",
    "hike": "outdoors.hiking.day_hikes",
    "trail": "outdoors.hiking.day_hikes",
    "boulder": "outdoors.climbing.bouldering",
    "climb": "outdoors.climbing.bouldering",
    "trivia": "social_community.nights_out.trivia_nights",
    "ramen": "food_drink.eating_out.ramen_noodles",
    "run club": "sports_fitness.running.run_clubs",
    "jog": "sports_fitness.running.casual_jogging",
    "bike": "outdoors.cycling.group_rides",
    "surf": "outdoors.water.surfing",
    "concert": "music.live_music.concerts",
}


@cache
def taxonomy(contracts_dir: Path) -> dict[str, dict]:
    """Every node: id -> {label, path (labels), level, sensitive, leaf}."""
    out: dict[str, dict] = {}

    def walk(node_id, node, path, sensitive):
        label = node if isinstance(node, str) else node["label"]
        sens = sensitive or (not isinstance(node, str) and node.get("sensitive", False))
        kids = {} if isinstance(node, str) else node.get("children", {})
        out[node_id] = {
            "label": label,
            "path": [*path, label],
            "level": len(path) + 1,
            "sensitive": sens,
            "leaf": not kids,
        }
        for k, v in kids.items():
            walk(f"{node_id}.{k}", v, [*path, label], sens)

    for k, v in yaml.safe_load((Path(contracts_dir) / "taxonomy.yaml").read_text())["tree"].items():
        walk(k, v, [], False)
    return out


def _text(a: dict) -> str:
    return " ".join(a[k] for k in _TEXT if a.get(k))


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9+ ]", " ", s.lower())


def keyword_interests(activity: list[dict], extra_texts: list[str], tax: dict) -> list[dict]:
    """Fallback: taxonomy leaf labels and ALIASES found in the text. Deterministic."""
    needles = {_norm(v["label"]).strip().removesuffix("s"): k for k, v in tax.items() if v["leaf"]}
    needles.update(ALIASES)
    hits: Counter = Counter()
    first: dict[str, str] = {}
    for kind, text in [(a["kind"], _text(a)) for a in activity] + [("connector", t) for t in extra_texts]:
        t = f" {_norm(text)} "
        for n, leaf in needles.items():
            if re.search(rf"\b{re.escape(n)}", t):
                hits[leaf] += 1
                first.setdefault(leaf, kind)
    out = []
    for leaf, n in sorted(hits.items(), key=lambda x: (-x[1], x[0]))[:MAX_INTERESTS]:
        src = "connector" if first[leaf] == "connector" else "activity"
        how = {
            "group_membership": "a group you're in",
            "event_rsvp": "events you RSVP'd to",
            "connector": "places you've been",
        }.get(first[leaf], "your posts")
        out.append(
            {"id": leaf, "weight": round(min(1.0, 0.4 + 0.15 * n), 2), "evidence": f"From {how}.", "source": src}
        )
    return out


def rule_signals(records: list[dict], venue: Callable[[str], dict | None], visits_30d: int) -> list[dict]:
    """frequent_place / saved_place / routine / ticket, no model needed (PRD-2 §3.1)."""
    out = []
    visits = [r for r in records if r["kind"] == "place_visit" and r.get("venueId")]
    if visits:
        # ponytail: "last 30 days" anchored on the newest record, so the result never depends on the clock
        end = max(datetime.fromisoformat(r["at"]) for r in visits)
        recent = [r for r in visits if datetime.fromisoformat(r["at"]) > end - timedelta(30)]
        by_venue: dict[str, list[dict]] = {}
        for r in recent:
            by_venue.setdefault(r["venueId"], []).append(r)
        for vid, rs in sorted(by_venue.items()):
            if len(rs) >= visits_30d:
                name = (venue(vid) or {}).get("name", "A place you like")
                out.append(
                    {
                        "kind": "frequent_place",
                        "provider": rs[0]["provider"],
                        "venueId": vid,
                        "recordIds": [r["recordId"] for r in rs],
                        "label": f"You've been to {name} {len(rs)} times this month",
                        "pattern": f"{len(rs)} visits in 30 days",
                        "strength": round(min(1.0, 0.5 + 0.1 * len(rs)), 2),
                        "observedAt": max(r["at"] for r in rs),
                    }
                )
    for r in records:
        base = {
            "provider": r["provider"],
            "recordIds": [r["recordId"]],
            "observedAt": r["at"],
            "venueId": r.get("venueId"),
            "placeName": r.get("placeName"),
            "placeKind": r.get("placeKind"),
        }
        name = (venue(r["venueId"]) or {}).get("name") if r.get("venueId") else r.get("placeName")
        if r["kind"] == "saved_place" and name:
            out.append(
                {**base, "kind": "saved_place", "label": f"You saved {name}", "pattern": "Saved place", "strength": 0.5}
            )
        elif r["kind"] == "routine" and r.get("routine"):
            ro = r["routine"]
            area = f" around {ro['area']}" if ro.get("area") else ""
            out.append(
                {
                    **base,
                    "kind": "routine",
                    "label": f"Your {ro['day']} {ro['part']} {ro['activity']}{area}",
                    "pattern": f"Weekly {ro['activity']} on {ro['day']} {ro['part']}s",
                    "strength": 0.7,
                    "routineActivity": ro["activity"],
                }
            )
        elif r["kind"] == "ticket" and r.get("eventName"):
            out.append(
                {
                    **base,
                    "kind": "ticket",
                    "label": f"You have a ticket to {r['eventName']}",
                    "pattern": "Ticket for an upcoming event",
                    "strength": 0.8,
                }
            )
    return out


# ---------- Muse structured output ----------
def _schema(signal_kinds: list[str]) -> dict:
    nullable = {"type": ["string", "null"]}
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["interests", "signals"],
        "properties": {
            "interests": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["id", "evidence", "source"],
                    "properties": {
                        "id": {"type": "string"},
                        "evidence": {"type": "string"},
                        "source": {"enum": ["activity", "connector"]},
                    },
                },
            },
            "signals": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["recordIds", "kind", "label", "interestIds", "venueId", "strength"],
                    "properties": {
                        "recordIds": {"type": "array", "items": {"type": "string"}},
                        "kind": {"enum": signal_kinds},
                        "label": {"type": "string"},
                        "interestIds": {"type": "array", "items": {"type": "string"}},
                        "venueId": nullable,
                        "strength": {"type": "number"},
                    },
                },
            },
        },
    }


class Extractor:
    def __init__(
        self,
        muse,
        laya,
        contracts_dir: Path,
        *,
        venue: Callable[[str], dict | None] = lambda _: None,
        visits_30d: int = 3,
        threshold: float = 0.85,
        batch_timeout_s: float = 60,
    ):
        self.muse, self.laya, self.dir, self.venue = muse, laya, Path(contracts_dir), venue
        self.visits_30d, self.threshold, self.batch_timeout_s = visits_30d, threshold, batch_timeout_s
        self.tax = taxonomy(self.dir)
        self.kinds = list(yaml.safe_load((self.dir / "connectors.yaml").read_text())["signalKinds"])
        # ponytail: in-process cache by content hash; add a .cache/ file when real-Muse seed load passes 60 s
        self.cache: dict[str, dict] = {}

    async def extract(self, user_id: str, activity: list[dict], records: list[dict]) -> dict:
        records = [r for r in records if r["kind"] != "busy"]  # busy blocks never reach Muse or Laya
        key = hashlib.sha256(json.dumps([activity, records], sort_keys=True).encode()).hexdigest()
        if key not in self.cache:
            self.cache[key] = await self._extract(activity, records)
        return json.loads(json.dumps(self.cache[key]))  # callers may mutate

    async def _muse(self, activity, records) -> dict | None:
        leaves = {k: v["label"] for k, v in self.tax.items() if v["leaf"]}
        facts = {
            "activity": [{"kind": a["kind"], "at": a["at"], "text": _text(a)} for a in activity],
            "records": [
                {k: v for k, v in r.items() if k != "userId"}
                | ({"venueName": (self.venue(r["venueId"]) or {}).get("name")} if r.get("venueId") else {})
                for r in records
            ],
            "taxonomy": leaves,
        }
        task = (
            f"From this person's activity and connected records, list at most {MAX_INTERESTS} interests using "
            "only taxonomy leaf IDs, each with a short second-person evidence line, and signals worth a plan. "
            "Use only record IDs and kinds given."
        )
        try:
            r = await self.muse.respond(
                "extract",
                [{"role": "user", "content": f"{task}\n{json.dumps(facts)}"}],
                schema=_schema(self.kinds),
                effort="high",
                timeout_s=self.batch_timeout_s,
            )
            j = r["json"]
            ok = isinstance(j, dict) and isinstance(j.get("interests"), list) and isinstance(j.get("signals"), list)
            return j if ok else None
        except Unavailable:
            return None

    def _accept(self, m: dict, activity: list[dict], records: list[dict]) -> tuple[list[dict], list[dict]]:
        ids = {r["recordId"] for r in records}
        seen, interests, signals = set(), [], []
        for i in m["interests"]:
            if (self.tax.get(i["id"]) or {}).get("leaf") and i["id"] not in seen:  # reject unknown IDs
                seen.add(i["id"])
                src = i["source"] if i["source"] in ("activity", "connector") else "activity"
                interests.append({"id": i["id"], "evidence": str(i["evidence"]), "source": src, "weight": 0.5})
        for s in m["signals"]:
            if s["kind"] in RULE_KINDS or s["kind"] not in self.kinds or not set(s["recordIds"]) <= ids:
                continue
            rs = [r for r in records if r["recordId"] in s["recordIds"]]
            signals.append(
                {
                    "kind": s["kind"],
                    "label": str(s["label"]),
                    "pattern": str(s["label"]),
                    "recordIds": list(s["recordIds"]),
                    "venueId": s["venueId"] if s["venueId"] and self.venue(s["venueId"]) else None,
                    "interestIds": [x for x in s["interestIds"] if x in self.tax],
                    "provider": rs[0]["provider"] if rs else "facebook",
                    "observedAt": max(
                        (r["at"] for r in rs), default=max((a["at"] for a in activity), default="1970-01-01T00:00:00Z")
                    ),
                    "strength": min(max(float(s["strength"]), 0.0), 1.0),
                }
            )
        return interests[:MAX_INTERESTS], signals

    async def _extract(self, activity: list[dict], records: list[dict]) -> dict:
        place_texts = [(self.venue(r["venueId"]) or {}).get("name", "") for r in records if r.get("venueId")]
        place_texts += [r.get("eventName") or r.get("placeName") or "" for r in records]
        place_texts += [(r.get("routine") or {}).get("activity", "") for r in records]
        signals = rule_signals(records, self.venue, self.visits_30d)
        m = await self._muse(activity, records)
        try:
            interests, extra = self._accept(m, activity, records) if m else (None, [])
        except (KeyError, TypeError, ValueError) as e:  # malformed item: whole answer falls back
            log.warning("extraction answer rejected: %s", e)
            interests, extra = None, []
        if interests is None:
            interests = keyword_interests(activity, place_texts, self.tax)
        signals += extra
        for s in signals:
            s.setdefault("interestIds", [i["id"] for i in keyword_interests([], [s["label"]], self.tax)][:3])
        gated = [await self._gate_interest(i) for i in interests]
        return {"interests": gated, "signals": [await self._gate_signal(s, gated) for s in signals]}

    async def _yes(self, question: str, state: dict) -> bool:
        """Laya decisive answer, else Muse escalation; unknown counts as no (taxonomy/venue flags still apply)."""
        try:
            p, decisive = await self.laya.ask(question, state)
        except Unavailable:
            p, decisive = 0.5, False
        if decisive:
            return p >= self.threshold
        try:
            q = load_questions(self.dir)["questions"][question]["instructions"]
            r = await self.muse.respond(
                f"escalate.{question}",
                [{"role": "user", "content": f"{render(question, state, self.dir)}\n\n{q}"}],
                schema={
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["yes"],
                    "properties": {"yes": {"type": "boolean"}},
                },
            )
            return (r["json"] or {}).get("yes") is True
        except Unavailable:
            return False

    async def _gate_interest(self, i: dict) -> dict:
        node = self.tax[i["id"]]
        state = {"label": node["label"], "path": " > ".join(node["path"]), "evidence": i["evidence"]}
        sensitive = node["sensitive"] or await self._yes("sensitive_interest", state)
        try:
            weight, _ = await self.laya.ask("interest_strength", state)
        except Unavailable:
            weight = i["weight"]
        return {
            "id": i["id"],
            "weight": round(weight, 2),
            "evidence": i["evidence"],
            "source": i["source"],
            "sensitive": sensitive,
            "visibility": "hidden" if sensitive else "shown",
        }

    async def _gate_signal(self, s: dict, interests: list[dict]) -> dict:
        v = self.venue(s["venueId"]) if s.get("venueId") else None
        unresolved = bool(s.get("venueId")) and v is None  # unknown venue: can't check its flag, so fail closed (P4)
        sensitive = (
            unresolved or bool(v and v.get("sensitive")) or any(self.tax[x]["sensitive"] for x in s["interestIds"])
        )
        name = (v or {}).get("name") or s.get("placeName")
        if not sensitive and name and s["kind"] in ("frequent_place", "saved_place", "post", "ticket"):
            kind = (v or {}).get("kind") or s.get("placeKind") or "unknown"
            state = {"place": {"placeName": name, "placeKind": kind, "pattern": s["pattern"]}}
            sensitive = await self._yes("sensitive_place", state)
        if sensitive:  # a sensitive place hides the interests it produced (P4)
            for i in interests:
                if i["id"] in s["interestIds"]:
                    i.update(sensitive=True, visibility="hidden")
        out = {
            k: s[k]
            for k in ("kind", "provider", "label", "interestIds", "venueId", "recordIds", "strength", "observedAt")
            if k in s
        }
        return {**out, "sensitive": sensitive, "visibility": "hidden" if sensitive else "shown"}
