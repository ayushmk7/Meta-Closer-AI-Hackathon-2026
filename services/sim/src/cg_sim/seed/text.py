"""Human text for personas: bios and synthetic Facebook activity.

M0 uses deterministic templates (the `--fake-muse` path). Muse-written text replaces the template
output later behind the same functions, cached under services/sim/.cache/.
Noise is deliberate: passing mentions of non-interests, interests visible only through Groups or
Event RSVPs, and sensitive interests that only appear indirectly. This is what makes the extraction
eval meaningful."""

from __future__ import annotations

import random

from cg_sim.contracts import Leaf

KEEP_CASE_FIRST_WORDS = {
    "Dungeons",
    "Nintendo",
    "Spanish",
    "Japanese",
    "French",
    "Mandarin",
    "Korean",
    "CrossFit",
    "F1",
    "AI",
    "Brazilian",
    "3D",
    "MMOs",
    "RPGs",
    "K-pop",
    "Latin",
    "LGBTQ+",
    "Christianity",
    "Islam",
    "Judaism",
    "Hinduism",
    "Buddhism",
    "D&D",
}


def lower_label(label: str) -> str:
    first = label.split()[0]
    if first in KEEP_CASE_FIRST_WORDS:
        return label
    return label[0].lower() + label[1:]


POST_TEMPLATES = [
    "Another weekend, another round of {x}. Can't get enough of it.",
    "Finally made time for {x} this week and it was exactly what I needed.",
    "Anyone around {hood} into {x}? Always looking for people to go with.",
    "Quick {x} update: still completely hooked.",
    "A few months into {x} and I'm already planning the next session.",
    "Spent the whole afternoon on {x}. No regrets.",
    "Tried a new spot for {x} today. Highly recommend if you're nearby.",
    "If you'd told me a year ago I'd be this into {x}, I wouldn't have believed you.",
]
PHOTO_CAPTIONS = [
    "From today's {x} session.",
    "{X}, again. Happy place.",
    "Proof that I actually went: {x}.",
]
COMMENT_TEMPLATES = [
    "Count me in next time, I love {x}!",
    "This makes me want to get back into {x}.",
    "So good. Where do you usually go for {x}?",
]
GROUP_TEMPLATES = ["{area} {X}", "{X} Friends {area}", "{area} {X} Club", "{X} for Beginners ({area})"]
EVENT_TEMPLATES = ["{X} meetup", "Beginner-friendly {x} night", "{X} afternoon", "Monthly {x} social"]
PAGE_TEMPLATES = ["{X} Daily", "The {X} Collective", "{X} Notes"]
NOISE_POSTS = [
    "Got dragged to {x} by a friend. Fun, but probably not my thing.",
    "Walked past a {x} thing on the way home. Looked interesting.",
    "My roommate is obsessed with {x}. I just watch.",
    "Saw a great article about {x} today. Don't think I'll try it, though.",
]
NOISE_LISTINGS = ["Selling my {x} starter stuff, never really got into it"]
LISTING_TEMPLATES = ["Spare {x} gear, barely used", "Upgrading my {x} setup, selling the old one"]

# Sensitive leaves appear only indirectly: a group or an event, never a post that names them.
SENSITIVE_HINTS: dict[str, tuple[str, str]] = {
    "identity_values.faith.christianity": ("group_membership", "Young Adults Small Group (Sunday)"),
    "identity_values.faith.islam": ("event_rsvp", "Community iftar potluck"),
    "identity_values.faith.judaism": ("event_rsvp", "Friday night dinner at the community center"),
    "identity_values.faith.hinduism": ("event_rsvp", "Diwali community celebration"),
    "identity_values.faith.buddhism": ("group_membership", "Wednesday Evening Sitting Group"),
    "identity_values.faith.spirituality": ("group_membership", "New Moon Circle"),
    "identity_values.politics.political_organizing": (
        "group_membership",
        "Neighborhood Tenants Organizing Committee",
    ),
    "identity_values.politics.progressive_causes": ("event_rsvp", "Climate action phone bank"),
    "identity_values.politics.conservative_causes": (
        "group_membership",
        "Bay Area Fiscal Conservatives Forum",
    ),
    "identity_values.lgbtq.lgbtq_community": ("group_membership", "Queer Book Club"),
    "identity_values.heritage.cultural_heritage_groups": ("event_rsvp", "Heritage month community potluck"),
    "health_support.support_communities.recovery_community": (
        "group_membership",
        "Tuesday Fellowship (closed group)",
    ),
    "health_support.support_communities.mental_health_support": ("group_membership", "Peer Support Circle"),
    "health_support.support_communities.chronic_illness_community": (
        "group_membership",
        "Spoonies Social Club",
    ),
    "health_support.support_communities.disability_community": ("event_rsvp", "Adaptive sports open night"),
}

