"""Anonymous meetup shares (batch 2): the public gallery behind Welcome and Explore.

A share has no person fields: activity, venue, group size, local date, venue photo (never a user photo), likes.
Who shared it and who liked it stay server-side; `mine` and `likedByMe` are only about the viewer.
"""

from __future__ import annotations

import hashlib
from datetime import timedelta

from cg_api.domain import meetups, plans, prefs
from cg_api.domain.world import Fail, World, not_found, parse

CAPTIONS = [  # ponytail: seed captions; real ones come from shareMeetup
    "Strangers at 10, friends by noon.",
    "Nobody knew anyone. Everyone stayed for food after.",
    "Three of us, one table, zero awkward silences.",
    "Came for the {activity}, stayed for the people.",
    "Already planning the next one.",
]


def _activity(t: str) -> str:
    return t.replace("_", " ")


def _make(w: World, owner: str | None, plan: dict, caption: str, group: int, day: str) -> dict:
    s = {
        "shareId": w.next_id("sh_"),
        "owner": owner,  # internal only: never in a view
        "likers": set(),
        "seedLikes": 0,
        "activityType": plan["activityType"],
        "venueId": plan["venueId"],
        "targetInterestIds": list(plan["targetInterestIds"]),
        "caption": caption[:140],
        "groupSize": max(2, group),
        "happenedOn": day,
    }
    w.shares[s["shareId"]] = s
    return s


def _seed(w: World) -> None:
    """Lazily, from non-sensitive seed plans: a believable gallery on day one (deterministic per plan)."""
    if w.shares:
        return
    today = w.now().astimezone(plans.TZ).date()
    picked = [
        p for p in sorted(w.plans.values(), key=lambda p: p["planId"]) if not w.venues[p["venueId"]].get("sensitive")
    ]
    for k, p in enumerate(picked[: w.params["shares"]["galleryMax"]]):
        h = int(hashlib.sha256(p["planId"].encode()).hexdigest()[:8], 16)
        cap = CAPTIONS[h % len(CAPTIONS)].format(activity=_activity(p["activityType"]))
        day = (today - timedelta(days=1 + k % 14)).isoformat()
        s = _make(w, None, p, cap, p["size"]["min"] + h % 3, day)
        s["seedLikes"] = h % 20


def view(w: World, viewer: str | None, s: dict) -> dict:
    v = w.venues[s["venueId"]]
    venue = plans.venue_view(w, v)
    return {
        "shareId": s["shareId"],
        "activityType": s["activityType"],
        "caption": s["caption"],
        "venue": {"venueId": v["venueId"], "name": v["name"], "neighborhood": v.get("neighborhood", "")},
        "groupSize": s["groupSize"],
        "happenedOn": s["happenedOn"],
        "photoUrl": venue["photoUrl"],
        "likes": s["seedLikes"] + len(s["likers"]),
        "likedByMe": viewer in s["likers"],
        "mine": viewer is not None and s["owner"] == viewer,
        "promptText": f"{_activity(s['activityType']).capitalize()} at {v['name']} this weekend",
    }


def list_shares(w: World, viewer: str | None, activity_type=None, neighborhood=None, venue_id=None) -> list[dict]:
    """Public (security: []). Newest first, at most shares.galleryMax. Sensitive venues never appear (P4)."""
    _seed(w)
    out = [
        s
        for s in w.shares.values()
        if not w.venues[s["venueId"]].get("sensitive")
        and (not activity_type or s["activityType"] == activity_type)
        and (not venue_id or s["venueId"] == venue_id)
        and (not neighborhood or w.venues[s["venueId"]].get("neighborhood") == neighborhood)
    ]
    out.sort(key=lambda s: (s["happenedOn"], s["shareId"]), reverse=True)
    return [view(w, viewer, s) for s in out[: w.params["shares"]["galleryMax"]]]


def share_meetup(w: World, viewer: str, meetup_id: str, caption) -> dict:
    m = meetups.get(w, viewer, meetup_id)
    if not isinstance(caption, str) or not caption.strip() or len(caption) > 140:
        raise Fail(400, "validation_failed", "Keep the caption under 140 characters.")
    me = m["members"][viewer]
    over = m["status"] == "completed" or parse(m["endsAt"]) <= w.now()
    attended = me["rsvp"] == "going" and (me["checkedIn"] or me.get("verified") or me.get("counted"))
    if m["status"] == "cancelled" or not over or not attended:
        raise Fail(422, "screened", "You can share a plan once you've been to it.")
    if w.venues[m["venueId"]].get("sensitive"):
        raise Fail(422, "screened", "This place stays private, so it can't be shared.")
    plan = {**w.plans[m["planId"]], "venueId": m["venueId"]}
    day = parse(m["startsAt"]).astimezone(plans.TZ).date().isoformat()
    s = _make(w, viewer, plan, caption.strip(), len(meetups.going(m)), day)
    return view(w, viewer, s)


def like(w: World, viewer: str, share_id: str, liked) -> dict:
    s = w.shares.get(share_id)
    if not s or w.venues[s["venueId"]].get("sensitive"):
        raise not_found()
    if not isinstance(liked, bool):
        raise Fail(400, "validation_failed", "liked must be true or false.")
    if liked and viewer not in s["likers"]:
        s["likers"].add(viewer)
        prefs.reward(w, viewer, prefs.keys(w, s["activityType"], s["venueId"], s["targetInterestIds"]), 0.3)
    elif not liked:
        s["likers"].discard(viewer)
    return view(w, viewer, s)
