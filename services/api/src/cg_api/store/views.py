"""Store -> public JSON shapes for slice A's resources, plus identity helpers every slice should use (P3)."""

from __future__ import annotations

from datetime import UTC, datetime

from cg_api.contracts import interest_ref
from cg_api.errors import ApiError
from cg_api.settings import get_settings
from cg_api.store import store


def require_opted_in(uid: str) -> dict:
    u = store.users[uid]
    if not u["optedIn"]:
        raise ApiError(403, "not_opted_in", "Turn on Common Ground first.")
    return u


def display_name(uid: str) -> str:
    """P3: first name only for private profiles, everywhere."""
    u = store.users[uid]
    return u["persona"]["firstName"] if u["profileVisibility"] == "private" else u["persona"]["displayName"]


def avatar_url(uid: str, base: str) -> str | None:
    """P3: null for private profiles. `base` = request.base_url (LAN host the phone used)."""
    u = store.users[uid]
    path = u["persona"].get("avatar")
    if u["profileVisibility"] == "private" or not path:
        return None
    return f"{base.rstrip('/')}/static/avatars/{path.rsplit('/', 1)[-1]}"


def venue_view(vid: str | None, base: str) -> dict | None:
    v = store.venues.get(vid or "")
    if not v:
        return None
    photo = v.get("photo")
    return {
        "venueId": v["venueId"],
        "name": v["name"],
        "neighborhood": v["neighborhood"],
        "address": v["address"],
        "location": v["location"],
        "kind": v["kind"],
        "photoUrl": f"{base.rstrip('/')}/static/venues/{photo.rsplit('/', 1)[-1]}" if photo else None,
    }


def my_interest(i: dict) -> dict:
    out = {k: i[k] for k in ("weight", "visibility", "sensitive", "source")}
    out["interest"] = interest_ref(i["id"])
    if i.get("evidence"):
        out["evidence"] = i["evidence"]
    return out


def signal_view(s: dict, base: str) -> dict:
    """Owner-only (P7)."""
    return {
        "signalId": s["signalId"],
        "provider": s["provider"],
        "kind": s["kind"],
        "label": s["label"],
        "interests": [interest_ref(i, 2) for i in dict.fromkeys(".".join(i.split(".")[:2]) for i in s["interestIds"])],
        "venue": None if s["sensitive"] else venue_view(s.get("venueId"), base),  # as the spec example: no place named
        "observedAt": s["observedAt"],
        "visibility": s["visibility"],
        "sensitive": s["sensitive"],
    }


def capabilities(uid: str) -> dict:
    p = get_settings().params
    earned = {x["unlockId"] for x in earned_unlocks(uid)}
    bigger = "bigger_groups" in earned
    return {
        "canCreatePlans": "create_plans" in earned,
        "maxGroupSize": p["groups"]["sizeMax"] if bigger else p["plans"]["defaultSize"]["max"],
        "groupOnly": True,
        "openJoinsMax": p["plans"]["openJoinsMax"] + (2 if bigger else 0),  # params.unlocks label: "2 more open plans"
    }


def counted_starts(uid: str) -> list[datetime]:
    """Start times of meetups that counted for uid: slice C sets members[uid]["counted"] = True when the
    trust rule passes (params.checkin.meetupCountsWhen)."""
    return [
        datetime.fromisoformat(m["startsAt"])
        for m in store.meetups.values()
        if m.get("members", {}).get(uid, {}).get("counted") is True
    ]


def _reported(uid: str) -> bool:
    return any(r.get("userId") == uid for r in store.reports)


def earned_unlocks(uid: str) -> list[dict]:
    """params.unlocks earned from counted meetups (same rule as Me.rewards and C's createPlan gate).
    earnedAt = start of the meetup that crossed the threshold."""
    starts = sorted(counted_starts(uid))
    out = []
    for u in get_settings().params["unlocks"]:
        n = u["afterConfirmedMeetups"]
        if len(starts) >= n and not (u.get("requiresNoReports") and _reported(uid)):
            at = starts[n - 1] if n else datetime.fromisoformat(store.users[uid]["persona"]["joinedAt"])
            out.append(
                {
                    "unlockId": u["unlockId"],
                    "label": u["label"],
                    "earnedAt": at.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                }
            )
    return out


def rewards_view(uid: str) -> dict:
    """Me.rewards: private progress, only ever in the user's own Me."""
    from cg_api.domain.rewards import rewards

    now = store.world.now() if store.world is not None else datetime.now(UTC)
    return rewards(counted_starts(uid), get_settings().params["unlocks"], now, has_reports=_reported(uid))


def me_view(uid: str, base: str) -> dict:
    u = store.users[uid]
    return {
        "userId": uid,
        "displayName": display_name(uid),
        "avatarUrl": avatar_url(uid, base),
        "profileVisibility": u["profileVisibility"],
        "optedIn": u["optedIn"],
        "setupComplete": u["setupComplete"],
        "mode": u["mode"],
        "poolId": u["poolId"],
        "neighborhood": u["neighborhood"],
        "groupSize": u["groupSize"],
        "availability": u["availability"],
        "travel": u["travel"],
        "interests": [my_interest(i) for i in sorted(u["interests"].values(), key=lambda i: (-i["weight"], i["id"]))],
        "museSettings": u["museSettings"],
        "capabilities": capabilities(uid),
        "unlocks": earned_unlocks(uid),
        "rewards": rewards_view(uid),
    }


def connector_view(uid: str, provider: str) -> dict:
    spec = get_settings().contract("connectors.yaml")["providers"][provider]
    c = store.users[uid]["connectors"].get(provider)
    status = "coming_soon" if spec["status"] == "coming_soon" else ("connected" if c else "not_connected")
    return {
        "provider": provider,
        "label": spec["label"],
        "reads": spec["reads"],
        "status": status,
        "simulated": spec["simulated"],
        "connectedAt": c["connectedAt"] if c else None,
        "lastSyncAt": c["lastSyncAt"] if c else None,
        "signalCount": sum(s["provider"] == provider for s in store.users[uid]["signals"].values()),
    }
