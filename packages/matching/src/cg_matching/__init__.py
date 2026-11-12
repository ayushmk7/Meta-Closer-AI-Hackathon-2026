"""Common Ground matching (CONTRACTS §10). Pure: no I/O, no network, no clock; randomness only from rng/seed."""

from cg_matching.core import (
    ACTIVITY_INTERESTS,
    build_vectors,
    candidates,
    form_groups,
    plan_overlap,
    propose_plans,
    rank_plans,
    scenes,
    shared_interests,
    travel_minutes,
)
from cg_matching.types import (
    FormResult,
    GroupResult,
    LayaTables,
    MatchState,
    Params,
    Plan,
    PlanScore,
    PoolSnapshot,
    Vectors,
    Venue,
)

__all__ = [
    "ACTIVITY_INTERESTS",
    "FormResult",
    "GroupResult",
    "LayaTables",
    "MatchState",
    "Params",
    "Plan",
    "PlanScore",
    "PoolSnapshot",
    "Vectors",
    "Venue",
    "build_vectors",
    "candidates",
    "form_groups",
    "plan_overlap",
    "propose_plans",
    "rank_plans",
    "scenes",
    "shared_interests",
    "travel_minutes",
]
