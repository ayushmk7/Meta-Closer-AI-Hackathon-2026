"""Meetups (one per formed group) and the append-only Muse step model D's agent writes to."""

from __future__ import annotations

from datetime import timedelta
from itertools import combinations

from cg_api.domain import chat, plans, privacy
from cg_api.domain.world import Fail, World, iso, not_found, parse

STEP_NEXT = {  # CONTRACTS §5 Muse step machine
    "queued": {"running", "done", "skipped", "needs_you", "failed"},
    "running": {"done", "needs_you", "failed", "skipped"},
    "needs_you": {"running", "done", "failed", "skipped"},
}


def create(w: World, plan: dict, joins: list[dict]) -> str:
    now = iso(w.now())
    mt, th = w.next_id("mt_"), w.next_id("th_")
    prepaid = plan["cost"]["kind"] == "prepaid"
    w.meetups[mt] = {
        "meetupId": mt,
        "planId": plan["planId"],
        "threadId": th,
        "status": "setting_up",
        "title": plan["title"][:60],
        "activityType": plan["activityType"],
        "venueId": plan["venueId"],
        "startsAt": plan["startsAt"],
        "endsAt": plan["endsAt"],
        "steps": [],
        "eventLabel": None,
        "booking": {
            "status": "not_booked" if w.venues[plan["venueId"]]["booking"]["kind"] != "none" else "not_needed",
            "label": "Not booked yet",
            "provider": "Simulated booking",
            "confirmationCode": None,
        },
        "members": {
            j["userId"]: {
                "rsvp": "going",
                "checkedIn": False,
                "status": None,
                "payment": "pending_approval" if prepaid else "not_needed",
            }
            for j in joins
        },
    }
    if w.meetups[mt]["booking"]["status"] == "not_needed":
        w.meetups[mt]["booking"]["label"] = "No booking needed"
    uids = [j["userId"] for j in joins]
    w.threads[th] = {
        "threadId": th,
        "meetupId": mt,
        "title": plan["title"][:60],
        "members": uids,
        "messages": [],
        "readUpTo": {},
    }
    for j in joins:
        j.update(status="matched", meetupId=mt, alternatives=[])
    for a, b in combinations(uids, 2):
        key = frozenset((a, b))
        c = w.connections.setdefault(
            key,
            {
                "connectionId": w.next_id("cn_"),
                "status": "new",
                "meetupsTogether": 0,
                "connectedAt": now,
                "firstMetAt": None,
            },
        )
        for x, y in ((a, b), (b, a)):
            w.emit(
                x,
                "connection.created",
                {"connectionId": c["connectionId"], "userId": y},
            )
    from cg_api.domain import joins as joins_mod  # cycle: joins -> meetups -> joins

    for uid in uids:
        w.emit(uid, "join.updated", joins_mod.view(w, w.join_of(uid, plan["planId"])))
        w.emit(uid, "meetup.updated", view(w, uid, mt))
        w.emit(uid, "thread.updated", chat.thread_view(w, uid, w.threads[th]))
        w.emit(uid, "calendar.changed")
    return mt


def get(w: World, viewer: str, meetup_id: str) -> dict:
    m = w.meetups.get(meetup_id)
    if not m or viewer not in m["members"]:
        raise not_found()
    return m


def going(m: dict) -> list[str]:
    return [u for u, s in m["members"].items() if s["rsvp"] == "going"]


# --- steps (D's agent calls these; every transition emits meetup.step) ---------------------------


try:  # D's filter once cg_api.agent is on the base; same rule inline until then
    from cg_api.agent import visible_steps
except ImportError:

    def visible_steps(steps: list[dict], viewer_id: str) -> list[dict]:
        """Shared steps plus only my own payment step (P6), without the internal field."""
        return [
            {k: v for k, v in s.items() if k != "forUserId"} for s in steps if s.get("forUserId") in (None, viewer_id)
        ]


def _emit_step(w: World, m: dict, step: dict) -> None:
    for uid in going(m):
        for s in visible_steps([step], uid):
            w.emit(uid, "meetup.step", {"meetupId": m["meetupId"], "step": s})


def upsert_step(w: World, meetup_id: str, step: dict) -> None:
    """Append, or replace by stepId (D's ScriptedRun events). Order is never changed."""
    m = w.meetups[meetup_id]
    old = next((s for s in m["steps"] if s["stepId"] == step["stepId"]), None)
    if old:
        old.clear()
        old.update(step)
    else:
        m["steps"].append(dict(step))
    _emit_step(w, m, step)


def add_step(
    w: World,
    meetup_id: str,
    kind: str,
    label: str,
    status: str = "queued",
    detail: str | None = None,
    approval_id: str | None = None,
) -> dict:
    m = w.meetups[meetup_id]
    step = {
        "stepId": w.next_id("st_"),
        "kind": kind,
        "status": status,
        "label": label,
        "detail": detail,
        "approvalId": approval_id,
        "at": iso(w.now()),
    }
    m["steps"].append(step)
    _emit_step(w, m, step)
    return step


