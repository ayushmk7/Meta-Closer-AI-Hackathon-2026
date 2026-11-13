#!/usr/bin/env python3
"""Walk the whole Common Ground demo flow through the public API and assert each step.

Stdlib only. Runs as u_maya against a DEMO_MODE backend with pool_sf_city loaded:
setup + connectors -> calendar sync -> home (nudge, Surprise me, Muse bar) -> join the
Little Fern Kitchen nudge plan -> group forms -> Muse steps + approvals -> confirmed ->
chat -> verify by code -> completed -> feedback, share, story offer, passport stamp.

    python3 scripts/e2e_flow.py            # expects a fresh u_maya (or run with --reset)
    python3 scripts/e2e_flow.py --reset    # POST /internal/v1/demo/reset first (resets EVERY user)

Env: CG_API_URL (default http://127.0.0.1:8000), CG_INTERNAL_URL (http://127.0.0.1:9001).
Exit code 0 when every step passed; prints one line per step with its wall time.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import UTC, datetime, timedelta

API = os.environ.get("CG_API_URL", "http://127.0.0.1:8000").rstrip("/")
INTERNAL = os.environ.get("CG_INTERNAL_URL", "http://127.0.0.1:9001").rstrip("/")
ME = "u_maya"
NUDGE_VENUE = "Little Fern Kitchen"
WAIT_S = (
    90  # Muse steps run with config.demo.stepDelayS between them; real Muse can be slow
)


def call(method, path, body=None, user=ME, base=API, ok=(200, 201, 204)):
    req = urllib.request.Request(base + path, method=method)
    if user:
        req.add_header("X-CG-User", user)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=40) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    out = json.loads(raw) if raw else None
    if status not in ok:
        raise AssertionError(f"{method} {path} -> {status} {raw[:300]!r}")
    return out


def wait_for(what, fn, timeout=WAIT_S, every=1.0):
    end = time.monotonic() + timeout
    while True:
        v = fn()
        if v:
            return v
        if time.monotonic() > end:
            raise AssertionError(f"timed out after {timeout}s waiting for {what}")
        time.sleep(every)


STEPS = []


def step(name):
    def deco(fn):
        STEPS.append((name, fn))
        return fn

    return deco


S = {}  # state passed between steps


@step("health + config")
def _():
    h = call("GET", "/v1/health", user=None)
    assert h["status"] == "ok" and h["demoMode"], h
    c = call("GET", "/v1/config")
    S["config"] = c
    assert c["features"].get("connectors") and c["features"].get("nudges"), c[
        "features"
    ]
    S["mode"] = next(m for m in c["modes"] if m.get("poolId") == "pool_sf_city")
    return f"muse={h['muse']} laya={h['laya']}"


@step("opt in (Welcome -> Log in -> Turn on)")
def _():
    me = call("GET", "/v1/me")
    if not me["optedIn"]:
        me = call(
            "POST",
            "/v1/optin",
            {"mode": S["mode"]["mode"], "poolId": S["mode"]["poolId"]},
        )
    assert me["optedIn"] and me["poolId"] == "pool_sf_city", me
    return f"setupComplete={me['setupComplete']}"


@step("connect apps")
def _():
    conns = {c["provider"]: c for c in call("GET", "/v1/connectors")["items"]}
    for p in ("google_maps", "google_calendar", "device_calendar"):
        if conns[p]["status"] != "connected":
            call("POST", f"/v1/connectors/{p}")
    conns = {c["provider"]: c for c in call("GET", "/v1/connectors")["items"]}
    assert conns["google_maps"]["status"] == "connected", conns["google_maps"]
    assert conns["google_maps"]["signalCount"] > 0, (
        "Google Maps connected but no signals"
    )
    sig = call("GET", "/v1/signals")["items"]
    assert sig, "no signals after connecting"
    return f"{len(sig)} signals"


@step("setup: accept interests")
def _():
    s = call("GET", "/v1/me/setup")
    props = s["proposedInterests"]
    assert props and s.get("museText"), s
    shown = [
        p["interest"]["id"]
        for p in props
        if not p["sensitive"] and p["visibility"] == "shown"
    ]
    hidden = [
        p["interest"]["id"]
        for p in props
        if p["sensitive"] or p["visibility"] != "shown"
    ]
    me = call("GET", "/v1/me")
    me = call(
        "POST",
        "/v1/me/setup",
        {
            "acceptedInterestIds": shown,
            "hiddenInterestIds": hidden,
            "groupSize": me["groupSize"],
            "travel": me["travel"],
            "availability": me["availability"],
            "profileVisibility": me["profileVisibility"],
        },
    )
    assert me["setupComplete"], me
    return f"{len(shown)} shown, {len(hidden)} hidden"


@step("calendar sync")
def _():
    now = datetime.now(UTC).replace(microsecond=0)
    z = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
    horizon = S["config"]["limits"]["calendarHorizonDays"]
    r = call(
        "POST",
        "/v1/calendar/sync",
        {
            "source": "device_calendar",
            "horizonStart": z(now),
            "horizonEnd": z(now + timedelta(days=horizon)),
            "busy": [
                {
                    "start": z(now + timedelta(days=1)),
                    "end": z(now + timedelta(days=1, hours=1)),
                }
            ],
            "applied": [],
        },
    )
    assert r["acceptedBusy"] == 1, r
    return f"{len(r['directives'])} directives"


@step("home: feed + Little Fern nudge + Surprise me")
def _():
    feed = call("GET", "/v1/feed")
    plans = feed["plans"]
    assert plans, "empty feed"
    nudges = call("GET", "/v1/nudges")["items"]
    fern = [n for n in nudges if NUDGE_VENUE in json.dumps(n)]
    if not fern:  # nudge copy may not name the venue; check the plan it points at
        fern = [
            n
            for n in nudges
            if NUDGE_VENUE in json.dumps(call("GET", f"/v1/plans/{n['planId']}"))
        ]
    assert fern, f"no {NUDGE_VENUE} nudge in {[n['title'] for n in nudges]}"
    S["nudge"] = fern[0]
    surprise = [p for p in plans if not p.get("myJoin")]
    assert surprise, "Surprise me has nothing to open"
    call("GET", f"/v1/plans/{surprise[0]['planId']}")
    return f"{len(plans)} plans, nudge '{fern[0]['title']}'"


@step("Muse bar")
def _():
    r = call("POST", "/v1/muse/ask", {"text": "something low-key with food this week"})
    assert r["reply"]["text"] and r["conversationId"], r
    return f"{len(r['plans'])} plans: {r['reply']['text'][:60]!r}"


@step("join nudge plan -> synthetic people join -> group forms")
def _():
    pid = S["nudge"]["planId"]
    call("POST", f"/v1/plans/{pid}/join", {})

    def matched():
        j = next(
            (j for j in call("GET", "/v1/joins")["items"] if j["planId"] == pid), None
        )
        assert j and j["status"] in ("interested", "matched"), j
        return j if j["status"] == "matched" else None

    j = wait_for("group to form", matched)
    S["meetupId"] = j["meetupId"]
    m = call("GET", f"/v1/meetups/{j['meetupId']}")
    others = [a for a in m["attendees"] if not a["isMe"]]
    assert len(others) >= 2, m["attendees"]
    assert NUDGE_VENUE in m["venue"]["name"], m["venue"]
    S["others"] = [a["person"]["userId"] for a in others]
    return f"{m['meetupId']} with {len(others)} others at {m['venue']['name']}"


@step("Muse steps + approval -> confirmed")
def _():
    mid, approved = S["meetupId"], []

    def confirmed():
        for a in call("GET", "/v1/approvals")["items"]:
            if a["meetupId"] == mid and a["status"] == "pending":
                call(
                    "POST",
                    f"/v1/approvals/{a['approvalId']}/decision",
                    {"decision": "approve"},
                )
                approved.append(a["kind"])
        m = call("GET", f"/v1/meetups/{mid}")
        assert m["status"] in ("setting_up", "confirmed"), m["status"]
        assert (
            not any(s["status"] == "failed" for s in m["museSteps"])
            or m["status"] == "confirmed"
        )
        return m if m["status"] == "confirmed" else None

    m = wait_for("meetup confirmed", confirmed)
    kinds = [s["kind"] for s in m["museSteps"]]
    assert m["booking"] and m["booking"].get("status") in (
        "booked",
        "pay_at_venue",
        "not_needed",
    ), m["booking"]
    S["meetup"] = m
    return f"steps={kinds} approved={approved} booking={m['booking'].get('status')}"


@step("chat with synthetic people")
def _():
    tid = S["meetup"]["threadId"]
    msgs = call("GET", f"/v1/threads/{tid}/messages")["items"]
    assert msgs and msgs[0]["sender"]["kind"] == "muse", (
        "no Muse intro in the group chat"
    )
    before = len(msgs)
    call(
        "POST",
        f"/v1/threads/{tid}/messages",
        {"text": "Excited to meet you all!", "clientId": str(uuid.uuid4())},
    )

    def reply():
        ms = call("GET", f"/v1/threads/{tid}/messages")["items"]
        return [m for m in ms[before + 1 :] if m["sender"].get("userId") != ME] or None

    r = wait_for("a reply from the group", reply, timeout=45)
    call("POST", f"/v1/threads/{tid}/read")
    return f"{len(r)} replies, first: {r[0]['text'][:50]!r}"


@step("verify by code (QR)")
def _():
    mid = S["meetupId"]
    mine = call("GET", f"/v1/meetups/{mid}")
    assert mine.get("verifyCode"), "no verifyCode for me"
    other = S["others"][0]
    theirs = call("GET", f"/v1/meetups/{mid}", user=other)["verifyCode"]
    r = call("POST", f"/v1/meetups/{mid}/verify", {"code": theirs})
    m = call("GET", f"/v1/meetups/{mid}")
    v = {a["person"]["userId"]: a.get("verified") for a in m["attendees"]}
    assert v.get(other), f"{other} not verified: {r}"
    return f"verified {other}"


@step("after meetup: completed -> feedback, share, story, passport")
def _():
    mid = S["meetupId"]
    call(
        "POST",
        f"/internal/v1/demo/meetups/{mid}/advance",
        {"to": "completed"},
        user=None,
        base=INTERNAL,
    )
    m = call("GET", f"/v1/meetups/{mid}")
    assert m["status"] == "completed" and m["feedbackDue"], (
        m["status"],
        m["feedbackDue"],
    )
    answers = [{"userId": u, "showedUp": True, "meetAgain": True} for u in S["others"]]
    call(
        "POST",
        f"/v1/meetups/{mid}/feedback",
        {"answers": answers, "rating": 5, "tags": ["great_venue", "good_group"]},
    )
    assert not call("GET", f"/v1/meetups/{mid}")["feedbackDue"]
    sh = call(
        "POST", f"/v1/meetups/{mid}/share", {"caption": "Lovely dinner at Little Fern"}
    )
    assert any(
        s["shareId"] == sh["shareId"]
        for s in call("GET", "/v1/shares", user=None)["items"]
    ), sh
    assert m["venue"].get("photoUrl"), "no venue.photoUrl -> app hides the story offer"
    rw = call("GET", "/v1/me")["rewards"]
    assert rw["confirmedMeetups"] >= 1, rw  # passport stamp counts this meetup
    conns = call("GET", "/v1/connections")["items"]
    return f"share {sh['shareId']}, rewards={rw['confirmedMeetups']}, {len(conns)} connections"


def main():
    if "--reset" in sys.argv:
        call("POST", "/internal/v1/demo/reset", user=None, base=INTERNAL)
    failed = 0
    for i, (name, fn) in enumerate(STEPS, 1):
        t = time.monotonic()
        try:
            note = fn() or ""
            print(f"PASS {i:02d} {name} ({time.monotonic() - t:.1f}s) {note}")
        except Exception as e:  # noqa: BLE001 - report and stop: later steps depend on this one
            print(f"FAIL {i:02d} {name} ({time.monotonic() - t:.1f}s) {e}")
            failed = 1
            break
    sys.exit(failed)


if __name__ == "__main__":
    main()
