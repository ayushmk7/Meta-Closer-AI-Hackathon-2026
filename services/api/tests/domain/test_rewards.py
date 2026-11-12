from datetime import datetime
from pathlib import Path

import yaml

from cg_api.domain.rewards import TZ, rewards

UNLOCKS = yaml.safe_load((Path(__file__).parents[4] / "contracts/params.yaml").read_text())["unlocks"]
NOW = datetime(2026, 11, 12, 12, tzinfo=TZ)  # Thursday


def at(y, m, d, h=18):
    return datetime(y, m, d, h, tzinfo=TZ)


def test_empty():
    r = rewards([], UNLOCKS, NOW)
    assert r == {
        "confirmedMeetups": 0,
        "streakWeeks": 0,
        "nextUnlock": {"unlockId": "create_plans", "label": "Create your own plans", "remaining": 1},
    }


def test_streak_ends_this_week():
    r = rewards([at(2026, 11, 10), at(2026, 11, 3), at(2026, 11, 4), at(2026, 10, 27)], UNLOCKS, NOW)
    assert r["confirmedMeetups"] == 4
    assert r["streakWeeks"] == 3
    assert r["nextUnlock"]["unlockId"] == "regular" and r["nextUnlock"]["remaining"] == 1


def test_streak_ends_last_week_and_gap_breaks_it():
    assert rewards([at(2026, 11, 8), at(2026, 10, 20)], UNLOCKS, NOW)["streakWeeks"] == 1  # Sun last week
    assert rewards([at(2026, 10, 27)], UNLOCKS, NOW)["streakWeeks"] == 0  # two weeks ago


def test_week_boundary_is_la_time():
    # Mon 00:30 UTC is still Sunday evening in LA, so it lands in last week.
    utc_monday = datetime.fromisoformat("2026-11-09T00:30:00+00:00")
    assert rewards([utc_monday, at(2026, 11, 4)], UNLOCKS, NOW)["streakWeeks"] == 1


def test_all_earned_and_reports():
    five = [at(2026, 11, d) for d in range(1, 6)]
    assert rewards(five, UNLOCKS, NOW)["nextUnlock"] is None
    assert rewards(five[:4], UNLOCKS, NOW, has_reports=True)["nextUnlock"] is None
    assert rewards(five[:2], UNLOCKS, NOW, has_reports=True)["nextUnlock"]["unlockId"] == "bigger_groups"


def test_unlock_order_independent_of_yaml_order():
    assert rewards([], UNLOCKS[::-1], NOW)["nextUnlock"]["unlockId"] == "create_plans"
