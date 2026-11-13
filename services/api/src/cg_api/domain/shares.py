"""Anonymous meetup shares (batch 2): the public gallery behind Welcome and Explore.

A share has no person fields: activity, venue, group size, local date, venue photo (never a user photo), likes.
Who shared it and who liked it stay server-side; `mine` and `likedByMe` are only about the viewer.
"""

from __future__ import annotations

import hashlib
import logging
import re
import unicodedata
from datetime import timedelta

from cg_api import ports
from cg_api.domain import meetups, plans, prefs, screen
from cg_api.domain.world import Fail, World, not_found, parse
from cg_api.settings import get_settings

log = logging.getLogger("cg_api.domain.shares")

CAPTIONS = [  # ponytail: seed captions that fit any card; real ones come from shareMeetup
    "Strangers at the start, friends by the end.",
    "Nobody knew anyone. Everyone stayed for food after.",
    "{n} of us, zero awkward silences.",
    "Came for the meetup, stayed for the people.",
    "Already planning the next one.",
]


NUMBERS = {2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight"}


def _when(w: World) -> str:
    """'this weekend' on weekdays; on Sat/Sun this weekend is already happening."""
    return "this weekend" if w.now().astimezone(plans.TZ).weekday() < 5 else "next weekend"


def _pool(w: World, viewer: str | None) -> str | None:
    """The viewer's pool; anonymous (Welcome) and not-yet-opted-in see the demo's city pool."""
    u = w.users.get(viewer or "")
    return (u or {}).get("poolId") or w.demo.get("poolId")


def _make(w: World, owner: str | None, plan: dict, caption: str, group: int, day: str) -> dict:
    s = {
        "shareId": w.next_id("sh_"),
        "owner": owner,  # internal only: never in a view
        "likers": set(),
        "seedLikes": 0,
        "activityType": plan["activityType"],
        "title": plan["title"],
        "poolId": plan.get("poolId"),
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
    per_pool: dict = {}
    for p in picked:  # galleryMax per pool, so every pool's gallery is full
        per_pool.setdefault(p.get("poolId"), []).append(p)
    picked = [p for ps in per_pool.values() for p in ps[: w.params["shares"]["galleryMax"]]]
    for k, p in enumerate(picked):
        h = int(hashlib.sha256(p["planId"].encode()).hexdigest()[:8], 16)
        group = p["size"]["min"] + h % 3
        cap = CAPTIONS[h % len(CAPTIONS)].format(n=NUMBERS.get(group, str(group)))
        day = (today - timedelta(days=1 + k % 14)).isoformat()
        s = _make(w, None, p, cap, group, day)
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
        "promptText": f"{plans.with_venue(s['title'], v['name'])} {_when(w)}",
    }


def list_shares(w: World, viewer: str | None, activity_type=None, neighborhood=None, venue_id=None) -> list[dict]:
    """Public (security: []). Newest first, at most shares.galleryMax. Sensitive venues never appear (P4)."""
    _seed(w)
    pool = _pool(w, viewer)
    out = [
        s
        for s in w.shares.values()
        if not w.venues[s["venueId"]].get("sensitive")
        and (pool is None or s["poolId"] in (None, pool))
        and (not activity_type or s["activityType"] == activity_type)
        and (not venue_id or s["venueId"] == venue_id)
        and (not neighborhood or w.venues[s["venueId"]].get("neighborhood") == neighborhood)
    ]
    out.sort(key=lambda s: (s["happenedOn"], s["shareId"]), reverse=True)
    return [view(w, viewer, s) for s in out[: w.params["shares"]["galleryMax"]]]


def _names(w: World, m: dict, viewer: str) -> set[str]:
    """Every other attendee's first, last and display name: the server knows them, the gallery must not."""
    out = set()
    for u in m["members"]:
        if u != viewer:
            rec = w.users[u]
            out |= {rec.get("firstName") or "", rec.get("displayName") or ""} | set(
                (rec.get("displayName") or "").split()
            )
    return {n for n in out if len(n) >= 2}


def _fold(text: str) -> str:
    """Accents off (Danïel -> Daniel) and spaced-out letters rejoined (R o s a -> Rosa)."""
    t = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    return re.sub(r"\b(?:\w[\s.\-_*]+){2,}\w\b", lambda m: re.sub(r"[\s.\-_*]+", "", m.group(0)), t)


def _names_someone(caption: str, names: set[str]) -> bool:
    """Whole-word name match after folding, plus nicknames: a capitalised 3+ letter token that starts a name."""
    t = _fold(caption)
    folded = {_fold(n).lower() for n in names}
    if any(re.search(rf"\b{re.escape(n)}\b", t, re.I) for n in folded):
        return True
    tokens = re.findall(r"\b[A-Z][a-z]{2,}\b", t)
    return any(n.startswith(tok.lower()) for tok in tokens for n in folded if len(n) > len(tok))


def _eligible(w: World, viewer: str, meetup_id: str, caption) -> dict:
    m = meetups.get(w, viewer, meetup_id)
    if not isinstance(caption, str) or not caption.strip():
        raise Fail(400, "validation_failed", "Add a caption to share it.")
    if len(caption) > 140:
        raise Fail(400, "validation_failed", "Keep the caption under 140 characters.")
    me = m["members"][viewer]
    over = m["status"] == "completed" or parse(m["endsAt"]) <= w.now()
    attended = me["rsvp"] == "going" and (me["checkedIn"] or me.get("verified") or me.get("counted"))
    if m["status"] == "cancelled" or not over or not attended:
        raise Fail(422, "not_allowed", "You can share a meetup once you've been to it.")
    if w.venues[m["venueId"]].get("sensitive"):
        raise Fail(422, "not_allowed", "This place stays private, so it can't be shared.")
    if screen.blocked(caption):
        raise Fail(422, "screened", "Couldn't post that caption. Try a different one.")
    if _names_someone(caption, _names(w, m, viewer)):
        # the gallery is public and logged-out: nobody is named there without their say
        raise Fail(422, "screened", "Shares stay anonymous, so leave people's names out of the caption.")
    return m


async def share_meetup(w: World, viewer: str, meetup_id: str, caption) -> dict:
    """Checks first, then the same Laya screen as user-created plans (laya_questions plan_ok): a decisive no is
    422 screened. Undecided passes. ponytail: Muse escalation for undecided answers comes with createPlan (M2)."""
    m = _eligible(w, viewer, meetup_id, caption)
    if get_settings().laya_fake:
        # LAYA_FAKE's hash answer is noise, not judgement: never refuse a happy post on it (D4)
        log.info("shareMeetup: LAYA_FAKE, plan_ok screen skipped for %s", meetup_id)
    else:
        p, decisive = await ports.ports.laya.ask("plan_ok", {"text": caption.strip()})
        if decisive and p < 0.5:
            raise Fail(422, "screened", "Couldn't post that caption. Try a different one.")
    plan = {**w.plans[m["planId"]], "venueId": m["venueId"]}
    day = parse(m["startsAt"]).astimezone(plans.TZ).date().isoformat()
    s = _make(w, viewer, plan, caption.strip(), len(meetups.going(m)), day)
    return view(w, viewer, s)


def like(w: World, viewer: str, share_id: str, liked) -> dict:
    s = w.shares.get(share_id)
    if not s or w.venues[s["venueId"]].get("sensitive"):
        raise not_found("post")
    if not isinstance(liked, bool):
        raise Fail(400, "validation_failed", "Couldn't save that like. Try again.")
    if liked and viewer not in s["likers"]:
        s["likers"].add(viewer)
        if viewer not in s.setdefault("rewarded", set()):  # unlike + like again can't farm prefs
            s["rewarded"].add(viewer)
            prefs.reward(w, viewer, prefs.keys(w, s["activityType"], s["venueId"], s["targetInterestIds"]), 0.3)
    elif not liked:
        s["likers"].discard(viewer)
    return view(w, viewer, s)
