"""Contract types for cg_matching (CONTRACTS §10). Records in are camelCase dicts; dataclass fields are snake_case."""

from __future__ import annotations

import dataclasses
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import yaml

Vectors = dict[str, dict[str, float]]  # userId -> {interest path (all depths): weight}


def parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(UTC)


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class Params(dict):
    """contracts/params.yaml as a plain dict (params["plans"]["exposureCapPerDay"])."""

    @classmethod
    def from_yaml(cls, path: str | Path) -> Params:
        return cls(yaml.safe_load(Path(path).read_text()))


@dataclass(frozen=True)
class PoolSnapshot:
    """schemas/pool_export.schema.json. `users` keyed by userId, each the export's user object as is."""

    pool_id: str
    mode: str
    users: dict[str, dict]
    plans: list[dict] = field(default_factory=list)
    generated_at: str = ""
    busy: dict[str, list[tuple[datetime, datetime]]] = field(init=False, repr=False, compare=False)

    def __post_init__(self):
        # Parse busy blocks once per snapshot; rank_plans/propose_plans check them per (user, plan).
        parsed = {
            uid: [(parse_dt(b["start"]), parse_dt(b["end"])) for b in u["busy"]]
            for uid, u in self.users.items()
        }
        object.__setattr__(self, "busy", parsed)

    @classmethod
    def from_export(cls, d: dict) -> PoolSnapshot:
        return cls(
            pool_id=d["poolId"],
            mode=d["mode"],
            users={u["userId"]: u for u in d["users"]},
            plans=list(d.get("plans") or []),
            generated_at=d.get("generatedAt", ""),
        )

    def joined(self, plan_id: str) -> list[str]:
        """Live interested users of a plan from the export (join order)."""
        return next((list(p["interestedIds"]) for p in self.plans if p["planId"] == plan_id), [])


@dataclass(frozen=True)
class Venue:
    """schemas/venue.schema.json."""

    venue_id: str
    location: tuple[float, float]
    activity_types: tuple[str, ...]
    cost: dict
    capacity_per_slot: int
    sensitive: bool
    neighborhood: str
    hours: tuple[dict, ...] | None
    record: dict

    @classmethod
    def from_record(cls, d: dict) -> Venue:
        return cls(
            venue_id=d["venueId"],
            location=(d["location"]["lat"], d["location"]["lng"]),
            activity_types=tuple(d["activityTypes"]),
            cost=dict(d["booking"]["cost"]),
            capacity_per_slot=d["booking"]["capacityPerSlot"],
            sensitive=bool(d.get("sensitive", False)),
            neighborhood=d.get("neighborhood", ""),
            hours=tuple(d["hours"]) if d.get("hours") else None,
            record=d,
        )

    def to_record(self) -> dict:
        return self.record


# camelCase record key -> snake_case field, for the optional/extra Plan fields carried through untouched.
_PLAN_EXTRA = {"poolId": "pool_id", "title": "title", "description": "description", "origin": "origin"}


@dataclass(frozen=True)
class Plan:
    """schemas/plan.schema.json (plus live plans with the same fields). Optional `inviteeIds`: invite-only plan."""

    plan_id: str
    activity_type: str
    venue_id: str
    starts_at: datetime
    ends_at: datetime
    size_min: int
    size_max: int
    cost: dict
    target_interest_ids: tuple[str, ...]
    scene_id: str | None = None
    origin: str | None = None
    seed_join_ids: tuple[str, ...] = ()
    invitee_ids: tuple[str, ...] = ()
    pool_id: str | None = None
    title: str | None = None
    description: str | None = None

    @classmethod
    def from_record(cls, d: dict) -> Plan:
        return cls(
            plan_id=d["planId"],
            activity_type=d["activityType"],
            venue_id=d["venueId"],
            starts_at=parse_dt(d["startsAt"]),
            ends_at=parse_dt(d["endsAt"]),
            size_min=d["size"]["min"],
            size_max=d["size"]["max"],
            cost=dict(d["cost"]),
            target_interest_ids=tuple(d["targetInterestIds"]),
            scene_id=d.get("sceneId"),
            seed_join_ids=tuple(d.get("seedJoinIds") or ()),
            invitee_ids=tuple(d.get("inviteeIds") or ()),
            **{f: d.get(k) for k, f in _PLAN_EXTRA.items()},
        )

    def to_record(self) -> dict:
        """plan.schema.json shape. Unset optional fields are omitted (callers fill title/description/poolId)."""
        r = {
            "planId": self.plan_id,
            "activityType": self.activity_type,
            "venueId": self.venue_id,
            "startsAt": iso(self.starts_at),
            "endsAt": iso(self.ends_at),
            "size": {"min": self.size_min, "max": self.size_max},
            "cost": dict(self.cost),
            "targetInterestIds": list(self.target_interest_ids),
            "sceneId": self.scene_id,
        }
        r |= {k: getattr(self, f) for k, f in _PLAN_EXTRA.items() if getattr(self, f) is not None}
        if self.seed_join_ids:
            r["seedJoinIds"] = list(self.seed_join_ids)
        if self.invitee_ids:
            r["inviteeIds"] = list(self.invitee_ids)
        return r


