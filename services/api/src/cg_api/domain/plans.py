"""PlanCard, PlanDetail and the For you feed, built per viewer."""

from __future__ import annotations

import logging
from datetime import timedelta
from zoneinfo import ZoneInfo

from cg_api import ports
from cg_api.domain import privacy
from cg_api.domain.world import Fail, World, iso, not_found, parse

log = logging.getLogger("cg_api.domain.plans")
TZ = ZoneInfo("America/Los_Angeles")  # ponytail: one city; per-pool tz when a second pool lands


ACTIVITY_NOUNS = {  # laya_questions.yaml#activityTypes as card copy; unknown types fall back to the ID in words
    "coffee": "Coffee", "walk": "Walk", "hike": "Hike", "climbing_session": "Climbing session", "run": "Group run",
    "pickup_sport": "Pickup game", "board_game_night": "Board game night", "video_game_session": "Game session",
    "trivia_night": "Trivia night", "concert": "Live music", "museum_visit": "Museum visit",
    "film_screening": "Film night", "cooking_together": "Cooking night", "food_crawl": "Food crawl",
    "brunch": "Brunch", "craft_session": "Craft session", "ceramics_studio": "Wheel-throwing",
    "photo_walk": "Photo walk", "book_club": "Book club", "language_exchange": "Language exchange",
    "volunteering": "Volunteering", "farmers_market": "Farmers market stroll", "yoga_class": "Yoga class",
    "beach_day": "Beach day", "picnic": "Picnic", "karaoke": "Karaoke night", "dance_class": "Dance class",
    "hackathon_or_cowork": "Cowork session", "bike_ride": "Bike ride", "comedy_show": "Comedy night",
}  # fmt: skip


def activity_noun(activity_type: str) -> str:
    return ACTIVITY_NOUNS.get(activity_type) or activity_type.replace("_", " ").capitalize()


def with_venue(title: str, venue: str) -> str:
    """Name the venue once: 'Board games at Meeple Harbor', never '... at Meeple Harbor at Meeple Harbor'."""
    return title if venue in title else f"{title} at {venue}"


def money(cents: int) -> str:
    return f"${cents // 100}" if cents % 100 == 0 else f"${cents / 100:.2f}"


def cost_view(cost: dict) -> dict:
    c = {k: cost[k] for k in ("kind", "perPersonCents", "currency")}
    amt = money(cost["perPersonCents"])
    c["label"] = cost.get("label") or {
        "free": "Free",
        "prepaid": f"{amt} per person",
    }.get(cost["kind"], f"{amt}, pay there")
    return c


def venue_view(w: World, v: dict) -> dict:
    out = {k: v[k] for k in ("venueId", "name", "neighborhood", "address", "location", "kind") if k in v}
    photo = v.get("photo")
    out["photoUrl"] = f"{w.base()}/static/venues/{photo.rsplit('/', 1)[-1]}" if photo else None
    return out


