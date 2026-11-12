"""Laya: state rendering (contracts/laya_questions.yaml, byte-exact with laya_golden.json), the fake
probability rule, and one LayaClient adapter for the real POST /v1/systemone."""

from __future__ import annotations

import hashlib
import os
from concurrent.futures import ThreadPoolExecutor

from cg_sim.contracts import load_yaml, taxonomy

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
PARTS = ["morning", "afternoon", "evening"]
ACTIVITY_TEXT_KEYS = ["text", "photoCaption", "groupName", "eventName", "pageName", "listingTitle"]


def questions() -> dict:
    return load_yaml("laya_questions.yaml")


def questions_version() -> int:
    return questions()["questionsVersion"]


def _join(items: list[str], sep: str = ", ") -> str:
    return sep.join(items) if items else "none"


def _activity_text(item: dict) -> str:
    text = next((item[k] for k in ACTIVITY_TEXT_KEYS if item.get(k)), "")
    return text if len(text) <= 120 else text[:117] + "..."


def user_summary(user: dict, alias: str, activity: list[dict] | None = None) -> str:
    """user: persona/export user dict. Interest labels come from `label` or the taxonomy.
    activity: the user's activity items (defaults to user["activity"])."""
    _, _, labels = taxonomy()
    slots = sorted(user["availability"], key=lambda s: (DAYS.index(s["day"]), PARTS.index(s["part"])))
    shown = [i for i in user["interests"] if i["visibility"] == "shown" and not i["sensitive"]]
    shown = sorted(shown, key=lambda i: (-i["weight"], i["id"]))[:12]
    acts = activity if activity is not None else user.get("activity", [])
    acts = sorted(acts, key=lambda a: a["at"], reverse=True)[:5]
    return questions()["fragments"]["user_summary"].format(
        alias=alias,
        neighborhood=user["neighborhood"],
        ageBand=user["ageBand"],
        groupMin=user["groupSize"]["min"],
        groupMax=user["groupSize"]["max"],
        availability=_join([f"{s['day']} {s['part']}" for s in slots]),
        interests=_join([f"{i.get('label') or labels[i['id']]} ({i['weight']:.2f})" for i in shown]),
        activity=_join([f"{a['kind']}: {_activity_text(a)}" for a in acts], " | "),
    )


def activity_type(t: str) -> str:
    return questions()["fragments"]["activity_type"].format(activityType=t)


def render_state(key: str, **fields) -> str:
    """Render questions[key].state. Users are passed as users={"A": user, ...} (with optional
    activities={"A": [...]}) and the activity type as activityType; other fields fill {placeholders}."""
    tpl = questions()["questions"][key]["state"]
    users = fields.pop("users", {})
    acts = fields.pop("activities", {})
    for alias, u in users.items():
        tpl = tpl.replace(f"{{user_summary:{alias}}}", user_summary(u, alias, acts.get(alias)))
    if "activityType" in fields:
        tpl = tpl.replace("{activity_type}", activity_type(fields.pop("activityType")))
    for k, v in fields.items():
        tpl = tpl.replace(f"{{{k}}}", str(v))
    return tpl


def fake_p(key: str, state: str, version: int | None = None) -> float:
    v = questions_version() if version is None else version
    return int(hashlib.sha256(f"{v}|{key}|{state}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def _answer_p(ans: dict | float, qtype: str, criteria: list | None) -> float:
    """ponytail: laya-serve answer fields unverified (not installed here); accepts the plausible shapes."""
    if isinstance(ans, (int, float)):
        return float(ans)
    for k in ("p", "probability", "yes", "value", "expected"):
        if isinstance(ans.get(k), (int, float)):
            return float(ans[k])
    probs = ans.get("probabilities") or ans.get("distribution")
    if qtype == "score" and probs:
        vals = probs if isinstance(probs, list) else [probs.get(c, 0.0) for c in criteria]
        return sum(p * i / (len(vals) - 1) for i, p in enumerate(vals))
    if qtype == "noul" and isinstance(probs, dict):
        return float(probs.get("yes", probs.get("true")))
    raise ValueError(f"unrecognised Laya answer: {ans!r}")


class LayaClient:
    """ask_many([(state, [question keys])]) -> [{key: p}]. Fake mode is the contract hash rule."""

    def __init__(self, fake: bool = False, url: str | None = None, model: str | None = None, workers: int = 8):
        self.fake = fake
        self.url = (url or os.environ.get("LAYA_URL") or "http://127.0.0.1:8090").rstrip("/")
        self.model = model or os.environ.get("LAYA_MODEL") or "laya"
        self.workers = workers
        self.q = questions()

    def _ask(self, http, state: str, keys: list[str]) -> dict[str, float]:
        if self.fake:
            return {k: fake_p(k, state, self.q["questionsVersion"]) for k in keys}
        qs = {}
        for k in keys:
            q = self.q["questions"][k]
            qs[k] = {"type": q["type"], "instructions": q["instructions"]} | (
                {"criteria": q["criteria"]} if "criteria" in q else {})
        r = http.post(f"{self.url}/v1/systemone", json={"model": self.model, "state": state, "questions": qs})
        r.raise_for_status()
        answers = r.json()["answers"]
        return {k: _answer_p(answers[k], self.q["questions"][k]["type"], self.q["questions"][k].get("criteria"))
                for k in keys}

    def ask_many(self, batch: list[tuple[str, list[str]]]) -> list[dict[str, float]]:
        if self.fake:
            return [self._ask(None, s, ks) for s, ks in batch]
        import httpx

        with httpx.Client(timeout=60) as http, ThreadPoolExecutor(self.workers) as pool:
            return list(pool.map(lambda sk: self._ask(http, *sk), batch))
