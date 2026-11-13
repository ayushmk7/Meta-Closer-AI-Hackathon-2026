"""In-person verification, check-in, feedback and when a meetup counts (CONTRACTS §5 Connection, §8 P8).

A meetup counts for a pair when they verified each other by QR, or (params.checkin.meetupCountsWhen) both checked
in and each confirmed the other showed up. Counting moves their connection to `met` and feeds Me.rewards.
"""

from __future__ import annotations

import hashlib
import math
from datetime import timedelta
from itertools import combinations

from cg_api.domain import meetups, people, prefs, privacy
from cg_api.domain.world import Fail, World, not_found, parse

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I/L: typed codes stay unambiguous


def code(w: World, meetup_id: str, user_id: str) -> str:
    """My 6-character code for this meetup. Owner-only (Meetup.verifyCode)."""
    h = int(hashlib.sha256(f"{w.secret}|{meetup_id}|{user_id}".encode()).hexdigest(), 16)
    out = ""
    for _ in range(6):
        h, i = divmod(h, len(CODE_ALPHABET))
        out += CODE_ALPHABET[i]
    return out


def _relaxed(w: World) -> bool:
    from cg_api.domain.runner import demo_state  # cycle: runner -> meetups

    ds = demo_state(w)
    return bool(ds.get("relaxCheckin", w.params["demo"]["relaxCheckinDefault"]))


def _in_window(w: World, m: dict) -> bool:
    ck = w.params["checkin"]
    start = parse(m["startsAt"])
    now = w.now()
    return start - timedelta(minutes=ck["opensBeforeMin"]) <= now <= start + timedelta(minutes=ck["closesAfterMin"])


def _count(w: World, m: dict, a: str, b: str) -> None:
    """The meetup counts for both: rewards (A reads members[uid]["counted"]) and their connection becomes met."""
    for u in (a, b):
        if not m["members"][u].get("counted"):
            m["members"][u]["counted"] = True
            w.emit(u, "me.updated")
    c = w.connections.get(frozenset((a, b)))
    if c and m["meetupId"] not in c.setdefault("countedMeetups", []):
        c["countedMeetups"].append(m["meetupId"])
        c["meetupsTogether"] += 1
        if c["status"] != "met":
            c.update(status="met", firstMetAt=m["startsAt"])
        for x, y in ((a, b), (b, a)):
            w.emit(x, "connection.created", people.connection_view(w, x, y, c))


def verify(w: World, viewer: str, meetup_id: str, typed: str) -> dict:
    m = meetups.get(w, viewer, meetup_id)
    if m["members"][viewer]["rsvp"] != "going" or m["status"] not in ("confirmed", "completed"):
        return {"accepted": False, "reason": "not_attendee"}
    if not (_relaxed(w) or _in_window(w, m)):
        return {"accepted": False, "reason": "outside_window"}
    typed = (typed or "").strip().upper()
    if typed == code(w, meetup_id, viewer):
        return {"accepted": False, "reason": "self"}
    other = next((u for u in meetups.going(m) if u != viewer and code(w, meetup_id, u) == typed), None)
    if other is None or w.blocked(viewer, other):
        return {"accepted": False, "reason": "invalid_code"}
    for u in (viewer, other):
        m["members"][u]["verified"] = True
    _count(w, m, viewer, other)
    for u in (viewer, other):
        w.emit(u, "meetup.updated", meetups.view(w, u, meetup_id))
    return {"accepted": True, "person": privacy.person_card(w, other)}


def _metres(a: dict, b: dict) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (a["lat"], a["lng"], b["lat"], b["lng"]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def check_in(w: World, viewer: str, meetup_id: str, location: dict) -> dict:
    """P8: the reading is used for this answer only and never stored."""
    m = w.meetups.get(meetup_id)
    if not m or viewer not in m["members"]:
        raise not_found()
    if m["members"][viewer]["rsvp"] != "going" or m["status"] not in ("confirmed", "completed"):
        return {"accepted": False, "reason": "not_attendee"}
    try:
        far = _metres(location, w.venues[m["venueId"]]["location"]) > w.params["checkin"]["geofenceM"]
    except (KeyError, TypeError, ValueError) as e:
        raise Fail(400, "validation_failed", "That location doesn't look right.") from e
    if not _relaxed(w):
        if not _in_window(w, m):
            return {"accepted": False, "reason": "outside_window"}
        if far:
            return {"accepted": False, "reason": "outside_geofence"}
    m["members"][viewer]["checkedIn"] = True
    _count_confirmed(w, m)
    for u in meetups.going(m):
        w.emit(u, "meetup.updated", meetups.view(w, u, meetup_id))
    return {"accepted": True}


def _count_confirmed(w: World, m: dict) -> None:
    """mutual_confirm_and_checkin: both checked in and each said the other showed up."""

    def saw(a: str, b: str) -> bool:
        fb = m["members"][a].get("feedback") or {}
        return any(x.get("userId") == b and x.get("showedUp") for x in fb.get("answers", []))

    for a, b in combinations(meetups.going(m), 2):
        ma, mb = m["members"][a], m["members"][b]
        if ma["checkedIn"] and mb["checkedIn"] and saw(a, b) and saw(b, a):
            _count(w, m, a, b)


TAGS = {"great_venue", "good_group", "too_far", "too_long"}


def feedback(w: World, viewer: str, meetup_id: str, body: dict) -> None:
    m = meetups.get(w, viewer, meetup_id)
    if m["members"][viewer]["rsvp"] != "going" or m["status"] not in ("confirmed", "completed"):
        raise Fail(409, "conflict", "Feedback opens once the meetup is on.")
    answers, rating, tags = body.get("answers"), body.get("rating"), body.get("tags") or []
    others = set(meetups.going(m)) - {viewer}
    ok = (
        isinstance(answers, list)
        and all(isinstance(a, dict) and a.get("userId") in others for a in answers)
        and (rating is None or (type(rating) is int and 1 <= rating <= 5))
        and isinstance(tags, list)
        and all(isinstance(t, str) for t in tags)
    )
    if not ok:
        raise Fail(400, "validation_failed", "That feedback is missing something.")
    first = not m["members"][viewer].get("feedbackSent")
    m["members"][viewer].update(feedback=body, feedbackSent=True)
    for uid in body.get("reportUserIds") or []:
        if uid in others:
            people.report(
                w, viewer, {"userId": uid, "reason": "other", "meetupId": meetup_id, "text": body.get("note")}
            )
    if first:  # learn once per meetup (plan D)
        plan = w.plans[m["planId"]]
        if rating is not None:
            r = (rating - 3) / 2
        else:
            again = sum(1 for a in answers if a.get("meetAgain"))
            r = 0.5 if answers and again * 2 > len(answers) else -0.5
        prefs.reward(w, viewer, prefs.plan_keys(w, plan), r)
        if "too_far" in tags and not w.venues[plan["venueId"]].get("sensitive"):
            prefs.reward(w, viewer, [f"vn:{plan['venueId']}"], -0.5)
    _count_confirmed(w, m)
    w.emit(viewer, "meetup.updated", meetups.view(w, viewer, meetup_id))
