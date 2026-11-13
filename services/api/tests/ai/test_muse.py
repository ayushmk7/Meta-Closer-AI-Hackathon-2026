import asyncio
import json
from pathlib import Path

import pytest

from cg_api.laya import LayaClient
from cg_api.muse import MuseClient, Unavailable, bar
from cg_api.muse.copy import MuseCopy, approval_copy
from cg_api.muse.extract import Extractor, taxonomy

CONTRACTS = Path(__file__).resolve().parents[4] / "contracts"
FAKE = MuseClient(fake=True)
PLAN = {
    "title": "Saturday wheel-throwing drop-in",
    "activityType": "ceramics_studio",
    "venue": {"venueId": "vn_clay_hour", "name": "Clay Hour Studio", "neighborhood": "Hayes Valley"},
    "startsAt": "2026-11-14T18:00:00Z",
    "endsAt": "2026-11-14T20:00:00Z",
    "cost": {"kind": "prepaid", "perPersonCents": 3500, "currency": "USD", "label": "$35 per person"},
}
VENUES = {
    "vn_lands_end": {
        "venueId": "vn_lands_end",
        "name": "Lands End Trail",
        "kind": "trail",
        "location": {"lat": 37.7804, "lng": -122.511},
    },
    "vn_temple": {
        "venueId": "vn_temple",
        "name": "Quiet Temple",
        "kind": "temple",
        "sensitive": True,
        "location": {"lat": 37.78, "lng": -122.45},
    },
}


def ok(label):
    return {"label": label, "visibility": "shown", "sensitive": False}


class Spy:
    """A live-looking Muse that records every prompt and answers with a fixed JSON."""

    def __init__(self, answer=None):
        self.prompts, self.answer = [], answer

    async def respond(self, purpose, input, **kw):
        self.prompts.append((purpose, json.dumps(input)))
        if self.answer is None:
            raise Unavailable("spy")
        return {"text": "", "json": self.answer, "tool_calls": []}


def test_fake_copy_is_templated_and_bounded():
    copy = MuseCopy(FAKE)
    text, starters = asyncio.run(copy.intro(["Maya", "Rosa", "Dan"], [ok("Wheel throwing")], PLAN))
    assert text == (
        "Maya, Rosa and Dan, meet each other! You're all into wheel throwing. See you Saturday at Clay "
        "Hour Studio. I'm handling the booking and the calendar."
    )
    assert len(starters) == 3 and all(len(s) < 90 for s in starters)
    assert len(asyncio.run(copy.plan_title({**PLAN, "title": "x" * 99}))) == 60
    assert len(asyncio.run(copy.plan_reason(PLAN, [ok("Ceramics")]))) <= 160
    assert FAKE.calls == {"copy.intro.fake": 1, "copy.title.fake": 1, "copy.reason.fake": 1}
    a = approval_copy(PLAN, {"name": "Clay Hour Studio", "booking": {"payAtVenueAllowed": True}})
    assert a["detail"] == "Muse pays Clay Hour Studio for your seat on Saturday, 10 AM to 12 PM."
    # over-long live answers fall back to the template
    long = MuseCopy(Spy({"text": "y" * 200, "starters": ["a", "b", "c"]}))
    assert asyncio.run(long.plan_reason(PLAN, [])).startswith("Something new at Clay Hour Studio")


def _extractor(muse=FAKE):
    return Extractor(muse, LayaClient(CONTRACTS, fake=True), CONTRACTS, venue=VENUES.get, inline_muse=True)


def test_fallback_extraction_and_signal_gate():
    activity = [
        {"kind": "group_membership", "at": "2026-10-19T15:04:00Z", "groupName": "SF Wheel Throwing Club"},
        {"kind": "post", "at": "2026-10-21T11:38:00Z", "photoCaption": "Handbuilding, again. Happy place."},
    ]
    busy = {
        "recordId": "cr_b",
        "userId": "u_x",
        "provider": "google_calendar",
        "kind": "busy",
        "at": "2026-11-13T17:00:00Z",
        "end": "2026-11-13T18:00:00Z",
    }
    ex = _extractor()
    out = asyncio.run(ex.extract("u_x", activity, [busy]))
    ids = {i["id"] for i in out["interests"]}
    assert {"arts_crafts.ceramics.wheel_throwing", "arts_crafts.ceramics.handbuilding"} <= ids
    assert all(taxonomy(CONTRACTS)[i]["leaf"] for i in ids) and out["signals"] == []  # rule kinds: seed loader
    assert out == asyncio.run(_extractor().extract("u_x", activity, [busy]))  # deterministic
    temple = {
        "signalId": "si_1",
        "kind": "frequent_place",
        "venueId": "vn_temple",
        "label": "3 visits to Quiet Temple this month",
    }
    g = asyncio.run(ex.gate_signal(temple))
    assert g["sensitive"] and g["visibility"] == "hidden" and g["signalId"] == "si_1"
    assert "Quiet Temple" not in g["label"]  # a sensitive signal names no place


