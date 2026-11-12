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
    "muted": set[signalId], "removedInterests": set, "deletedSignals": set, "unlocks": [Unlock],
}
records[uid] = seeded connector records (all providers; active only while that provider is connected)
activity[uid] = seeded Facebook activity
When slice C's domain is installed, plans/joins/meetups/threads/approvals/connections/blocks/reports/venues are
the *same objects* as the World's (C owns those records); users stay A's and are projected into the World by
store.bridge.sync(uid) after every A change.

directives[uid][key] = CalendarDirective (written by plans/meetups, served by syncCalendar)
applied[uid][key] = desired value the device last reported applied ok
"""

from __future__ import annotations

import copy
import itertools
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


def now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class Store:
    pool: dict | None = None  # primary pool.json (the pool loadSeed named)
    demo: dict | None = None  # primary demo.json
    seed_dir: str | None = None
    pools: dict[str, dict] = field(default_factory=dict)  # every loaded pool: poolId -> pool.json
    demos: dict[str, dict] = field(default_factory=dict)
    seed_dirs: dict[str, str] = field(default_factory=dict)
    laya_tables_dir: str | None = None
    users: dict[str, dict] = field(default_factory=dict)
    records: dict[str, list[dict]] = field(default_factory=dict)
    activity: dict[str, list[dict]] = field(default_factory=dict)
    venues: dict[str, dict] = field(default_factory=dict)
    plans: dict[str, dict] = field(default_factory=dict)  # plan.schema record + "status"
    joins: dict[str, dict] = field(default_factory=dict)  # {joinId, planId, userId, status, createdAt, ...}
    meetups: dict[str, dict] = field(default_factory=dict)
    threads: dict[str, dict] = field(default_factory=dict)
    approvals: dict[str, dict] = field(default_factory=dict)
    connections: dict[frozenset, dict] = field(default_factory=dict)  # frozenset({a, b}) -> {connectionId, status, ...}
    blocks: set[frozenset] = field(default_factory=set)
    nudges: dict[str, dict] = field(default_factory=dict)
    reports: list[dict] = field(default_factory=list)
    demo_state: dict = field(default_factory=dict)  # DemoState (internal API); defaults set by seed.load
    world: Any = None  # slice C's domain World (cg_api.domain.world.current) when installed; see store.bridge
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
    _STATE = ("pool", "demo", "seed_dir", "pools", "demos", "seed_dirs", "laya_tables_dir", "users", "records", "activity", "venues", "plans",
              "joins", "meetups", "threads", "approvals", "connections", "blocks", "nudges", "reports",
              "directives", "applied", "demo_state", "world")  # fmt: skip

    def _memo(self) -> dict:
        """deepcopy memo that shares the World's code and config (modules, hooks, params) instead of copying them."""
        w = self.world
        if w is None:
            return {}
        keep = [v for v in vars(w).values() if not isinstance(v, (dict, list, set))] + [w.params, w.taxonomy]
        return {id(v): v for v in keep}

    def snapshot(self) -> None:
        self._snapshot = copy.deepcopy({k: getattr(self, k) for k in self._STATE}, self._memo())

    def reset(self) -> None:
        # One deepcopy of everything, so dicts shared with the domain World stay shared after restore.
        if self._snapshot is not None:
            for k, v in copy.deepcopy(self._snapshot, self._memo()).items():
                setattr(self, k, v)
        self._ids = itertools.count(1)
        from cg_api.store import bridge

        bridge.publish()


store = Store()

# Live counters for /internal/v1/metrics that only the producer can see. Slices increment them, e.g.
# counters["muse_fallbacks"] += 1, counters["laya_calls"] += 1, counters["laya_decisive"] += 1,
# counters["booking_fallbacks"] += 1. Not reset by resetDemo (process lifetime).
counters: Counter[str] = Counter()