BIO_TEMPLATES = [
    "{A}, {b} and good coffee.",
    "Usually found doing {a} on weekends. Ask me about {b}.",
    "{A} person. Recently into {b}.",
    "New-ish to the neighborhood. {A}, {b}, and trying new spots.",
    "Weeknights: {a}. Weekends: {b}.",
]


def _fill(template: str, x: str, **kw: str) -> str:
    return template.format(x=x, X=x[0].upper() + x[1:], **kw)


def bio(rng: random.Random, leaves: list[Leaf]) -> str | None:
    shown = [leaf for leaf in leaves if not leaf.sensitive]
    if len(shown) < 2:
        return None
    a, b = lower_label(shown[0].label), lower_label(shown[1].label)
    text = rng.choice(BIO_TEMPLATES).format(a=a, b=b, A=a[0].upper() + a[1:])
    return text[:200]


def activity_items(
    rng: random.Random,
    *,
    interests: list[tuple[Leaf, float]],
    noise_leaves: list[Leaf],
    outgoingness: float,
    hood: str,
    area: str,
) -> list[dict]:
    """Activity items without ids or timestamps: [{'kind', <text fields>}]."""
    items: list[dict] = []
    for leaf, weight in interests:
        x = lower_label(leaf.label)
        if leaf.sensitive:
            kind, name = SENSITIVE_HINTS.get(leaf.id, ("group_membership", f"{area} community circle"))
            items.append({"kind": kind, ("groupName" if kind == "group_membership" else "eventName"): name})
            continue
        # Quiet people show more interests only through Groups and Events.
        indirect_only = rng.random() < 0.15 + 0.35 * (1 - outgoingness)
        n = 1 + int(weight * 3 * (0.5 + outgoingness)) + rng.randint(0, 1)
        for _ in range(n):
            if indirect_only:
                kind = rng.choice(["group_membership", "event_rsvp", "page_follow"])
            else:
                kind = rng.choices(
                    [
                        "post",
                        "comment",
                        "group_membership",
                        "event_rsvp",
                        "page_follow",
                        "marketplace_listing",
                    ],
                    weights=[5 * outgoingness + 1, 2, 2, 2, 1, 0.3],
                )[0]
            items.append(_item(rng, kind, x, hood, area))
    for leaf in noise_leaves:
        x = lower_label(leaf.label)
        if rng.random() < 0.8:
            items.append({"kind": "post", "text": _fill(rng.choice(NOISE_POSTS), x)})
        else:
            items.append(
                {"kind": "marketplace_listing", "listingTitle": _fill(rng.choice(NOISE_LISTINGS), x)}
            )
    # Dedupe identical group/event/page names (re-joining the same group twice is not a thing).
    seen: set[tuple] = set()
    unique = []
    for item in items:
        key = tuple(sorted(item.items()))
        if item["kind"] != "post" and key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def _item(rng: random.Random, kind: str, x: str, hood: str, area: str) -> dict:
    if kind == "post":
        if rng.random() < 0.25:
            return {"kind": "post", "photoCaption": _fill(rng.choice(PHOTO_CAPTIONS), x)}
        return {"kind": "post", "text": _fill(rng.choice(POST_TEMPLATES), x, hood=hood)}
    if kind == "comment":
        return {"kind": "comment", "text": _fill(rng.choice(COMMENT_TEMPLATES), x)}
    if kind == "group_membership":
        return {"kind": kind, "groupName": _fill(rng.choice(GROUP_TEMPLATES), _title(x), area=area)}
    if kind == "event_rsvp":
        return {"kind": kind, "eventName": _fill(rng.choice(EVENT_TEMPLATES), x)}
    if kind == "page_follow":
        return {"kind": kind, "pageName": _fill(rng.choice(PAGE_TEMPLATES), _title(x))}
    return {"kind": kind, "listingTitle": _fill(rng.choice(LISTING_TEMPLATES), x)}


def _title(x: str) -> str:
    return " ".join(w if w[:1].isupper() or not w[:1].isalpha() else w.capitalize() for w in x.split())