@dataclass
class MatchState:
    """Live matching state the caller owns. All fields optional; plain JSON-able values.

    exposures:     planId -> carousels it appeared in today (plans.exposureCapPerDay)
    open_joins:    planId -> interested userIds in join order (on top of seedJoinIds and the export's plans)
    met_pairs:     [a, b] pairs that have met (beats the export's metIds)
    blocked_pairs: [a, b] pairs never grouped or shown together (on top of blockedIds)
    seat_history:  userId -> times left unseated recently (raises seat priority)
    venue_capacity: venueId -> people per slot (form_groups caps total seats; absent = unlimited)
    fixed_ids:     planId -> userIds already seated who must stay together (backfill)
    """

    exposures: dict[str, int] = field(default_factory=dict)
    open_joins: dict[str, list[str]] = field(default_factory=dict)
    met_pairs: list[list[str]] = field(default_factory=list)
    blocked_pairs: list[list[str]] = field(default_factory=list)
    seat_history: dict[str, int] = field(default_factory=dict)
    venue_capacity: dict[str, int] = field(default_factory=dict)
    fixed_ids: dict[str, list[str]] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


class LayaTables:
    """data/laya_tables/<poolId>/ (laya_questions.yaml#tables). Missing rows return `default`."""

    def __init__(
        self,
        activity: dict[tuple[str, str], tuple[float, float]] | None = None,
        meet_again: dict[tuple[str, str], float] | None = None,
        manifest: dict | None = None,
        default: float = 0.5,
    ):
        self.activity = activity or {}
        self.meet_again = meet_again or {}
        self.manifest = manifest or {}
        self.default = default

    @classmethod
    def from_dir(cls, path: str | Path) -> LayaTables:
        import pyarrow.parquet as pq

        path = Path(path)
        act = pq.read_table(path / "activity.parquet").to_pydict()
        ma = pq.read_table(path / "meet_again.parquet").to_pydict()
        man = path / "manifest.json"
        return cls(
            activity={
                (u, t): (j, s)
                for u, t, j, s in zip(act["user_id"], act["activity_type"], act["p_join"], act["p_show"])
            },
            meet_again={(a, b): p for a, b, p in zip(ma["user_a"], ma["user_b"], ma["p_meet_again"])},
            manifest=json.loads(man.read_text()) if man.exists() else {},
        )

    def p_join(self, u: str, t: str) -> float:
        return self.activity.get((u, t), (self.default, self.default))[0]

    def p_show(self, u: str, t: str) -> float:
        return self.activity.get((u, t), (self.default, self.default))[1]

    def p_meet_again(self, a: str, b: str) -> float:
        return self.meet_again.get((min(a, b), max(a, b)), self.default)


@dataclass(frozen=True)
class PlanScore:
    user_id: str
    plan_id: str
    score: float
    shared_coarse: list[str]
    travel_minutes: int
    debug: dict

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


@dataclass(frozen=True)
class GroupResult:
    plan_id: str
    member_ids: list[str]
    min_pairwise: float

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


@dataclass(frozen=True)
class FormResult:
    groups: list[GroupResult]
    unseated_ids: list[str]

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)