def test_live_extraction_rejects_unknown_ids_and_kinds():
    answer = {
        "interests": [
            {"id": "arts_crafts.ceramics.wheel_throwing", "evidence": "You throw.", "source": "activity"},
            {"id": "made.up", "evidence": "?", "source": "activity"},
            {"id": "arts_crafts.ceramics", "evidence": "not a leaf", "source": "activity"},
        ],
        "signals": [
            {
                "recordIds": ["cr_nope"],
                "kind": "post",
                "label": "x",
                "interestIds": [],
                "venueId": None,
                "strength": 0.9,
            },
            {"recordIds": [], "kind": "teleport", "label": "x", "interestIds": [], "venueId": None, "strength": 0.9},
        ],
    }
    out = asyncio.run(_extractor(Spy(answer)).extract("u_y", [], []))
    assert [i["id"] for i in out["interests"]] == ["arts_crafts.ceramics.wheel_throwing"]
    assert out["signals"] == []


def test_bar_keyword_fallback_and_maps_link():
    now = "2026-11-12T18:00:00Z"  # Thursday 10 AM local
    f = bar.keyword_filter("climb this weekend, under 30 min", now, CONTRACTS)
    assert f["activityTypes"] == ["climbing_session"] and f["days"] == ["2026-11-14", "2026-11-15"]
    assert f["maxMinutes"] == 30
    f = bar.keyword_filter("pottery saturday morning", now, CONTRACTS)
    assert f["activityTypes"] == ["ceramics_studio"] and f["days"] == ["2026-11-14"] and f["part"] == "morning"
    card = {**PLAN, "crowd": {"interestedCount": 3}, "travel": {"minutes": 22}}
    assert bar.apply([card], f) == [card]
    assert bar.apply([card], {**f, "part": "evening"}) == []
    assert bar.reply([card], f).startswith("I found one that fits")
    link = bar.maps_link("this? https://www.google.com/maps/place/Lands+End+Trail/@37.7801,-122.5109,15z")
    assert link == {"name": "Lands End Trail", "lat": 37.7801, "lng": -122.5109}
    assert bar.nearest_venue(link, list(VENUES.values()))["venueId"] == "vn_lands_end"
    assert bar.nearest_venue({"name": None, "lat": 37.7805, "lng": -122.5111}, list(VENUES.values()))
    assert bar.nearest_venue({"name": None, "lat": 37.0, "lng": -122.0}, list(VENUES.values())) is None
    f2, said = asyncio.run(bar.understand(FAKE, "board games tonight", [], now, CONTRACTS))
    assert said is None and f2["activityTypes"] == ["board_game_night"] and f2["days"] == ["2026-11-12"]


@pytest.mark.parametrize("bad", [None, {"activityTypes": "nope"}])
def test_bar_live_answer_validated(bad):
    f, said = asyncio.run(bar.understand(Spy(bad), "coffee", [], "2026-11-12T18:00:00Z", CONTRACTS))
    assert said is None and f["activityTypes"] == ["coffee"]


def test_stalled_muse_costs_one_timeout_not_retries():
    import socket
    import time

    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen(8)  # accepts connections, never answers
    muse = MuseClient(fake=False, base_url=f"http://127.0.0.1:{srv.getsockname()[1]}/v1", api_key="x", timeout_s=0.5)
    t0 = time.monotonic()
    with pytest.raises(Unavailable):
        asyncio.run(muse.respond("bar", "hi"))
    assert time.monotonic() - t0 < 1.2
    srv.close()


