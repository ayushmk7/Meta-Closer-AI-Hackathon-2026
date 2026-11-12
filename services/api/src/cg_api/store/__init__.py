"""In-memory world: one pool loaded from a seed, plus every live interaction. Owned by slice A.

Every slice reads and writes `store` directly; the shapes below are the shared convention.
ponytail: single process, no locks, no persistence. Demo reset = restore the post-seed deepcopy snapshot.

users[uid] = {
    "persona": <persona.schema.json record>, "synthetic": bool,
    "optedIn", "setupComplete": bool, "mode", "poolId": str | None,
    "profileVisibility", "neighborhood", "groupSize", "availability", "travel", "museSettings",
    "interests": {interestId: {"id", "weight", "visibility", "sensitive", "source", "evidence"?, "provider"?}},
    "signals": {signalId: {"signalId", "provider", "kind", "label", "interestIds", "venueId", "observedAt",
                           "strength", "visibility", "sensitive", "recordIds"}},
    "connectors": {provider: {"connectedAt", "lastSyncAt"}},
    "busy": [{"start", "end", "source"}],       # source = provider the block came from
    "muted": set[signalId], "blocked": set[uid], "unlocks": [Unlock],
}
records[uid] = seeded connector records (all providers; active only while that provider is connected)
activity[uid] = seeded Facebook activity
directives[uid][key] = CalendarDirective (written by plans/meetups, served by syncCalendar)
applied[uid][key] = desired value the device last reported applied ok
"""

from __future__ import annotations

import copy
import itertools
from dataclasses import dataclass, field
from datetime import UTC, datetime


def now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class Store:
    pool: dict | None = None  # pool.json
    demo: dict | None = None  # demo.json
    seed_dir: str | None = None
    laya_tables_dir: str | None = None
    users: dict[str, dict] = field(default_factory=dict)
    records: dict[str, list[dict]] = field(default_factory=dict)
    activity: dict[str, list[dict]] = field(default_factory=dict)
    venues: dict[str, dict] = field(default_factory=dict)
    plans: dict[str, dict] = field(default_factory=dict)  # plan.schema record + "status"
    joins: dict[str, dict] = field(default_factory=dict)  # {joinId, planId, userId, status, createdAt, ...}
    meetups: dict[str, dict] = field(default_factory=dict)
    threads: dict[str, dict] = field(default_factory=dict)
    messages: dict[str, list[dict]] = field(default_factory=dict)  # threadId -> messages
    approvals: dict[str, dict] = field(default_factory=dict)
    connections: dict[str, dict] = field(default_factory=dict)  # {connectionId, a, b, status, ...}
    nudges: dict[str, dict] = field(default_factory=dict)
    reports: dict[str, dict] = field(default_factory=dict)
    directives: dict[str, dict[str, dict]] = field(default_factory=dict)
    applied: dict[str, dict[str, str]] = field(default_factory=dict)
    _ids: itertools.count = field(default_factory=lambda: itertools.count(1))
    _snapshot: dict | None = None

    def new_id(self, prefix: str) -> str:
        """Fresh live ID, e.g. new_id('jn') -> 'jn_l0001'. Never collides with seed IDs (no 'l' prefix there)."""
        return f"{prefix}_l{next(self._ids):04d}"

    def user(self, uid: str) -> dict:
        return self.users[uid]

    # ---------- snapshot / reset ----------
    _STATE = ("pool", "demo", "seed_dir", "laya_tables_dir", "users", "records", "activity", "venues", "plans",
              "joins", "meetups", "threads", "messages", "approvals", "connections", "nudges", "reports",
              "directives", "applied")  # fmt: skip

    def snapshot(self) -> None:
        self._snapshot = copy.deepcopy({k: getattr(self, k) for k in self._STATE})

    def reset(self) -> None:
        if self._snapshot is not None:
            for k, v in copy.deepcopy(self._snapshot).items():
                setattr(self, k, v)
        self._ids = itertools.count(1)


store = Store()
