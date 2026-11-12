"""Private rewards for Me.rewards (DESIGN Rewards, PRD-2 §3.8). Pure: no I/O."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Los_Angeles")


def _week(dt: datetime):
    d = dt.astimezone(TZ).date()
    return d - timedelta(days=d.weekday())  # Monday


def rewards(counted: list[datetime], unlocks: list[dict], now: datetime, has_reports: bool = False) -> dict:
    """counted: start times (tz-aware) of meetups that counted; unlocks: params.yaml `unlocks`."""
    n = len(counted)
    weeks = {_week(t) for t in counted}
    week = _week(now)
    if week not in weeks:
        week -= timedelta(weeks=1)  # streak may end last week; this week isn't over yet
    streak = 0
    while week in weeks:
        streak += 1
        week -= timedelta(weeks=1)
    nxt = None
    for u in unlocks:
        if u.get("requiresNoReports") and has_reports:
            continue  # ponytail: not earnable by meetups, so never shown as "next"
        if n < u["afterConfirmedMeetups"]:
            nxt = {"unlockId": u["unlockId"], "label": u["label"], "remaining": u["afterConfirmedMeetups"] - n}
            break
    return {"confirmedMeetups": n, "streakWeeks": streak, "nextUnlock": nxt}
