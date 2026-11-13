"""getPublicPlan: a plan as anyone with a share link sees it (CONTRACTS §8, Decisions "Public plan page")."""

from __future__ import annotations

from cg_api.domain import plans
from cg_api.domain.world import World, not_found


def public_plan(w: World, plan_id: str) -> dict:
    """No identity, so nothing viewer-specific and no people: counts only, gated like Crowd (P2)."""
    p = w.plans.get(plan_id)
    venue = w.venues.get(p["venueId"]) if p else None
    if (
        not p
        or not w.params["features"].get("sharing")
        or p.get("origin") == "invite"
        or p["status"] == "cancelled"
        or venue.get("sensitive")  # P4, same rule as shares
    ):
        raise not_found()  # all identical to an unknown id
    n = len(w.active_joins(plan_id))
    cap = plans.capacity(w, p)
    # a creator's own words never reach a logged-out reader (could carry a name)
    title = (
        plans.with_venue(plans.activity_noun(p["activityType"]), venue["name"]) if p["origin"] == "user" else p["title"]
    )
    return {
        "planId": p["planId"],
        "title": title[:60],
        "description": p.get("description", ""),
        "activityType": p["activityType"],
        "venue": {k: venue[k] for k in ("venueId", "name", "neighborhood")},
        "photoUrl": plans.venue_view(w, venue)["photoUrl"],
        "startsAt": p["startsAt"],
        "endsAt": p["endsAt"],
        "cost": plans.cost_view(p["cost"]),
        "size": p["size"],
        "status": p["status"],
        "interestedCount": n if n >= w.params["privacy"]["crowdMinCount"] else 0,
        "spotsLeft": 0 if n >= cap else p["size"]["max"] - n % p["size"]["max"],  # same number Crowd shows
    }
