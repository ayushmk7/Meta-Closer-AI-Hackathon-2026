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
    ]
    first = ev[1]["step"]
    assert first["label"] == "Everyone's free Sat 10 AM–12 PM"
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


def test_booking_failure_is_visible_then_rescheduled_in_order():
    r = run(fail_next_booking=True)
    for a in [e["approval"] for e in list(r.start()) if e["type"] == "approval"]:
        list(r.decide(a["approvalId"], "approved"))
    tail = [(s["kind"], s["status"]) for s in r.steps if s["kind"] != "payment"][3:]
    assert tail == [
        ("book", "failed"),
        ("reschedule", "done"),
        ("book", "done"),
        ("calendar", "done"),
        ("event", "done"),
        ("reminder", "done"),
    ]
    labels = [s["label"] for s in r.steps]
    assert "Clay Hour Studio is full at 10 AM" in labels
    assert "Full at 10 AM. Moved it to 11 AM; everyone's still free" in labels
    assert labels[-1] == "Set leave-by reminders for everyone"
    assert r.plan["startsAt"] == "2026-11-14T19:00:00Z"


def test_no_room_stops_before_payments_and_never_claims_booked():
    small = {**VENUE, "booking": {**VENUE["booking"], "capacityPerSlot": 2}}
    ids = count(1)
    r = ScriptedRun("mt_1", HERO, small, PEOPLE, "2026-11-12T18:12:00Z", lambda p: f"{p}_{next(ids)}")
    ev = list(r.start())
    assert steps(ev)[2:] == [("check_availability", "failed"), ("reschedule", "failed"), ("cancel", "done")]
    assert ev[-1]["type"] == "cancelled"  # never a stuck timeline
    assert not any(e["type"] in ("approval", "payment", "confirmed") for e in ev)
    assert [e["booking"]["status"] for e in ev if e["type"] == "booking"] == ["failed"]
    assert not any("Confirmation" in (s["detail"] or "") for s in r.steps)


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


def test_interleaved_decisions_book_once_and_refunds_update_payment():
    r = run()
    aps = [e["approval"]["approvalId"] for e in list(r.start()) if e["type"] == "approval"]
    list(r.decide(aps[0], "approved"))
    g1, g2 = r.decide(aps[1], "approved"), r.decide(aps[2], "approved")
    next(g1), next(g2)  # both decisions land before either generator reaches booking
    out = list(g1) + list(g2)
    assert sum(e["type"] == "booking" for e in out) == 1 and sum(e["type"] == "confirmed" for e in out) == 1

    small = {**VENUE, "booking": {**VENUE["booking"], "capacityPerSlot": 3}}
    ids = count(1)
    r = ScriptedRun(
        "mt_3", HERO, small, PEOPLE, "2026-11-12T18:12:00Z", lambda p: f"{p}_{next(ids)}", fail_next_booking=True
    )
    aps = [e["approval"]["approvalId"] for e in list(r.start()) if e["type"] == "approval"]
    r.reschedule_window_min = 30  # the 1 h retry is out of bounds -> cancel
    out = [e for a in aps for e in r.decide(a, "approved")]
    assert [e["myPayment"] for e in out if e["type"] == "payment"].count("not_needed") == 3
    assert out[-1]["type"] == "cancelled"


def test_parse_time_change():
    from cg_api.agent import parse_time_change

    start = "2026-11-14T18:00:00Z"  # Saturday 10 AM local
    cases = {
        "Muse, can we do 11 instead?": "2026-11-14T19:00:00Z",
        "muse 11:30am?": "2026-11-14T19:30:00Z",
        "Muse can we start at noon": "2026-11-14T20:00:00Z",
        "Muse, an hour later?": "2026-11-14T19:00:00Z",
        "Muse make it 9": "2026-11-14T17:00:00Z",
        "Muse can 3 of us bring friends?": None,
        "Muse what should I bring?": None,
        "Muse can I bring 2 friends?": None,
        "Muse is it 2 hours long?": None,
        "Muse is it 10 minutes from BART?": None,
        "Muse is it $35 each?": None,
        "Muse, is 4 ok?": None,
        "Muse move it to 1pm": "2026-11-14T21:00:00Z",
        "Muse 11 o'clock?": "2026-11-14T19:00:00Z",
        "Muse, 12 PM": "2026-11-14T20:00:00Z",  # the follow-up Muse suggests parses
    }
    for text, want in cases.items():
        assert parse_time_change(text, start) == want, text


def test_reschedule_in_bounds_rebooks_and_replies():
    r = _confirmed()
    events, reply, ids = r.reschedule_to("2026-11-14T19:00:00Z", {})
    kinds = [(e["type"], e.get("step", {}).get("kind")) for e in events]
    assert kinds == [
        ("step", "reschedule"),
        ("reschedule", None),
        ("step", "book"),
        ("booking", None),
        ("step", "calendar"),
        ("calendar", None),
    ]
    assert reply == (
        "Done. Everyone's free at 11 AM and Clay Hour Studio has room then, so I moved it and updated your calendars."
    )
    assert (
        ids == [e["step"]["stepId"] for e in events if e["type"] == "step"]
        and r.plan["endsAt"] == "2026-11-14T21:00:00Z"
    )


def _confirmed():
    r = run()
    for a in [e["approval"] for e in list(r.start()) if e["type"] == "approval"]:
        list(r.decide(a["approvalId"], "approved"))
    return r


def test_reschedule_refused_while_payments_pending():
    r = run()
    list(r.start())
    assert r.reschedule_to("2026-11-14T19:00:00Z", {}) == ([], "I can move it once everyone's OK'd the payment.", [])
    assert r.plan["startsAt"] == HERO["startsAt"]


def test_reschedule_out_of_bounds_changes_nothing_and_offers_a_slot():
    r = _confirmed()
    busy = {"u_0125": [{"start": "2026-11-14T19:00:00Z", "end": "2026-11-14T20:00:00Z"}]}
    n = len(r.steps)
    events, reply, ids = r.reschedule_to("2026-11-14T19:00:00Z", busy)
    assert (events, ids, len(r.steps)) == ([], [], n)
    assert reply == "11 AM doesn't work for everyone, but 12 PM does. Ask me for 12 PM and I'll move it."
    assert "u_0125" not in reply and "Rosa" not in reply  # never who is busy (P6)
    events, reply, _ = r.reschedule_to("2026-11-14T23:00:00Z", {})
    assert (
        events == []
        and reply == "3 PM is too far for me to move it on my own, but 12 PM does. Ask me for 12 PM and I'll move it."
    )
    assert r.plan["startsAt"] == HERO["startsAt"]
