from itertools import count

from cg_api.agent import ScriptedRun, visible_steps

VENUE = {
    "venueId": "vn_clay_hour",
    "name": "Clay Hour Studio",
    "kind": "studio",
    "booking": {"kind": "class", "capacityPerSlot": 8, "payAtVenueAllowed": True},
}
HERO = {
    "activityType": "ceramics_studio",
    "startsAt": "2026-11-14T18:00:00Z",
    "endsAt": "2026-11-14T20:00:00Z",
    "cost": {"kind": "prepaid", "perPersonCents": 3500, "currency": "USD", "label": "$35 per person"},
}
PEOPLE = [{"userId": u, "firstName": n} for u, n in [("u_maya", "Maya"), ("u_0125", "Rosa"), ("u_0144", "Dan")]]


def run(**kw):
    ids = count(1)
    return ScriptedRun("mt_1", HERO, VENUE, PEOPLE, "2026-11-12T18:12:00Z", lambda p: f"{p}_{next(ids):04d}", **kw)


def steps(events):
    return [(e["step"]["kind"], e["step"]["status"]) for e in events if e["type"] == "step"]


def test_hero_default_sequence_waits_for_every_payment():
    r = run()
    ev = list(r.start())
    assert steps(ev) == [
        ("group_chat", "done"),
        ("find_time", "done"),
        ("check_availability", "done"),
        ("payment", "needs_you"),
        ("payment", "needs_you"),
        ("payment", "needs_you"),
        ("book", "queued"),
        ("calendar", "queued"),
        ("event", "queued"),
        ("reminder", "queued"),
    ]
    first = ev[1]["step"]
    assert first["label"] == "Everyone's free Saturday 10 to 12"
    approvals = [e["approval"] for e in ev if e["type"] == "approval"]
    assert [a["title"] for a in approvals] == ["OK $35 for your wheel?"] * 3 and all(a["simulated"] for a in approvals)
    assert approvals[0]["expiresAt"] == "2026-11-13T06:12:00Z"  # now + 12 h, before start - 2 h

    # P11: two approvals in, still no booking
    out = list(r.decide(approvals[0]["approvalId"], "approved")) + list(
        r.decide(approvals[1]["approvalId"], "approved")
    )
    assert not any(e["type"] in ("booking", "confirmed") for e in out)

    # declined with payAtVenueAllowed -> pay there; then the run finishes
    out = list(r.decide(approvals[2]["approvalId"], "declined"))
    assert {"type": "payment", "userId": "u_0144", "myPayment": "pay_at_venue"} in out
    booking = next(e["booking"] for e in out if e["type"] == "booking")
    assert booking["status"] == "booked" and booking["confirmationCode"].startswith("CH-")
    assert next(e for e in out if e["type"] == "confirmed")["eventLabel"] == "Private event · 3 going"
    kinds = [s["kind"] for s in r.steps]
    assert kinds.count("book") == 1 and kinds[-1] == "reminder" and "event" in kinds  # queued steps updated, not duped
    assert list(r.decide(approvals[0]["approvalId"], "approved")) == []  # already decided


def test_booking_failure_is_visible_then_rescheduled():
    r = run(fail_next_booking=True)
    for a in [e["approval"] for e in list(r.start()) if e["type"] == "approval"]:
        list(r.decide(a["approvalId"], "approved"))
    book = [s for s in r.steps if s["kind"] in ("book", "reschedule")]
    assert [(s["kind"], s["status"]) for s in book] == [("book", "failed"), ("reschedule", "done"), ("book", "done")]
    assert book[1]["label"] == "Full at 10, so I booked 11 instead; everyone's still free"
    assert r.plan["startsAt"] == "2026-11-14T19:00:00Z"


def test_auto_spend_and_free_plans_and_private_payment_steps():
    people = [{**p, "spendWithoutAskingCents": 5000} for p in PEOPLE]
    ids = count(1)
    r = ScriptedRun("mt_1", HERO, VENUE, people, "2026-11-12T18:12:00Z", lambda p: f"{p}_{next(ids)}")
    ev = list(r.start())
    assert not any(e["type"] == "approval" for e in ev)
    assert "Paid $35 (within your auto-spend limit)" in [s["label"] for s in r.steps]
    mine = visible_steps(r.steps, "u_maya")
    assert sum(s["kind"] == "payment" for s in mine) == 1 and all("forUserId" not in s for s in mine)

    walk = {**HERO, "activityType": "walk", "cost": {"kind": "free", "perPersonCents": 0, "currency": "USD"}}
    trail = {"venueId": "vn_lands_end", "name": "Lands End Trail", "booking": {"kind": "none"}}
    r = ScriptedRun("mt_2", walk, trail, PEOPLE, "2026-11-12T18:12:00Z", lambda p: p)
    ev = list(r.start())
    assert [k for k, _ in steps(ev)] == [
        "group_chat",
        "find_time",
        "check_availability",
        "calendar",
        "event",
        "reminder",
    ]
    assert next(e["booking"] for e in ev if e["type"] == "booking")["status"] == "not_needed"
