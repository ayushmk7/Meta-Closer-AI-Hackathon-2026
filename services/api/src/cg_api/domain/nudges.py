"""Nudges (PRD-2 §3.7): a strong visible signal -> the best open plan it boosts, copy from Copy.nudge."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from cg_api import ports
from cg_api.domain import plans
from cg_api.domain.world import Fail, World, iso, not_found, parse

log = logging.getLogger("cg_api.domain.nudges")


def _eligible_signals(w: World, uid: str) -> list[dict]:
    """P4: never from hidden or sensitive signals; muted ones are out too."""
    u = w.users[uid]
    floor = w.params["nudges"]["minSignalStrength"]
    muted = u.setdefault("mutedSignals", set())
    sigs = [
        s
        for s in u["signals"]
        if s.get("visibility") == "shown"
        and not s.get("sensitive")
        and s.get("strength", 0) >= floor
        and s.get("signalId") not in muted
    ]
    return sorted(sigs, key=lambda s: (-s.get("strength", 0), s.get("signalId") or ""))


def _plan_for(w: World, uid: str, sig: dict) -> dict | None:
    """Open, visible, upcoming, not joined; venue match beats interest match; the demo's nudgePlanId wins its venue."""
    now = w.now()

    def ok(p: dict) -> bool:
        j = w.join_of(uid, p["planId"])
        return (
            p["status"] == "open"
            and plans.visible(w, uid, p)
            and parse(p["startsAt"]) > now
            and not (j and j["status"] != "withdrawn")
        )

    def fit(p: dict) -> int:
        if sig.get("venueId") and p["venueId"] == sig["venueId"]:
            return 2
        ids = sig.get("interestIds") or []
        return int(
            any(i == t or i.startswith(t + ".") or t.startswith(i + ".") for i in ids for t in p["targetInterestIds"])
        )

    demo_pick = w.demo.get("nudgePlanId") if w.demo_mode else None
    ranked = sorted(
        (p for p in w.plans.values() if ok(p) and fit(p)),
        key=lambda p: (p["planId"] != demo_pick, -fit(p), p["startsAt"], p["planId"]),
    )
    return ranked[0] if ranked else None


def _quiet(w: World, at: datetime) -> bool:
    q = w.params["nudges"]["quietHours"]
    hm = at.astimezone(plans.TZ).strftime("%H:%M")
    return hm >= q["start"] or hm < q["end"]


async def refresh(w: World, uid: str) -> None:
    """Create due nudges: one per signal, at most maxPerWeek, never in quiet hours (except DEMO_MODE).
    A nudge keeps the copy it was created with (Muse's if Copy had it cached, else the template): re-asking on each
    read swapped the wording under the user's eyes (e2e-fable #24)."""
    u = w.users.get(uid)
    if not u or not u.get("optedIn"):
        return
    now, p = w.now(), w.params["nudges"]
    if _quiet(w, now) and not w.demo_mode:  # ponytail: wait for morning by not creating; the next list after 08:00 does
        return
    mine = [n for n in w.nudges.values() if n["userId"] == uid]
    week = sum(1 for n in mine if parse(n["createdAt"]) > now - timedelta(days=7))
    used = {n["signalId"] for n in mine}
    for sig in _eligible_signals(w, uid):
        if week >= p["maxPerWeek"]:
            break
        if sig["signalId"] in used or not (plan := _plan_for(w, uid, sig)):
            continue
        card = plans.card(w, uid, plan)
        try:
            title, text = await ports.ports.copy.nudge(sig["label"], card)
        except Exception:
            log.exception("nudge copy failed for %s; using template", sig["signalId"])
            title, text = card["title"][:60], f"{sig['label']}. There's a meetup for that: {card['title']}."
        surfaces = ["plans"] + (["home"] if not mine else []) + (["events"] if sig.get("kind") == "ticket" else [])
        n = {
            "nudgeId": w.next_id("nd_"),
            "userId": uid,
            "signalId": sig["signalId"],
            "title": title,
            "text": text,
            "because": [{"source": sig["provider"], "label": sig["label"], "signalId": sig["signalId"]}],
            "planId": plan["planId"],
            "surfaces": surfaces,
            "createdAt": iso(now),
            "expiresAt": iso(min(now + timedelta(hours=p["expiresHours"]), parse(plan["startsAt"]))),
        }
        w.nudges[n["nudgeId"]] = n
        mine.append(n)
        used.add(sig["signalId"])
        week += 1
        w.emit(uid, "nudge.created", view(n))


def view(n: dict) -> dict:
    return {k: n[k] for k in ("nudgeId", "title", "text", "because", "planId", "surfaces", "createdAt", "expiresAt")}


def _live(w: World, n: dict) -> bool:
    j = w.join_of(n["userId"], n["planId"])
    if j and j["status"] != "withdrawn":
        n["joined"] = True  # metrics (nudgesJoined); a joined plan's nudge is done
    # P4: the signal it quotes must still be there and shown (the user can hide or delete it after the nudge exists)
    sig = next((s for s in w.users[n["userId"]]["signals"] if s.get("signalId") == n["signalId"]), None)
    shown = sig is not None and sig.get("visibility") == "shown" and not sig.get("sensitive")
    return shown and not n.get("dismissed") and not n.get("joined") and parse(n["expiresAt"]) > w.now()


def list_nudges(w: World, viewer: str, surface: str | None = None) -> list[dict]:
    """Empty before opt-in (spec). Newest first."""
    if not w.user(viewer).get("optedIn"):
        return []
    mine = [n for n in w.nudges.values() if n["userId"] == viewer and _live(w, n)]
    mine = [n for n in mine if not surface or surface in n["surfaces"]]
    return [view(n) for n in sorted(mine, key=lambda n: (n["createdAt"], n["nudgeId"]), reverse=True)]


def dismiss(w: World, viewer: str, nudge_id: str, mute: str | None = None) -> None:
    if mute not in (None, "none", "signal"):
        raise Fail(400, "validation_failed", "Couldn't dismiss that. Try again.")
    n = w.nudges.get(nudge_id)
    if not n or n["userId"] != viewer:
        raise not_found("suggestion")
    n["dismissed"] = True
    if mute == "signal":
        w.users[viewer].setdefault("mutedSignals", set()).add(n["signalId"])
