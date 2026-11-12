"""User-facing copy: Muse writes it when live, these templates are the MUSE_FAKE output and the fallback (D4).

Prompt privacy (PRD-2 §3.6): every prompt here is built only from the arguments, and plans pass through `public_plan`,
so a prompt about user Y shown to X can only contain what the caller already filtered for X.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from cg_api.muse import Unavailable
from cg_api.muse.extract import taxonomy

log = logging.getLogger("cg_api.muse.copy")
TZ = ZoneInfo("America/Los_Angeles")  # ponytail: pool timezone fixed to SF until a second-city pool exists

# what a seat is called in approvals; default "spot"
SEAT = {
    "ceramics_studio": "wheel",
    "climbing_session": "day pass",
    "yoga_class": "mat",
    "dance_class": "spot",
    "concert": "ticket",
    "comedy_show": "ticket",
    "film_screening": "ticket",
    "museum_visit": "ticket",
    "cooking_together": "station",
    "craft_session": "seat",
}

STARTERS = {
    "ceramics_studio": ["What was the first thing you ever made on a wheel?", "Mugs or bowls?"],
    "walk": ["Best view you've found in the city?", "Coffee before or after?"],
    "hike": ["Favorite trail so far?", "Early start or a lazy one?"],
    "climbing_session": ["Bouldering or ropes?", "What's your project right now?"],
    "board_game_night": ["What game should we start with?", "Strategy or chaos?"],
    "coffee": ["Usual order?", "Best cafe you've found lately?"],
    "run": ["What pace feels good for you?", "Got a favorite route?"],
    "trivia_night": ["What's your secret trivia strength?", "Team name ideas?"],
    "brunch": ["Sweet or savory?", "Best brunch spot you know?"],
    "photo_walk": ["Phone or camera?", "What do you love to shoot?"],
}
GENERIC_STARTERS = ["What got you into this?", "Been here before?", "Anyone up for food after?"]


def public_plan(plan: dict) -> dict:
    """The only plan fields any prompt sees."""
    v = plan.get("venue") or {}
    return {
        "title": plan.get("title", ""),
        "activityType": plan.get("activityType", ""),
        "venue": v.get("name", ""),
        "neighborhood": v.get("neighborhood", ""),
        "startsAt": plan.get("startsAt", ""),
        "endsAt": plan.get("endsAt", ""),
        "cost": (plan.get("cost") or {}).get("label", ""),
    }


# ---------- formatting ----------
def local(iso: str) -> datetime:
    return datetime.fromisoformat(iso).astimezone(TZ)


def day(iso: str) -> str:
    return local(iso).strftime("%A")


def clock(iso: str, ampm: bool = False) -> str:
    t = local(iso)
    h = t.hour % 12 or 12
    s = f"{h}:{t.minute:02d}" if t.minute else str(h)
    return f"{s} {'AM' if t.hour < 12 else 'PM'}" if ampm else s


def money(cents: int) -> str:
    return f"${cents // 100}" if cents % 100 == 0 else f"${cents / 100:.2f}"


def names(first: list[str]) -> str:
    return first[0] if len(first) == 1 else ", ".join(first[:-1]) + " and " + first[-1]


def lc(label: str) -> str:
    """Mid-sentence casing: "Wheel throwing" -> "wheel throwing"; "AI and ML", "CrossFit", "Film & TV" kept."""
    return label[:1].lower() + label[1:] if label[1:] == label[1:].lower() else label


def safe_labels(items: list, sensitive: set[str]) -> list[str]:
    """Labels safe to speak: drops hidden or sensitive interest dicts and any sensitive taxonomy label (P4)."""
    out = []
    for i in items:
        if isinstance(i, dict):
            if i.get("visibility") == "hidden" or i.get("sensitive"):
                continue
            i = i.get("label") or (i.get("interest") or {}).get("label", "")
        if i and i not in sensitive:
            out.append(i)
    return out


def _when(title: str, iso: str) -> str:
    """ " on Saturday", unless the title already says the day."""
    d = day(iso) if iso else ""
    return f" on {d}" if d and d.lower() not in title.lower() else ""


# ---------- templates (also the MUSE_FAKE output) ----------
def intro_text(first_names: list[str], shared_labels: list[str], plan: dict) -> str:
    p = public_plan(plan)
    common = f" You're all into {lc(shared_labels[0])}." if shared_labels else ""
    when = f" See you {day(p['startsAt'])} at {p['venue']}." if p["startsAt"] and p["venue"] else ""
    return f"{names(first_names)}, meet each other!{common}{when} I'm handling the booking and the calendar."


def starters(plan: dict, shared_labels: list[str]) -> list[str]:
    out = list(STARTERS.get(plan.get("activityType", ""), []))
    if len(shared_labels) > 1:
        out.append(f"Anyone else into {lc(shared_labels[1])}?")
    out += GENERIC_STARTERS
    return list(dict.fromkeys(s for s in out if len(s) < 90))[:3]


def approval_copy(plan: dict, venue: dict) -> dict:
    """Payment approval title/detail/fallback (PRD-2 §3.5)."""
    cents = plan["cost"]["perPersonCents"]
    seat = SEAT.get(plan.get("activityType", ""), "spot")
    vname = venue.get("name", "the venue")
    if (venue.get("booking") or {}).get("payAtVenueAllowed"):
        fallback = f"If you'd rather not, I'll ask {vname} to hold your {seat} and you can pay there."
    else:
        fallback = "If you'd rather not, I'll look for a free option or let the group know you can't make it."
    return {
        "title": f"OK {money(cents)} for your {seat}?",
        "detail": f"Muse pays {vname} for your seat on {day(plan['startsAt'])}, "
        f"{clock(plan['startsAt'], True)} to {clock(plan['endsAt'], True)}.",
        "fallback": fallback,
    }


def plan_title(plan: dict) -> str:
    return (plan.get("title") or plan.get("activityType", "plan").replace("_", " ").capitalize())[:60]


def plan_reason(plan: dict, shared_labels: list[str]) -> str:
    p = public_plan(plan)
    venue = f"at {p['venue']}" if p["venue"] else "nearby"
    when = f" on {day(p['startsAt'])}" if p["startsAt"] else ""
    if shared_labels:
        return f"For people into {lc(shared_labels[0])}, {venue}{when}."[:160]
    return f"Something new {venue}{when}."[:160]


def setup_review(interest_labels: list[str]) -> str:
    """Callers pass safe_labels(); sensitive or hidden labels are never spoken."""
    if not interest_labels:
        return "I didn't find much yet. Add a few things you like and I'll find plans for you."
    top = names([lc(x) for x in interest_labels[:3]])
    return f"I noticed you're into {top}. I'll look for small plans around those."


def nudge(signal_label: str, plan: dict) -> tuple[str, str]:
    """(title, text), e.g. ("Lands End Trail on Sunday?", "You've been to ... Sunday coastal walk is open. Want in?")"""
    p = public_plan(plan)
    title = f"{p['venue'] or p['title']} on {day(p['startsAt'])}?" if p["startsAt"] else f"{p['title']}?"
    return title[:80], f"{signal_label}. {p['title'] or 'A plan'}{_when(p['title'], p['startsAt'])} is open. Want in?"[
        :160
    ]


# ---------- live Copy (ports.Copy) ----------
_TEXT = {
    "type": "object",
    "properties": {"text": {"type": "string"}},
    "required": ["text"],
    "additionalProperties": False,
}
_INTRO = {
    "type": "object",
    "properties": {"text": {"type": "string"}, "starters": {"type": "array", "items": {"type": "string"}}},
    "required": ["text", "starters"],
    "additionalProperties": False,
}
_NUDGE = {
    "type": "object",
    "properties": {"title": {"type": "string"}, "text": {"type": "string"}},
    "required": ["title", "text"],
    "additionalProperties": False,
}
VOICE = (
    "You are Muse, the planning assistant in Common Ground. Warm, short, plain. First person, never pretend "
    "to be a person. No emoji, no percentages or scores. Talk about the activity, never about loneliness. "
    "Use only the facts given."
)


class MuseCopy:
    """Implements ports.Copy; any Muse failure or over-long answer falls back to the template."""

    def __init__(self, muse, contracts_dir=None):
        self.muse = muse
        tax = taxonomy(contracts_dir) if contracts_dir else {}
        self.sensitive = {v["label"] for v in tax.values() if v["sensitive"]}

    async def _ask(self, purpose: str, task: str, facts: dict, schema: dict = _TEXT) -> dict | None:
        try:
            r = await self.muse.respond(
                purpose,
                [
                    {"role": "system", "content": VOICE},
                    {"role": "user", "content": f"{task}\nFacts: {json.dumps(facts, ensure_ascii=False)}"},
                ],
                schema=schema,
            )
            return r["json"]
        except Unavailable:
            return None

    async def _text(self, purpose, task, facts, fallback: str, limit: int) -> str:
        j = await self._ask(purpose, task, facts)
        t = (j or {}).get("text", "").strip()
        return t if 0 < len(t) <= limit else fallback

    async def plan_title(self, plan: dict) -> str:
        return await self._text(
            "copy.title", "Write a plan title, at most 60 characters.", public_plan(plan), plan_title(plan), 60
        )

    async def plan_reason(self, plan: dict, shared_labels: list[str]) -> str:
        shared_labels = safe_labels(shared_labels, self.sensitive)
        facts = {"plan": public_plan(plan), "sharedInterests": shared_labels}
        return await self._text(
            "copy.reason",
            "One sentence, at most 160 characters: why this plan fits me.",
            facts,
            plan_reason(plan, shared_labels),
            160,
        )

    async def setup_review(self, user_id: str, interest_labels: list) -> str:
        # user_id is deliberately not sent; labels may be strings or MyInterest-like dicts
        labels = safe_labels(interest_labels, self.sensitive)
        return await self._text(
            "copy.setup",
            "At most 2 sentences reviewing what you noticed I like.",
            {"interests": labels},
            setup_review(labels),
            280,
        )

    async def intro(self, first_names, shared_labels, plan) -> tuple[str, list[str]]:
        shared_labels = safe_labels(shared_labels, self.sensitive)
        facts = {"firstNames": first_names, "sharedInterests": shared_labels, "plan": public_plan(plan)}
        j = await self._ask(
            "copy.intro",
            "Introduce the group in 2 sentences and end with \"I'm handling the "
            'booking and the calendar." Give 3 conversation starters under 90 characters.',
            facts,
            _INTRO,
        )
        st = [s for s in (j or {}).get("starters", []) if 0 < len(s) < 90][:3]
        if j and j.get("text") and len(st) == 3:
            return j["text"], st
        return intro_text(first_names, shared_labels, plan), starters(plan, shared_labels)

    async def nudge(self, signal_label: str, plan: dict) -> tuple[str, str]:
        """(title, text); ports.Copy.nudge is being widened to return both (bplat)."""
        title, text = nudge(signal_label, plan)
        j = await self._ask(
            "copy.nudge",
            "A short nudge about the activity and the place: a title under 40 characters ending in ?, and one "
            "sentence under 160 characters.",
            {"signal": signal_label, "plan": public_plan(plan)},
            _NUDGE,
        )
        t, x = (j or {}).get("title", "").strip(), (j or {}).get("text", "").strip()
        return (t, x) if 0 < len(t) <= 80 and 0 < len(x) <= 160 else (title, text)
