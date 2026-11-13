"""createPlan (PRD-2 §3.4): my own words, or "Plan something like this" from a share, into a plan I'm in.

Muse (or the keyword fallback) reads the text; the server picks the venue and time, screens the text like user
plans (Laya plan_ok; skipped under LAYA_FAKE, as for share captions), and joins the creator.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta

from cg_api import ports
from cg_api.domain import joins, plans, screen
from cg_api.domain.world import Fail, World, iso, parse
from cg_api.settings import get_settings

log = logging.getLogger("cg_api.domain.create_plan")
HOURS = {"morning": 10, "afternoon": 14, "evening": 18}
DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def counted_meetups(w: World, uid: str) -> int:
    return sum(1 for m in w.meetups.values() if m["members"].get(uid, {}).get("counted"))


def can_create(w: World, uid: str) -> bool:
    """Me.capabilities.canCreatePlans: the create_plans unlock, earned by counted meetups (params.unlocks)."""
    need = next((u["afterConfirmedMeetups"] for u in w.params["unlocks"] if u["unlockId"] == "create_plans"), 1)
    return counted_meetups(w, uid) >= need


def _venue(w: World, viewer: str, text: str, pool: str | None, wanted: list[str], link: dict | None) -> dict | None:
    """A venue the text names, else a pasted maps link's nearest venue, else the nearest that hosts the activity."""
    vs = [
        v
        for v in w.venues.values()
        if not v.get("sensitive") and (pool is None or v.get("poolId") in (None, pool) or _in_pool(w, v, pool))
    ]
    named = [v for v in vs if v["name"].lower() in text.lower()]
    if named:
        return max(named, key=lambda v: len(v["name"]))
    if link:
        from cg_api.muse import bar

        if near := bar.nearest_venue(link, vs):
            return near
    hosts = [v for v in vs if set(v["activityTypes"]) & set(wanted)]
    if not hosts:
        return None
    from cg_api.muse import bar

    here = w.centroid(viewer)
    return min(hosts, key=lambda v: (bar.km(here, (v["location"]["lat"], v["location"]["lng"])), v["venueId"]))


def _in_pool(w: World, v: dict, pool: str) -> bool:
    """Venues carry no poolId in the seed; a venue belongs to a pool when one of that pool's plans uses it."""
    return any(p["venueId"] == v["venueId"] and p.get("poolId") == pool for p in w.plans.values())


def _days(text: str, f: dict, today) -> list:
    """A weekday the text names beats "weekend" (the keyword parser's elif chain lets weekend win)."""
    named = [i for i, d in enumerate(DAYS) if re.search(rf"\b{d}\b", text, re.I)]
    if named:
        return [today + timedelta((i - today.weekday()) % 7) for i in named]
    return [datetime.fromisoformat(d).date() for d in f.get("days") or []]


def _start(w: World, text: str, f: dict) -> datetime:
    """The asked day/part if far enough ahead; if too soon, the next days at the same part (tonight -> tomorrow
    evening), never silently a week out; nothing asked -> the next weekend morning (local time)."""
    lead = w.now() + timedelta(hours=w.params["plans"]["minLeadHours"])
    hour = HOURS.get(f.get("part") or "", None)
    today = w.now().astimezone(plans.TZ).date()
    asked = _days(text, f, today)
    if not asked:
        sat = today + timedelta((5 - today.weekday()) % 7)
        asked = [sat, sat + timedelta(1)]
    days = asked + [asked[0] + timedelta(k) for k in range(1, 8)]
    for d in days:
        start = datetime(d.year, d.month, d.day, hour or (10 if d.weekday() >= 5 else 18), tzinfo=plans.TZ)
        if start >= lead:
            return start
    return lead.astimezone(plans.TZ).replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)


