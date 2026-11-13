"""Store <-> slice C's domain World (cg_api.domain.world), so there is one world, not two.

C's World owns plans, joins, meetups, threads, approvals, connections, blocks and reports; the store aliases the
same objects. A owns user profiles, interests, signals and busy blocks; `sync(uid)` projects them into the
World's user record (C's shape) after every A change. No-ops while the domain package is absent.
"""

from __future__ import annotations

import logging

from cg_api import contracts, realtime
from cg_api.settings import get_settings
from cg_api.store import store

log = logging.getLogger("cg_api.bridge")
SHARED = ("venues", "plans", "joins", "meetups", "threads", "approvals", "connections", "blocks", "reports", "nudges")


def _domain():
    try:
        from cg_api.domain import world
    except ImportError:
        return None
    return world


def build() -> None:
    """After a seed load: a fresh World from the store, aliased and published as world.current."""
    dw = _domain()
    if dw is None:
        return
    w = dw.World(get_settings().params, contracts.taxonomy(), demo=dict(store.demo or {}))
    w.venues = store.venues
    for uid in store.users:
        w.add_user(_projection(uid))
    seeded_plans = list(store.plans.values())
    store.plans.clear()
    store.joins.clear()
    for plan in seeded_plans:
        w.add_plan({k: v for k, v in plan.items() if k != "status"})
    for name in SHARED:
        if hasattr(w, name):  # a World without that collection keeps the store's own
            setattr(store, name, getattr(w, name))
    store.world = w
    publish()


def publish() -> None:
    """Make store.world the live World and route its events to the realtime hub."""
    dw = _domain()
    if dw is None or store.world is None:
        return
    w = store.world
    w.emit = lambda uid, type_, data=None: (
        w.events.append((uid, type_, data or {})),
        w.touched(type_),
        realtime.emit(uid, type_, data),
    )
    dw.current = w


def _projection(uid: str) -> dict:
    u = store.users[uid]
    p = u["persona"]
    return {
        **p,
        "synthetic": u["synthetic"],
        "optedIn": u["optedIn"],
        "setupComplete": u["setupComplete"],
        "mode": u["mode"],
        "poolId": u["poolId"],
        "profileVisibility": u["profileVisibility"],
        "neighborhood": u["neighborhood"],
        "groupSize": u["groupSize"],
        "availability": u["availability"],
        "travel": u["travel"],
        "museSettings": u["museSettings"],
        "interests": [
            {k: i[k] for k in ("id", "weight", "visibility", "sensitive", "source")}
            for i in sorted(u["interests"].values(), key=lambda i: (-i["weight"], i["id"]))
        ],
        "sensitiveOptIn": set(),  # P4: no API opts a category in yet
        "signals": [{k: v for k, v in s.items() if k != "recordIds"} for s in u["signals"].values()],
        "busy": [{"start": b["start"], "end": b["end"]} for b in u["busy"]],
    }


def sync(uid: str) -> None:
    """Push A's view of one user into the World (keeps C-only keys the World added)."""
    if store.world is not None and uid in store.world.users:
        store.world.users[uid].update(_projection(uid))
        store.world.touched()  # interests, busy, settings: rank inputs


def changed(uid: str, *events: str) -> None:
    """After an A mutation: sync the World's copy of the user, then emit the realtime hints."""
    sync(uid)
    for e in events:
        realtime.emit(uid, e)
