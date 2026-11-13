"""In-memory world for the plans domain: users, venues, plans, joins, meetups, threads, approvals.

Pure state plus helpers. No I/O except `load_taxonomy`/`load_params` reading contracts files.
Records are plain dicts shaped like the seed schemas; views (contract JSON) are built in the
sibling modules, never stored.
"""

from __future__ import annotations

import asyncio
import contextvars
import secrets
import socket
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

from cg_api.domain import matching

request_base: contextvars.ContextVar[str | None] = contextvars.ContextVar("cg_request_base", default=None)


def public_base() -> str:
    """One base for /static URLs, fixed at startup: CG_API_HOST when it names an address, else this machine's LAN IP.
    Never taken from a request's Host header, which any client can set (P10: other phones would load from it)."""
    from cg_api.settings import get_settings

    s = get_settings()
    host = s.api_host
    if host in ("", "0.0.0.0", "::"):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sk:
                sk.connect(("10.255.255.255", 1))  # UDP connect sends nothing; it only picks the outbound interface
                host = sk.getsockname()[0]
        except OSError:
            host = "127.0.0.1"
    return f"http://{host}:{s.api_port}"


def _spawn(coro) -> None:
    """Run an agent coroutine on the live loop; outside one (pure tests) drop it."""
    try:
        asyncio.get_running_loop().create_task(coro)
    except RuntimeError:
        coro.close()


def _synthetic():
    from cg_api import synthetic  # D's synthetic counterparts

    return synthetic


def _runner():
    from cg_api.domain import runner  # cycle: runner -> world

    return runner


