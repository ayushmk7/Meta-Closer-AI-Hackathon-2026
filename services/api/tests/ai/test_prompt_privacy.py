"""PRD-2 §3.6 prompt privacy: prompts carry only what the caller filtered for the viewer, never private signals."""

import asyncio
from pathlib import Path

from test_muse import PLAN, Spy, ok

from cg_api.laya import LayaClient, render
from cg_api.muse.copy import MuseCopy
from cg_api.muse.extract import Extractor

CONTRACTS = Path(__file__).resolve().parents[4] / "contracts"
SECRETS = ["u_0125", "Buddhism", "cr_secret", "Quiet Temple", "2026-11-13T17:00:00Z", "37.7595", "seedJoinIds"]


def test_copy_prompts_whitelist_plan_fields():
    spy = Spy()
    copy = MuseCopy(spy, backoff_s=0)
    leaky = {
        **PLAN,
        "seedJoinIds": ["u_0125"],
        "because": [{"label": "Quiet Temple"}],
        "interested": ["u_0125"],
        "venue": {**PLAN["venue"], "location": {"lat": 37.7595}},
    }

    async def all_copy():
        await copy.intro(["Maya", "Rosa"], [ok("Wheel throwing")], leaky)
        await copy.plan_reason(leaky, [ok("Ceramics")])
        await copy.plan_title(leaky)
        await copy.nudge("You've been to Lands End 4 times", leaky)
        await copy.setup_review("u_0125", [ok("Ceramics")])
        await copy.drain()  # background fills send their prompts too

    asyncio.run(all_copy())
    assert {p for p, _ in spy.prompts} == {"copy.intro", "copy.reason", "copy.title", "copy.nudge", "copy.setup"}
    for _, prompt in spy.prompts:
        assert not [s for s in SECRETS if s in prompt], prompt


def test_extraction_never_sends_busy_blocks_or_user_ids():
    spy = Spy()
    busy = {
        "recordId": "cr_secret",
        "userId": "u_0125",
        "provider": "google_calendar",
        "kind": "busy",
        "at": "2026-11-13T17:00:00Z",
        "end": "2026-11-13T18:00:00Z",
    }
    asyncio.run(
        Extractor(spy, LayaClient(CONTRACTS, fake=True), CONTRACTS, inline_muse=True).extract("u_0125", [], [busy])
    )
    assert spy.prompts and all("cr_secret" not in p and "u_0125" not in p for _, p in spy.prompts)


def test_laya_states_drop_hidden_and_sensitive_interests():
    user = {
        "neighborhood": "Inner Sunset",
        "ageBand": "26_29",
        "groupSize": {"min": 3, "max": 5},
        "availability": [],
        "activity": [],
        "interests": [
            {
                "id": "identity_values.faith.buddhism",
                "label": "Buddhism",
                "weight": 0.9,
                "visibility": "shown",
                "sensitive": True,
            },
            {
                "id": "food_drink.cooking.sourdough",
                "label": "Sourdough",
                "weight": 0.5,
                "visibility": "hidden",
                "sensitive": False,
            },
        ],
    }
    text = render("join_activity", {"users": {"A": user}, "activityType": "walk", "userId": "u_0125"}, CONTRACTS)
    assert "Buddhism" not in text and "Sourdough" not in text and "u_0125" not in text
