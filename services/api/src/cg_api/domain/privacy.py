"""Every view of another person goes through here (CONTRACTS §8, P1 to P4, P9).

Whatever `World.match` returns is re-checked: only interests the viewer also has, never hidden,
never sensitive unless both opted that category in, capped by params.
"""

from __future__ import annotations

from cg_api.domain.stubs import _sensitive_ok, _usable
from cg_api.domain.world import World


def person_card(w: World, user_id: str) -> dict:
    """P3: private profiles show first name only and no avatar."""
    u = w.users[user_id]
    private = u.get("profileVisibility") == "private"
    first = u.get("firstName") or u["displayName"].split()[0]
    avatar = u.get("avatar")
    return {
        "userId": user_id,
        "displayName": first if private else u["displayName"],
        "initials": first[:1].upper() if private else u.get("initials") or first[:1].upper(),
        "avatarUrl": None if private or not avatar else f"{w.base_url}/static/avatars/{avatar.rsplit('/', 1)[-1]}",
        "profileVisibility": "private" if private else "public",
    }


def _allowed(w: World, viewer: str, other: str, interest_id: str) -> bool:
    return (
        interest_id in w.taxonomy
        and interest_id in _usable(w, viewer)
        and interest_id in _usable(w, other)
        and _sensitive_ok(w, viewer, other, interest_id)
    )


def shared_full(w: World, viewer: str, other: str) -> list[dict]:
    """After a group forms: level-3 shared interests, at most sharedFullMax (P1, P2, P4)."""
    if viewer == other or w.blocked(viewer, other):
        return []
    cap = w.params["privacy"]["sharedFullMax"]
    ids = w.match.shared_interests(w, viewer, other, 3, cap)
    return [w.ref(i) for i in ids if _allowed(w, viewer, other, i)][:cap]


def crowd(w: World, viewer: str, plan: dict, capacity: int) -> dict:
    """P2: before formation, counts and coarse interests the viewer also has. Never names."""
    js = w.active_joins(plan["planId"])
    others = [j["userId"] for j in js if j["userId"] != viewer]
    cap = w.params["privacy"]["sharedCoarseMax"]
    shared = []
    if len(others) >= w.params["privacy"]["crowdMinCount"]:
        for iid, count in w.match.plan_overlap(w, viewer, plan, others, 2, cap):
            real = sum(1 for o in others if _allowed(w, viewer, o, iid))  # recount; never trust a bigger number
            if w.taxonomy.get(iid, {}).get("level") == 2 and iid in _usable(w, viewer) and real:
                shared.append({"interest": w.ref(iid), "count": min(count, real)})
    return {
        "interestedCount": len(js),
        # spots in the group being gathered, not the venue's whole capacity ("2 spots left", never "35")
        "spotsLeft": 0 if len(js) >= capacity else plan["size"]["max"] - len(js) % plan["size"]["max"],
        "sharedWithYou": shared[:cap],
    }


def others_visible(w: World, viewer: str, user_ids: list[str]) -> list[str]:
    """P9: blocked people disappear from the blocker's responses (and vice versa)."""
    return [u for u in user_ids if u != viewer and not w.blocked(viewer, u)]