def test_copy_never_speaks_sensitive_labels_and_keeps_casing():
    copy = MuseCopy(FAKE, CONTRACTS)
    said = asyncio.run(copy.setup_review("u_x", [ok("Ceramics"), ok("Faith & spirituality"), ok("AI and ML")]))
    assert said == "I noticed you're into ceramics and AI and ML. I'll look for small plans around those."
    hidden = [{"interest": {"label": "Sourdough"}, "visibility": "hidden", "sensitive": False}]
    assert "Sourdough" not in asyncio.run(copy.setup_review("u_x", hidden))
    spy = Spy()
    asyncio.run(MuseCopy(spy, CONTRACTS).setup_review("u_x", [ok("Faith & spirituality"), ok("Buddhism")]))
    assert "Faith" not in spy.prompts[0][1] and "Buddhism" not in spy.prompts[0][1]
    assert (
        asyncio.run(copy.plan_reason(PLAN, [ok("CrossFit")]))
        == "For people into CrossFit, at Clay Hour Studio on Saturday."
    )
    walk = {
        **PLAN,
        "title": "Sunday coastal walk at Lands End",
        "startsAt": "2026-11-15T17:00:00Z",
        "venue": {"name": "Lands End Trail"},
    }
    title, text = asyncio.run(copy.nudge("You've been to Lands End Trail 4 times this month", walk))
    assert title == "Lands End Trail on Sunday?"
    assert text == (
        "You've been to Lands End Trail 4 times this month. Sunday coastal walk at Lands End is open. Want in?"
    )
    _, text = asyncio.run(copy.nudge("x", {**walk, "crowd": {"interestedCount": 5}}))
    assert text.endswith("is open. 5 people are in. Want in?")


def test_bar_reply_and_sunday_weekend():
    sunday = "2026-11-15T18:00:00Z"
    assert bar.keyword_filter("hike this weekend", sunday, CONTRACTS)["days"] == ["2026-11-15"]
    empty = bar.keyword_filter("I just moved here", sunday, CONTRACTS)
    card = {**PLAN, "crowd": {"interestedCount": 3}}
    assert bar.reply([card, card], empty) == "Here's what's coming up near you."
    f = bar.keyword_filter("pottery", sunday, CONTRACTS)
    assert bar.reply([card], f) == "I found one that fits: Saturday wheel-throwing drop-in."


def test_gate_fails_closed_on_unknown_venue_and_gates_named_places():
    class Laya:
        def __init__(self):
            self.asked = []

        async def ask(self, q, state):
            self.asked.append((q, state))
            return (0.99, True) if q == "sensitive_place" else (0.5, False)

    laya = Laya()
    ex = Extractor(FAKE, laya, CONTRACTS)
    unknown = asyncio.run(ex.gate_signal({"kind": "frequent_place", "venueId": "vn_unknown", "label": "x"}))
    assert unknown["sensitive"] and unknown["visibility"] == "hidden" and laya.asked == []
    named = {"kind": "saved_place", "placeName": "Eastside Clinic", "placeKind": "clinic", "label": "Saved place"}
    assert asyncio.run(ex.gate_signal(named))["sensitive"]
    assert laya.asked == [
        (
            "sensitive_place",
            {"place": {"placeName": "Eastside Clinic", "placeKind": "clinic", "pattern": "Saved place"}},
        )
    ]


def test_log_models_never_raises(monkeypatch):
    import httpx

    muse = MuseClient(fake=False, base_url="http://muse/v1", api_key="k")
    monkeypatch.setattr(
        httpx,
        "get",
        lambda *a, **k: httpx.Response(
            200, json={"data": [{"id": "muse-spark-1.3"}]}, request=httpx.Request("GET", a[0])
        ),
    )
    assert muse.log_models() == ["muse-spark-1.3"]
    monkeypatch.setattr(httpx, "get", lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("down")))
    assert muse.log_models() == []


def test_labels_fail_closed_without_flags():
    copy = MuseCopy(FAKE, CONTRACTS)
    flagged = {"label": "Running", "visibility": "shown", "sensitive": True}  # Laya said yes; taxonomy doesn't
    unknown = {"label": "Hiking", "visibility": "shown"}  # no sensitive flag: don't speak
    said = asyncio.run(copy.setup_review("u_x", [ok("Ceramics"), "Running", flagged, unknown]))
    assert said == "I noticed you're into ceramics. I'll look for small plans around those."