def capacity(w: World, plan: dict) -> int:
    """size.max x groups the venue can host per slot."""
    cap = w.venues[plan["venueId"]]["booking"]["capacityPerSlot"]
    return plan["size"]["max"] * max(1, cap // plan["size"]["max"])


def visible(w: World, viewer: str, plan: dict) -> bool:
    if plan.get("origin") == "invite":
        return viewer in plan["inviteUserIds"] or viewer == plan.get("creatorId")
    return True


def get(w: World, viewer: str, plan_id: str) -> dict:
    p = w.plans.get(plan_id)
    if not p or not visible(w, viewer, p):
        raise not_found()
    return p


def travel(w: World, viewer: str, venue: dict) -> dict | None:
    """Fastest allowed mode from the viewer's neighborhood centroid (P8)."""
    modes = (w.users[viewer].get("travel") or {}).get("modes") or ["transit"]
    dest = (venue["location"]["lat"], venue["location"]["lng"])
    best = min(
        ((w.match.travel_minutes(w.centroid(viewer), dest, m, w.params), m) for m in modes),
        default=None,
    )
    if not best:
        return None
    mins, mode = best
    label = {"walk": "walk", "bike": "bike", "transit": "transit", "drive": "car"}.get(mode, mode)
    return {
        "mode": mode,
        "minutes": mins,
        "label": f"{mins} min by {label}" if mode != "walk" else f"{mins} min walk",
    }


def _fits(w: World, viewer: str, plan: dict) -> bool:
    buf = timedelta(minutes=w.params["calendar"]["minFreeBufferMin"])
    s, e = parse(plan["startsAt"]) - buf, parse(plan["endsAt"]) + buf
    return not any(parse(b["start"]) < e and parse(b["end"]) > s for b in w.users[viewer]["busy"])


def checks(w: World, viewer: str, plan: dict, trav: dict | None, crowd: dict) -> list[dict]:
    day = parse(plan["startsAt"]).astimezone(TZ).strftime("%A")
    fits = _fits(w, viewer, plan)
    out = [
        {
            "kind": "calendar",
            "ok": fits,
            "label": f"Fits your {day}" if fits else f"You're busy {day}",
        }
    ]
    if trav:
        max_min = (w.users[viewer].get("travel") or {}).get("maxMinutes") or w.params["travel"]["defaultMaxMinutes"]
        out.append({"kind": "travel", "ok": trav["minutes"] <= max_min, "label": trav["label"]})
    left = crowd["spotsLeft"]
    out.append(
        {
            "kind": "spots",
            "ok": left > 0,
            "label": f"{left} spot{'s' if left != 1 else ''} left" if left else "Full",
        }
    )
    if plan["cost"]["kind"] == "prepaid":
        out.append(
            {
                "kind": "cost",
                "ok": True,
                "label": f"{money(plan['cost']['perPersonCents'])} · Muse can book it",
            }
        )
    return out


def because(w: World, viewer: str, plan: dict) -> list[dict]:
    """P7 owner-only; P4 never from hidden or sensitive signals."""
    targets = set(plan["targetInterestIds"])
    out = []
    for s in w.users[viewer]["signals"]:
        if s.get("visibility") != "shown" or s.get("sensitive"):
            continue
        hits = s.get("venueId") == plan["venueId"] or any(
            i == t or i.startswith(t + ".") for i in s.get("interestIds", []) for t in targets
        )
        if hits:
            out.append(
                {
                    "source": s["provider"],
                    "label": s["label"],
                    "signalId": s.get("signalId"),
                }
            )
    from cg_api.domain import prefs  # cycle: prefs -> world

    if label := prefs.liked_label(w, viewer, plan):  # learned from my own feedback and likes (owner-only)
        out.append({"source": "muse", "label": label, "signalId": None})
    return out


async def warm_reasons(w: World, viewer: str, plan_ids: list[str]) -> None:
    """Muse's one-line reason per (plan, viewer), stored on the plan for the sync card builders. Built only from the
    coarse overlap the viewer may see (Crowd.sharedWithYou), so Copy never gets more than the card shows. Asked on
    every read: Copy answers from its own cache at once (template first, Muse's text once it lands)."""
    for pid in plan_ids:
        p = w.plans.get(pid)
        if not p:
            continue
        p.setdefault("reasons", {})
        shared = privacy.crowd(w, viewer, p, capacity(w, p))["sharedWithYou"]
        try:
            text = await ports.ports.copy.plan_reason(p, [privacy.copy_interest(w, s["interest"]) for s in shared])
        except Exception:
            log.warning("plan_reason copy failed for %s; keeping the last line", pid)
            text = p["reasons"].get(viewer, "")
        p["reasons"][viewer] = text[:160]


def card(w: World, viewer: str, plan: dict) -> dict:
    venue = w.venues[plan["venueId"]]
    cr = privacy.crowd(w, viewer, plan, capacity(w, plan))
    trav = travel(w, viewer, venue)
    j = w.join_of(viewer, plan["planId"])
    return {
        "planId": plan["planId"],
        "title": plan["title"][:60],
        "activityType": plan["activityType"],
        "venue": venue_view(w, venue),
        "startsAt": plan["startsAt"],
        "endsAt": plan["endsAt"],
        "durationMin": int((parse(plan["endsAt"]) - parse(plan["startsAt"])).total_seconds() // 60),
        "cost": cost_view(plan["cost"]),
        "size": plan["size"],
        "crowd": cr,
        "travel": trav,
        "checks": checks(w, viewer, plan, trav, cr),
        "reason": plan.get("reasons", {}).get(viewer, ""),
        "because": because(w, viewer, plan),
        "origin": {"seed": "muse", "signal": "nudge"}.get(plan["origin"], plan["origin"]),
        "status": plan["status"],
        "myJoin": {"joinId": j["joinId"], "status": j["status"]} if j and j["status"] != "withdrawn" else None,
    }


def forms_at(w: World, plan: dict) -> str:
    return iso(parse(plan["startsAt"]) - timedelta(hours=w.params["plans"]["formLeadHours"]))


def directions(venue: dict) -> dict:
    lat, lng = venue["location"]["lat"], venue["location"]["lng"]
    return {
        "apple": f"https://maps.apple.com/?daddr={lat},{lng}&dirflg=r",
        "google": f"https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=transit",
    }


def detail(w: World, viewer: str, plan: dict) -> dict:
    venue = w.venues[plan["venueId"]]
    booking = venue["booking"]
    amt = money(plan["cost"]["perPersonCents"])
    handle = ["No booking needed" if booking["kind"] == "none" else "Book it for the group"]
    if plan["cost"]["kind"] == "prepaid":
        handle.append(f"Ask you before paying {amt}")
    handle += [
        "Add it to your calendar",
        "Open a group chat with an intro",
        "Remind you when to leave",
    ]
    horizon = w.now() + timedelta(days=w.params["plans"]["horizonDays"])
    alts = [
        {"planId": p["planId"], "title": p["title"][:60], "startsAt": p["startsAt"]}
        for p in sorted(w.plans.values(), key=lambda p: p["startsAt"])
        if p["planId"] != plan["planId"]
        and p["activityType"] == plan["activityType"]
        and p["status"] == "open"
        and visible(w, viewer, p)
        and w.now() < parse(p["startsAt"]) <= horizon
    ][: w.params["plans"]["alternativesMax"]]
    smin = max(plan["size"]["min"], w.params["groups"]["strangerSizeMin"])
    return {
        **card(w, viewer, plan),
        "description": plan.get("description", ""),
        "museWillHandle": handle,
        "safety": [
            f"Public {venue.get('kind', 'place').replace('_', ' ')}",
            f"Groups of {smin} or more",
            "Share your plan with a friend in one tap",
        ],
        "formsAt": forms_at(w, plan),
        "alternatives": alts,
        "directions": directions(venue),
    }


def require_opted_in(w: World, viewer: str) -> dict:
    u = w.user(viewer)
    if not u["optedIn"]:
        raise Fail(403, "not_opted_in", "Turn on Common Ground to see plans.")
    return u


def muse_status(w: World, viewer: str) -> str | None:
    setting = sum(
        1
        for m in w.meetups.values()
        if m["status"] == "setting_up" and m["members"].get(viewer, {}).get("rsvp") == "going"
    )
    asks = sum(1 for a in w.approvals.values() if a["userId"] == viewer and a["status"] == "pending")
    if asks:
        return f"Muse needs your OK on {asks} thing{'s' if asks != 1 else ''}"
    if setting:
        return f"Muse is setting up {setting} plan{'s' if setting != 1 else ''} for you"
    return None


def prompts(w: World, viewer: str) -> list[str]:
    seen, out = set(), []
    for i in sorted(w.users[viewer]["interests"], key=lambda i: -i.get("weight", 0)):
        if i.get("visibility") != "shown" or i.get("sensitive"):
            continue
        l2 = ".".join(i["id"].split(".")[:2])
        if l2 in w.taxonomy and l2 not in seen:
            seen.add(l2)
            out.append(w.taxonomy[l2]["label"])
    return out[: w.params["feed"]["promptChips"]]


def _ordered(w: World, viewer: str) -> list[str]:
    """Featured plans first for Maya in DEMO_MODE (shown even if a hard filter drops them), then rank_plans order."""
    ranked = [pid for pid in w.match.rank(w, viewer) if pid in w.plans and visible(w, viewer, w.plans[pid])]
    lead: list[str] = []
    if w.demo_mode and w.params["feed"]["demoPinFeatured"] and viewer == w.demo.get("mayaId"):
        lead = [
            pid for pid in w.demo.get("featuredPlanIds", []) if pid in w.plans and w.plans[pid]["status"] != "cancelled"
        ]
    return list(dict.fromkeys(lead + ranked))


def feed(w: World, viewer: str) -> dict:
    require_opted_in(w, viewer)
    ids = _ordered(w, viewer)[: w.params["feed"]["size"]]
    now = w.now()
    return {
        "generatedAt": iso(now),
        "nextRefreshAt": iso(now + timedelta(hours=w.params["feed"]["refreshHours"])),
        "museStatus": muse_status(w, viewer),
        "prompts": prompts(w, viewer),
        "plans": [card(w, viewer, w.plans[pid]) for pid in ids],
    }


def ranked_cards(w: World, viewer: str) -> list[dict]:
    """Every visible ranked plan as a PlanCard (the Muse bar filters these)."""
    require_opted_in(w, viewer)
    return [card(w, viewer, w.plans[pid]) for pid in _ordered(w, viewer)]


def ordered_ids(w: World, viewer: str, limit: int | None = None) -> list[str]:
    require_opted_in(w, viewer)
    return _ordered(w, viewer)[:limit]
