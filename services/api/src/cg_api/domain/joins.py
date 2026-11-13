"""I'm in, withdraw, Your plans, and group formation (CONTRACTS §5 Plan and Join machines)."""

from __future__ import annotations

import asyncio
import logging
import random

from cg_api.domain import meetups, plans
from cg_api.domain.world import Fail, World, iso, not_found

log = logging.getLogger("cg_api.domain.joins")


def hold(w: World, j: dict) -> dict | None:
    """The calendar directive for a join; never names another person (P7)."""
    p, u = w.plans[j["planId"]], w.users[j["userId"]]
    v = w.venues[p["venueId"]]
    if j["status"] == "matched":
        return None  # the meetup's directive takes over
    if not u["museSettings"].get("calendarHolds", True):
        return None
    desired = "hold" if j["status"] == "interested" else "none"
    return {
        "key": j["joinId"],
        "desired": desired,
        "title": f"Hold: {plans.with_venue(p['title'], v['name'])}"[:120],
        "startsAt": p["startsAt"],
        "endsAt": p["endsAt"],
        "location": f"{v['name']}, {v.get('address', '')}".rstrip(", "),
        "notes": "Muse is gathering people. This hold disappears if the plan doesn't fill.",
    }


def view(w: World, j: dict, with_plan: bool = False) -> dict:
    p = w.plans[j["planId"]]
    out = {
        "joinId": j["joinId"],
        "planId": j["planId"],
        "status": j["status"],
        "progress": {
            "joined": len(w.active_joins(p["planId"])),
            "needed": p["size"]["min"],
        },
        "meetupId": j["meetupId"],
        "formsAt": plans.forms_at(w, p),
        "createdAt": j["createdAt"],
        "alternatives": j["alternatives"],
        "calendar": hold(w, j),
    }
    if with_plan:
        out["plan"] = plans.card(w, j["userId"], p)
    return out


def list_joins(w: World, viewer: str) -> list[dict]:
    plans.require_opted_in(w, viewer)
    js = [j for j in w.joins.values() if j["userId"] == viewer and j["status"] != "withdrawn"]
    return [view(w, j, with_plan=True) for j in sorted(js, key=lambda j: (j["createdAt"], j["joinId"]), reverse=True)]


def join(w: World, viewer: str, plan_id: str, size: dict | None = None) -> dict:
    plans.require_opted_in(w, viewer)
    p = plans.get(w, viewer, plan_id)
    j = w.join_of(viewer, plan_id)
    if j and j["status"] != "withdrawn":
        return view(w, j)  # idempotent
    if p["status"] != "open":
        raise Fail(409, "conflict", "This plan isn't taking people anymore.")
    if size is not None and not (
        isinstance(size, dict)
        and type(size.get("min")) is int
        and type(size.get("max")) is int
        and w.params["groups"]["strangerSizeMin"] <= size["min"] <= size["max"] <= w.params["groups"]["sizeMax"]
    ):
        raise Fail(
            400,
            "validation_failed",
            f"That group size doesn't work. Pick between {w.params['groups']['strangerSizeMin']} and {w.params['groups']['sizeMax']}.",
        )
    open_n = sum(1 for x in w.joins.values() if x["userId"] == viewer and x["status"] == "interested")
    if open_n >= w.params["plans"]["openJoinsMax"]:
        raise Fail(
            429,
            "rate_limited",
            "You're in a lot of plans already. Wait for one to fill first.",
        )
    if j:  # re-join after withdrawing: same join, fresh place in the queue
        j.update(status="interested", createdAt=iso(w.now()), size=size, alternatives=[])
    else:
        j = w._raw_join(p, viewer, created=iso(w.now()), size=size)
    n = len(w.active_joins(plan_id))
    if n >= plans.capacity(w, p):
        p["status"] = "full"
    w.emit(viewer, "join.updated", view(w, j))
    for other in w.active_joins(plan_id):
        if other["userId"] != viewer:
            w.emit(other["userId"], "feed.updated")
    if p["status"] == "full":
        form(w, plan_id)
    elif w.demo_mode and w.params["plans"]["demoFormAtMin"] and n >= p["size"]["min"]:
        form_soon(w, plan_id)
    return view(w, j)


def form_soon(w: World, plan_id: str) -> None:
    """DEMO_MODE forms at size.min after a short beat so "Muse is gathering people" shows on stage.
    ponytail: reuses params.demo.syntheticDelayS (counterparts reacting); a dedicated key needs a contracts PR."""
    p = w.plans[plan_id]
    if p.get("formingSoon"):
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:  # pure tests: form now
        form(w, plan_id)
        return
    p["formingSoon"] = True

    def go() -> None:
        p.pop("formingSoon", None)
        n = len([j for j in w.active_joins(plan_id) if j["status"] == "interested"])
        if p["status"] == "open" and n >= p["size"]["min"]:  # someone may have withdrawn meanwhile
            try:
                form(w, plan_id)
            except Exception:
                log.exception("formation failed for %s", plan_id)

    lo, hi = w.params["demo"]["syntheticDelayS"]
    loop.call_later(random.uniform(lo, hi), go)


def withdraw(w: World, viewer: str, plan_id: str) -> None:
    """Silent (P6): nobody else hears about it."""
    plans.require_opted_in(w, viewer)
    plans.get(w, viewer, plan_id)
    j = w.join_of(viewer, plan_id)
    if not j or j["status"] == "withdrawn":
        raise not_found()
    if j["status"] != "interested":
        raise Fail(
            409,
            "conflict",
            "The group already formed. Use Can't make it on the meetup.",
        )
    j["status"] = "withdrawn"
    p = w.plans[plan_id]
    if p["status"] == "full":
        p["status"] = "open"
    w.emit(viewer, "join.updated", view(w, j))
    w.emit(viewer, "calendar.changed")


def form(w: World, plan_id: str) -> list[str]:
    """Run form_groups; seat groups as meetups; leftovers become not_filled with alternatives."""
    p = w.plans[plan_id]
    if p["status"] in ("closed", "cancelled"):
        raise Fail(409, "conflict", "This plan already formed.")
    waiting = [j for j in w.active_joins(plan_id) if j["status"] == "interested"]
    by_user = {j["userId"]: j for j in waiting}
    groups, unseated = w.match.form_groups(w, p, list(by_user))
    if not groups and not (p["status"] == "full"):
        return []  # not enough yet; stay open
    created = [meetups.create(w, p, [by_user[u] for u in g]) for g in groups]
    p["status"] = "closed"
    for uid in unseated:
        j = by_user[uid]
        j["status"] = "not_filled"
        j["alternatives"] = [a["planId"] for a in plans.detail(w, uid, p)["alternatives"]]
        w.emit(uid, "join.updated", view(w, j))
        w.emit(uid, "calendar.changed")
    for mt in created:
        w.on_formed(w, mt)
    return created
