"""Maya (u_maya), built from the Facebook clone's seed (facebook-clone/src/data/seed.ts, read-only).

Her activity is her own posts, comments, Groups and Events from the clone, copied verbatim; a test
checks every text still appears in seed.ts. Her ground truth reflects those posts. Her clone seed
stays unchanged (docs/common-ground/README.md, "Resolved: Maya's pitch")."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

from cg_sim.contracts import clone_dir

MAYA_ID = "u_maya"
MAYA_HOOD = "Inner Sunset"  # the clone's book swap is at the Sunset Community Room


def _ms(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=UTC)


# (clone id, createdAt ms, text, photo ids)
POSTS = [
    (
        "post-06",
        1794322800000,
        "A weekend of building with friends is my kind of weekend. Getting our hackathon demo ready — excited to "
        "share what we’ve been making! ✨",
        [],
    ),
    (
        "post-08",
        1794240000000,
        "Went out for one thing. Came home with a bag full of vegetables and a new favorite Saturday ritual. 🥕\n"
        "What’s everyone making this week?",
        ["market-morning"],
    ),
    (
        "post-12",
        1794196800000,
        "A few city moments from the camera roll. The best part of taking the long way home is noticing what you "
        "usually walk past. 📷",
        ["city-street", "city-bridge", "cafe"],
    ),
    (
        "post-15",
        1794164400000,
        "Trying a new habit: twenty minutes making something before I open my inbox. A sketch, a recipe, a tiny "
        "idea — anything.\nWhat helps you find a little creative time?",
        [],
    ),
    (
        "post-19",
        1794121200000,
        "Lunch from whatever was left in the fridge. Turns out “a little bit of everything” is a pretty good "
        "recipe. 🥗",
        ["salad"],
    ),
    (
        "post-22",
        1794088800000,
        "Cleared a little space for new ideas. The desk won’t stay this tidy, but the brushes are ready. 🎨",
        ["workspace", "paintbrushes"],
    ),
]
# (clone id, parent post createdAt ms, text)
COMMENTS = [
    ("comment-01", 1794405600000, "Look at all that color! Count me in for the next planting day 💚"),
    ("comment-10", 1794218400000, "The six-pixel victories count. Every single one."),
    ("comment-18", 1794132000000, "My windowsill basil is finally cooperating!"),
    ("comment-24", 1794067200000, "One of everything, with extra coffee."),
]
# Groups and Events shown in Maya's clone app; she is treated as a member and as going.
GROUPS = [
    ("group-neighbors", "Our Neighborhood"),
    ("group-weekends", "Bay Area Weekends"),
    ("group-makers", "Neighborhood Makers"),
]
EVENTS = [
    ("event-books", "Neighborhood book swap"),
    ("event-garden", "Community garden morning"),
    ("event-photo-walk", "Golden hour photo walk"),
    ("event-studio", "Open studio afternoon"),
]

# Ground truth from the posts above and the clone's chats (coastal walk with Priya, game night with Leo).
GROUND_TRUTH = {
    "outdoors.hiking.coastal_hikes": 0.85,
    "outdoors.gardening.community_gardens": 0.8,
    "arts_crafts.ceramics.handbuilding": 0.7,
    "arts_crafts.visual_art.painting": 0.65,
    "arts_crafts.photography.street_photography": 0.6,
    "social_community.neighborhood.farmers_markets": 0.55,
    "games.board_games.strategy_games": 0.5,
    "food_drink.cooking.home_cooking": 0.5,
    "outdoors.gardening.houseplants": 0.4,
    "tech_career.building.hackathons": 0.4,
    "social_community.neighborhood.book_swaps": 0.35,
    "food_drink.eating_out.brunch": 0.3,
}

AVAILABILITY = [
    {"day": "wed", "part": "evening"},
    {"day": "thu", "part": "evening"},
    {"day": "sat", "part": "morning"},
    {"day": "sat", "part": "afternoon"},
    {"day": "sun", "part": "morning"},
    {"day": "sun", "part": "afternoon"},
]


def persona(home: dict) -> dict:
    return {
        "userId": MAYA_ID,
        "displayName": "Maya Chen",
        "firstName": "Maya",
        "initials": "MC",
        "avatar": f"avatars/{MAYA_ID}.jpg",
        "profileVisibility": "public",
        "homeLocation": home,
        "neighborhood": MAYA_HOOD,
        "ageBand": "26_29",
        "bio": "Making things, finding new trails, and collecting little moments. 🌿",
        "availability": AVAILABILITY,
        "groupSize": {"min": 2, "max": 4},
        "joinedAt": "2026-09-14T17:00:00Z",
        "cloneProfileId": "maya",
    }


def activity() -> list[tuple[datetime, dict]]:
    items: list[tuple[datetime, dict]] = []
    for _, created, text, photos in POSTS:
        item = {"kind": "post", "text": text}
        if photos:
            item["photoCaption"] = "Photos: " + ", ".join(p.replace("-", " ") for p in photos)
        items.append((_ms(created), item))
    for _, parent_created, text in COMMENTS:
        items.append((_ms(parent_created) + timedelta(hours=1), {"kind": "comment", "text": text}))
    for i, (_, name) in enumerate(GROUPS):
        items.append(
            (datetime(2026, 10, 1 + 7 * i, 18, tzinfo=UTC), {"kind": "group_membership", "groupName": name})
        )
    for i, (_, title) in enumerate(EVENTS):
        items.append((datetime(2026, 11, 2 + i, 19, tzinfo=UTC), {"kind": "event_rsvp", "eventName": title}))
    return items


def clone_seed_text() -> str:
    return (clone_dir() / "src" / "data" / "seed.ts").read_text()


def clone_people_names() -> list[str]:
    """Full names of the clone's seed people (the `people: [...]` block of seed.ts)."""
    text = clone_seed_text()
    block = text[text.index("people: [") : text.index("posts: [")]
    return re.findall(r"name: '([^']+)'", block)


def clone_avatar_path():
    return clone_dir() / "assets" / "images" / "maya.jpg"