class Fail(Exception):
    """Domain error that maps 1:1 to the CONTRACTS §7 envelope."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message

    def body(self) -> dict:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "retryable": self.status >= 500,
            }
        }


def not_found() -> Fail:
    return Fail(404, "not_found", "This isn't available anymore.")


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def load_taxonomy(path: Path) -> dict[str, dict]:
    """id -> {id, label, path, level, sensitive} for every node."""
    out: dict[str, dict] = {}

    def walk(nodes: dict, prefix: list[str], labels: list[str], sensitive: bool) -> None:
        for slug, node in nodes.items():
            node = node if isinstance(node, dict) else {"label": node}
            ids, lbls = [*prefix, slug], [*labels, node["label"]]
            sens = sensitive or bool(node.get("sensitive"))
            out[".".join(ids)] = {
                "id": ".".join(ids),
                "label": node["label"],
                "path": lbls,
                "level": len(ids),
                "sensitive": sens,
            }
            walk(node.get("children") or {}, ids, lbls, sens)

    walk(yaml.safe_load(path.read_text())["tree"], [], [], False)
    return out


def load_params(path: Path) -> dict:
    return yaml.safe_load(path.read_text())


@dataclass
class World:
    params: dict
    taxonomy: dict[str, dict]
    demo: dict = field(default_factory=dict)  # demo.json
    demo_mode: bool = True
    base_url: str = field(default_factory=public_base)
    now: Callable[[], datetime] = lambda: datetime.now(UTC)
    match: Any = matching  # cg_matching via ports, `stubs` when it isn't installed
    # Hooks into D's agent (domain.runner drives ScriptedRun); tests swap in plain callables.
    on_formed: Callable[[World, str], None] = lambda w, mt: _runner().start(w, mt)
    on_decided: Callable[[World, dict], None] = lambda w, a: _runner().decided(w, a)
    on_to_muse: Callable[[World, dict], None] = lambda w, m: _runner().to_muse(w, m)
    on_approval: Callable[[World, dict], None] = lambda w, a: _synthetic().on_approval(w, a)  # D: counterparts
    on_left: Callable[[World, str, str], None] = lambda w, mt, uid: None  # M2: backfill, continue or cancel

    users: dict[str, dict] = field(default_factory=dict)
    venues: dict[str, dict] = field(default_factory=dict)
    plans: dict[str, dict] = field(default_factory=dict)
    joins: dict[str, dict] = field(default_factory=dict)
    meetups: dict[str, dict] = field(default_factory=dict)
    threads: dict[str, dict] = field(default_factory=dict)
    approvals: dict[str, dict] = field(default_factory=dict)
    connections: dict[frozenset, dict] = field(default_factory=dict)
    blocks: set[frozenset] = field(default_factory=set)
    reports: list[dict] = field(default_factory=list)
    nudges: dict[str, dict] = field(default_factory=dict)
    shares: dict[str, dict] = field(default_factory=dict)
    prefs: dict[str, dict[str, float]] = field(default_factory=dict)  # userId -> pref key -> w in [-1, 1]
    pref_version: int = 0
    secret: str = field(default_factory=lambda: secrets.token_hex(8))  # verify codes; new each seed load
    runs: dict[str, Any] = field(default_factory=dict)  # meetupId -> D's ScriptedRun
    run_queues: dict[str, Any] = field(default_factory=dict)  # meetupId -> deque of pending run items
    events: list[tuple[str, str, dict]] = field(default_factory=list)  # (userId, type, data) for the realtime hub
    _seq: dict[str, int] = field(default_factory=lambda: defaultdict(int))  # plain ints: World is deepcopied

    def next_id(self, prefix: str) -> str:
        self._seq[prefix] += 1
        return f"{prefix}{self._seq[prefix]:04d}"

    def emit(self, user_id: str, type_: str, data: dict | None = None) -> None:
        self.events.append((user_id, type_, data or {}))

    def user(self, user_id: str) -> dict:
        u = self.users.get(user_id)
        if not u:
            raise Fail(401, "unauthenticated", "Who's this? Pick a demo identity.")
        return u

    def base(self) -> str:
        """The current request's base when it is one of this machine's addresses (http.REQUEST_BASE), else startup."""
        return request_base.get() or self.base_url

    def blocked(self, a: str, b: str) -> bool:
        return frozenset((a, b)) in self.blocks

    def ref(self, interest_id: str) -> dict:
        t = self.taxonomy[interest_id]
        return {
            "id": t["id"],
            "label": t["label"],
            "path": t["path"],
            "level": t["level"],
        }

    def centroid(self, user_id: str) -> tuple[float, float]:
        """P8: travel uses the neighborhood centroid, never the home point."""
        hood = self.users[user_id].get("neighborhood")
        pts = [
            u["homeLocation"] for u in self.users.values() if u.get("neighborhood") == hood and u.get("homeLocation")
        ]
        if not pts:
            loc = self.users[user_id].get("homeLocation") or {
                "lat": 37.7749,
                "lng": -122.4194,
            }
            return loc["lat"], loc["lng"]
        return sum(p["lat"] for p in pts) / len(pts), sum(p["lng"] for p in pts) / len(pts)

    # --- loading -------------------------------------------------------------------------------

    def add_user(self, persona: dict, **extra: Any) -> dict:
        u = {
            "interests": [],  # [{id, weight, visibility, sensitive}] from extraction (D) or setup (A)
            "sensitiveOptIn": set(),  # top-level taxonomy categories the user opted into overlap for
            "signals": [],  # owner-only [{signalId, provider, kind, label, interestIds, venueId, visibility, sensitive, strength}]
            "busy": [],  # owner-only [{start, end}]
            "optedIn": False,
            "museSettings": {
                "spendWithoutAskingCents": self.params["muse"]["spendWithoutAskingCentsDefault"],
                "calendarHolds": self.params["muse"]["calendarHoldsDefault"],
            },
            **persona,
            **extra,
        }
        self.users[u["userId"]] = u
        return u

    def add_plan(self, rec: dict) -> dict:
        p = {"status": "open", "inviteUserIds": [], **rec}
        self.plans[p["planId"]] = p
        for uid in rec.get("seedJoinIds") or []:
            if uid in self.users:
                self._raw_join(p, uid, created=rec.get("createdAt") or iso(self.now()))
        return p

    def _raw_join(self, plan: dict, user_id: str, created: str, size: dict | None = None) -> dict:
        j = {
            "joinId": self.next_id("jn_"),
            "planId": plan["planId"],
            "userId": user_id,
            "status": "interested",
            "createdAt": created,
            "meetupId": None,
            "alternatives": [],
            "size": size,
        }
        self.joins[j["joinId"]] = j
        return j

    def active_joins(self, plan_id: str) -> list[dict]:
        """Joins that are in (interested or matched), earliest first."""
        js = [j for j in self.joins.values() if j["planId"] == plan_id and j["status"] in ("interested", "matched")]
        return sorted(js, key=lambda j: (j["createdAt"], j["joinId"]))

    def join_of(self, user_id: str, plan_id: str) -> dict | None:
        return next(
            (j for j in self.joins.values() if j["userId"] == user_id and j["planId"] == plan_id),
            None,
        )


# The single live instance. A's store sets it on seed load / reset; routes read it via `domain.http`.
current: World | None = None