async def create(w: World, viewer: str, text, invite_ids=None) -> dict:
    u = plans.require_opted_in(w, viewer)
    if not w.params["features"]["userPlans"]:
        raise Fail(403, "not_allowed", "Creating meetups isn't available yet.")
    if not isinstance(text, str) or not text.strip() or len(text) > w.params["muse"]["askMaxChars"]:
        raise Fail(400, "validation_failed", "Tell Muse what you'd like to do, in a sentence or two.")
    if not can_create(w, viewer):
        raise Fail(403, "not_allowed", "You can create meetups after your first one.")
    invite_ids = list(dict.fromkeys(invite_ids or []))
    if not all(
        isinstance(i, str)
        and (c := w.connections.get(frozenset((viewer, i))))
        and c["status"] == "met"
        and not w.blocked(viewer, i)
        for i in invite_ids
    ):
        raise Fail(403, "not_allowed", "You can invite people you've met.")
    week_ago = w.now() - timedelta(days=7)
    mine = [p for p in w.plans.values() if p.get("creatorId") == viewer and parse(p["createdAt"]) > week_ago]
    if len(mine) >= w.params["plans"]["userPlansPerWeek"]:
        raise Fail(429, "rate_limited", "That's a lot of meetups this week. Join one, or try again in a few days.")
    open_n = sum(1 for j in w.joins.values() if j["userId"] == viewer and j["status"] == "interested")
    if open_n >= w.params["plans"]["openJoinsMax"]:
        raise Fail(429, "rate_limited", "You're in a lot of meetups already. Wait for one to fill first.")
    text = text.strip()
    if screen.blocked(text):
        raise Fail(422, "screened", "Muse can't set that one up. Try a different idea for a group.")
    if get_settings().laya_fake:
        log.info("createPlan: LAYA_FAKE, plan_ok screen skipped for %s", viewer)
    else:
        p, decisive = await ports.ports.laya.ask("plan_ok", {"text": text})
        if decisive and p < 0.5:
            raise Fail(422, "screened", "Muse can't set that one up. Try a different idea for a group.")

    from cg_api.muse import bar  # D's Muse bar parser: Muse, else keywords

    s = get_settings()
    f, _ = await bar.understand(ports.ports.muse, text, [], iso(w.now()), s.contracts_dir)
    pool = u.get("poolId") or w.demo.get("poolId")
    venue = _venue(w, viewer, text, pool, f["activityTypes"], f.get("link"))
    if venue is None:
        raise Fail(
            400, "validation_failed", "Muse couldn't turn that into a meetup. Try naming an activity or a place."
        )
    activity = next((a for a in f["activityTypes"] if a in venue["activityTypes"]), venue["activityTypes"][0])
    start = _start(w, text, f)
    try:
        cgm_map = ports.matching().ACTIVITY_INTERESTS  # the activity -> interest mapping lives in cg_matching
    except ports.Unavailable:
        cgm_map = {}
    targets = [
        t
        for t in [*cgm_map.get(activity, []), *[i for i in f["interestIds"] if i.count(".") == 1]]
        if t in w.taxonomy and not w.taxonomy[t]["sensitive"]
    ] or ["travel.local_exploring"]
    # never the creator's raw words: others see this title, and it lands in their calendar holds (P7)
    title = plans.with_venue(plans.activity_noun(activity), venue["name"])
    try:
        title = (
            await ports.ports.copy.plan_title({"title": title, "activityType": activity, "venueName": venue["name"]})
        )[:60]
    except Exception:  # noqa: BLE001  (D4: copy failure keeps the template)
        log.warning("createPlan: plan_title copy failed; keeping %r", title)
    met_only = bool(invite_ids)
    size = dict(w.params["plans"]["defaultSize"])
    if met_only:
        size["min"] = w.params["groups"]["metSizeMin"]
    # seed copy for this activity says what it's like; time, place and price are already in the header.
    # food_crawl copy implies several stops, but a created plan is one venue: use the generic line
    blurb = next((x["description"] for x in w.plans.values() if x["origin"] != "user" and x["activityType"] == activity != "food_crawl"), None)
    rec = {
        "planId": w.next_id("pl_u"),
        "poolId": pool,
        "title": title[:60],
        "description": blurb or "A relaxed get-together with people who share your interests.",
        "activityType": activity,
        "venueId": venue["venueId"],
        "startsAt": iso(start),
        "endsAt": iso(start + timedelta(hours=2)),
        "size": size,
        "cost": dict(venue["booking"]["cost"]),
        "targetInterestIds": list(dict.fromkeys(targets)),
        "origin": "invite" if met_only else "user",
        "creatorId": viewer,
        "inviteUserIds": invite_ids,
        "createdAt": iso(w.now()),
    }
    plan = w.add_plan(rec)
    joins.join(w, viewer, plan["planId"])
    for uid in invite_ids:
        w.emit(uid, "feed.updated")
    await plans.warm_reasons(w, viewer, [plan["planId"]])  # the pop-up opens on this plan: give it Muse's line
    return plans.detail(w, viewer, plan)
