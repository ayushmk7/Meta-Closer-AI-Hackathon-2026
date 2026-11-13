"""Connections, profiles, reports and blocks. People reach a client only through a formed group (P5)."""

from __future__ import annotations

from cg_api.domain import privacy
from cg_api.domain.world import Fail, World, iso, not_found

REPORT_REASONS = {"threat", "harassment", "no_show_pattern", "fake_account", "other"}


def _mine(w: World, viewer: str) -> list[tuple[str, dict]]:
    return [(next(iter(k - {viewer})), c) for k, c in w.connections.items() if viewer in k and not w.blocked(*k)]


def connection_view(w: World, viewer: str, other: str, c: dict) -> dict:
    return {
        "connectionId": c["connectionId"],
        "person": privacy.person_card(w, other),
        "sharedInterests": privacy.shared_full(w, viewer, other),
        "status": c["status"],
        "meetupsTogether": c["meetupsTogether"],
        "connectedAt": c["connectedAt"],
        "firstMetAt": c["firstMetAt"],
        "canViewProfile": w.users[other].get("profileVisibility") != "private",
        "canPlanAgain": c["status"] == "met",
    }


def list_connections(w: World, viewer: str) -> list[dict]:
    rows = sorted(
        _mine(w, viewer),
        key=lambda oc: (oc[1]["connectedAt"], oc[1]["connectionId"]),
        reverse=True,
    )
    return [connection_view(w, viewer, o, c) for o, c in rows]


def get_person(w: World, viewer: str, user_id: str) -> dict:
    if user_id not in w.users or w.blocked(viewer, user_id):
        raise not_found("profile")
    c = w.connections.get(frozenset((viewer, user_id)))
    if not c or user_id == viewer or w.users[user_id].get("profileVisibility") == "private":
        raise Fail(403, "not_allowed", "This profile is private.")
    u = w.users[user_id]
    return {
        "person": privacy.person_card(w, user_id),
        "bio": u.get("bio"),
        "neighborhood": u.get("neighborhood"),
        "sharedInterests": privacy.shared_full(w, viewer, user_id),
        "meetupsTogether": c["meetupsTogether"],
    }


def block(w: World, viewer: str, user_id: str) -> None:
    if user_id == viewer or user_id not in w.users:
        raise Fail(400, "validation_failed", "Couldn't block that person. Try again from their profile.")
    w.blocks.add(frozenset((viewer, user_id)))  # idempotent; P9 filters key off this set


def report(w: World, viewer: str, body: dict) -> dict:
    if body.get("userId") not in w.users or body.get("userId") == viewer or body.get("reason") not in REPORT_REASONS:
        raise Fail(400, "validation_failed", "Couldn't send that report. Pick a reason and try again.")
    rid = w.next_id("rp_")
    # ponytail: stored only; Laya severity + account pause are M2.
    w.reports.append(
        {
            "reportId": rid,
            "by": viewer,
            "at": iso(w.now()),
            **{k: body.get(k) for k in ("userId", "reason", "text", "threadId", "meetupId")},
        }
    )
    return {"reportId": rid}