def update_step(w: World, meetup_id: str, step_id: str, **changes) -> dict:
    m = w.meetups[meetup_id]
    step = next(s for s in m["steps"] if s["stepId"] == step_id)
    new = changes.get("status", step["status"])
    if new != step["status"] and new not in STEP_NEXT.get(step["status"], set()):
        raise ValueError(f"step {step_id}: {step['status']} -> {new} not allowed")
    step.update(
        {k: v for k, v in changes.items() if k in ("status", "label", "detail", "approvalId")},
        at=iso(w.now()),
    )
    _emit_step(w, m, step)
    return step


def set_status(w: World, meetup_id: str, status: str) -> None:
    """setting_up <-> confirmed -> completed; any -> cancelled."""
    m = w.meetups[meetup_id]
    if m["status"] in ("completed", "cancelled") and status != m["status"]:
        raise ValueError(f"meetup {meetup_id} is {m['status']}")
    m["status"] = status
    for uid in going(m):
        w.emit(uid, "meetup.updated", view(w, uid, meetup_id))
        w.emit(uid, "calendar.changed")


# --- views ---------------------------------------------------------------------------------------


def directive(w: World, viewer: str, m: dict) -> dict:
    """P7: own directive only, never another person's name."""
    v = w.venues[m["venueId"]]
    me = m["members"][viewer]
    desired = (
        "none"
        if me["rsvp"] == "left" or m["status"] == "cancelled"
        else "event"
        if m["status"] in ("confirmed", "completed")
        else "hold"
    )
    return {
        "key": m["meetupId"],
        "desired": desired,
        "title": (("Hold: " if desired == "hold" else "") + plans.with_venue(m["title"], v["name"]))[:120],
        "startsAt": m["startsAt"],
        "endsAt": m["endsAt"],
        "location": f"{v['name']}, {v.get('address', '')}".rstrip(", "),
        "notes": "Muse is setting this up." if desired == "hold" else "Muse set this up. Details are in Common Ground.",
    }


def view(w: World, viewer: str, meetup_id: str) -> dict:
    m = get(w, viewer, meetup_id)
    plan, venue = w.plans[m["planId"]], w.venues[m["venueId"]]
    me = m["members"][viewer]
    trav = plans.travel(w, viewer, venue)
    start = parse(m["startsAt"])
    if trav:
        leave = start - timedelta(minutes=trav["minutes"] + w.params["travel"]["leaveByBufferMin"])
        trav = {**trav, "leaveBy": iso(leave), "directions": plans.directions(venue)}
    ck = w.params["checkin"]
    window = None
    if m["status"] == "confirmed":
        window = {
            "opensAt": iso(start - timedelta(minutes=ck["opensBeforeMin"])),
            "closesAt": iso(start + timedelta(minutes=ck["closesAfterMin"])),
        }
    from cg_api.domain import approvals  # cycle: approvals -> meetups

    people = [viewer] + privacy.others_visible(w, viewer, list(m["members"]))
    return {
        "meetupId": m["meetupId"],
        "planId": m["planId"],
        "threadId": m["threadId"],
        "title": m["title"],
        "activityType": m["activityType"],
        "status": m["status"],
        "venue": plans.venue_view(w, venue),
        "startsAt": m["startsAt"],
        "endsAt": m["endsAt"],
        "attendees": [
            {
                "person": privacy.person_card(w, u),
                "isMe": u == viewer,
                "rsvp": m["members"][u]["rsvp"],
                "checkedIn": m["members"][u]["checkedIn"],
                "status": m["members"][u]["status"],
                "sharedInterests": privacy.shared_full(w, viewer, u),
            }
            for u in people
        ],
        "museSteps": visible_steps(m["steps"], viewer),
        "approvals": [
            approvals.view(a) for a in w.approvals.values() if a["meetupId"] == meetup_id and a["userId"] == viewer
        ],
        "booking": dict(m["booking"]),
        "cost": {**plans.cost_view(plan["cost"]), "myPayment": me["payment"]},
        "calendar": directive(w, viewer, m),
        "travel": trav,
        "checkinWindow": window,
        "feedbackDue": m["status"] == "completed" and not me.get("feedbackSent", False),
        "eventLabel": m["eventLabel"],
    }


def list_meetups(w: World, viewer: str) -> list[dict]:
    ms = [m for m in w.meetups.values() if viewer in m["members"] and m["status"] != "cancelled"]
    return [view(w, viewer, m["meetupId"]) for m in sorted(ms, key=lambda m: (m["startsAt"], m["meetupId"]))]


def leave(w: World, viewer: str, meetup_id: str) -> dict:
    """P6: the group hears only '<first name> can't make it'."""
    m = get(w, viewer, meetup_id)
    if m["status"] in ("completed", "cancelled"):
        raise Fail(409, "conflict", "This meetup is already over.")
    me = m["members"][viewer]
    if me["rsvp"] == "going":
        me["rsvp"] = "left"
        chat.cut_off(w, m["threadId"], viewer)
        first = privacy.person_card(w, viewer)["displayName"].split()[0]
        chat.post(w, m["threadId"], "muse", None, f"{first} can't make it.")
        for uid in going(m):
            w.emit(uid, "meetup.updated", view(w, uid, meetup_id))
        w.emit(viewer, "calendar.changed")
        w.on_left(w, meetup_id, viewer)
    return view(w, viewer, meetup_id)
