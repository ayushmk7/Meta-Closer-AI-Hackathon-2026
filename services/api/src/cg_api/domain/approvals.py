"""Approval state machine and the P11 money gate."""

from __future__ import annotations

from datetime import timedelta

from cg_api.domain import chat, meetups, plans
from cg_api.domain.world import Fail, World, iso, not_found, parse


def view(a: dict) -> dict:
    return {k: v for k, v in a.items() if k != "userId"}


def create(
    w: World,
    meetup_id: str,
    user_id: str,
    kind: str,
    title: str,
    detail: str,
    fallback: str,
    amount_cents: int | None = None,
    currency: str | None = None,
    payee: str | None = None,
) -> dict:
    m = w.meetups[meetup_id]
    p = w.plans[m["planId"]]
    cap = min(parse(plans.forms_at(w, p)), parse(m["startsAt"]) - timedelta(hours=2))
    expires = min(w.now() + timedelta(hours=w.params["muse"]["approvalExpiresHours"]), cap)
    expires = max(expires, w.now() + timedelta(minutes=5))  # demo forms late; never born expired
    a = {
        "approvalId": w.next_id("ap_"),
        "meetupId": meetup_id,
        "userId": user_id,
        "kind": kind,
        "status": "pending",
        "title": title,
        "detail": detail,
        "amountCents": amount_cents,
        "currency": currency,
        "payee": payee,
        "simulated": True,
        "fallback": fallback,
        "expiresAt": iso(expires),
    }
    return add(w, a)


def add(w: World, a: dict) -> dict:
    """Store an approval (from `create` or D's ScriptedRun), tell its owner, post it inline in their thread view."""
    w.approvals[a["approvalId"]] = a
    w.emit(a["userId"], "approval.requested", view(a))
    thread = w.meetups[a["meetupId"]]["threadId"]
    chat.post(
        w, thread, "muse", None, a["title"], [{"kind": "approval", "approvalId": a["approvalId"]}], only_for=a["userId"]
    )
    return a


def expire(w: World) -> None:
    for a in w.approvals.values():
        if a["status"] == "pending" and parse(a["expiresAt"]) <= w.now():
            _settle(w, a, "expired")


def _settle(w: World, a: dict, status: str) -> None:
    a["status"] = status
    m = w.meetups[a["meetupId"]]
    if a["kind"] == "payment":
        m["members"][a["userId"]]["payment"] = "pending_approval" if status == "approved" else "declined"
    for s in m["steps"]:
        if s["approvalId"] == a["approvalId"] and s["status"] == "needs_you":
            meetups.update_step(w, m["meetupId"], s["stepId"], status="running")
    w.emit(a["userId"], "meetup.updated", meetups.view(w, a["userId"], m["meetupId"]))
    w.on_decided(w, a)  # D runs the in-bounds fallback or continues to book


def pending(w: World, viewer: str) -> list[dict]:
    expire(w)
    mine = [a for a in w.approvals.values() if a["userId"] == viewer and a["status"] == "pending"]
    return [view(a) for a in sorted(mine, key=lambda a: a["approvalId"])]


def decide(w: World, viewer: str, approval_id: str, decision: str) -> dict:
    if decision not in ("approve", "decline"):
        raise Fail(400, "validation_failed", "Choose approve or decline.")
    a = w.approvals.get(approval_id)
    if not a or a["userId"] != viewer:
        raise not_found()
    expire(w)
    if a["status"] != "pending":
        raise Fail(409, "conflict", "This was already decided.")
    _settle(w, a, "approved" if decision == "approve" else "declined")
    return view(a)


def can_pay(w: World, meetup_id: str, user_id: str, amount_cents: int) -> bool:
    """P11: an approved payment approval from that user for at least this amount, or within auto-spend."""
    if amount_cents <= w.users[user_id]["museSettings"].get("spendWithoutAskingCents", 0):
        return True
    return any(
        a["meetupId"] == meetup_id
        and a["userId"] == user_id
        and a["kind"] == "payment"
        and a["status"] == "approved"
        and (a["amountCents"] or 0) >= amount_cents
        for a in w.approvals.values()
    )


def pay(w: World, meetup_id: str, user_id: str, amount_cents: int) -> None:
    """Simulated payment. The only way `myPayment` becomes `paid`."""
    if not can_pay(w, meetup_id, user_id, amount_cents):
        raise Fail(403, "not_allowed", "Muse needs your OK before paying.")
    w.meetups[meetup_id]["members"][user_id]["payment"] = "paid"
