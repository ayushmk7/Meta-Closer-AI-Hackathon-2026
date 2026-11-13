"""Laya: state rendering (byte-exact vs contracts/laya_golden.json), the LAYA_FAKE formula, and the HTTP client.

`state` dicts use the golden-case shape: {"users": {"A": user, "B": user}, "activityType": ..., "place": {...},
"text": ..., <flat template fields>}. Only fields listed in laya_questions.yaml are ever rendered, so nothing else
a caller passes can leak to Laya.
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
from functools import cache
from pathlib import Path

import httpx
import yaml

from cg_api.ports import Unavailable

log = logging.getLogger("cg_api.laya")

_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
_PARTS = ["morning", "afternoon", "evening"]
_TEXT_FIELDS = ("text", "photoCaption", "groupName", "eventName", "pageName", "listingTitle")
_SLOT = re.compile(r"\{(\w+)(?::([A-Z]))?\}")


class LayaUnavailable(Unavailable):
    pass


@cache
def load_questions(contracts_dir: Path) -> dict:
    return yaml.safe_load((Path(contracts_dir) / "laya_questions.yaml").read_text())


def _none(items: list[str], sep: str) -> str:
    return sep.join(items) if items else "none"


def _activity_text(a: dict) -> str:
    t = next((a[k] for k in _TEXT_FIELDS if a.get(k)), "")
    return t if len(t) <= 120 else t[:117] + "..."


def user_summary(user: dict, alias: str, tpl: str) -> str:
    slots = sorted(user.get("availability", []), key=lambda s: (_DAYS.index(s["day"]), _PARTS.index(s["part"])))
    shown = [i for i in user.get("interests", []) if i.get("visibility", "shown") == "shown" and not i.get("sensitive")]
    shown.sort(key=lambda i: (-i["weight"], i["id"]))
    recent = sorted(user.get("activity", []), key=lambda a: a["at"], reverse=True)[:5]
    fields = {
        "alias": alias,
        "neighborhood": user["neighborhood"],
        "ageBand": user["ageBand"],
        "groupMin": str(user["groupSize"]["min"]),
        "groupMax": str(user["groupSize"]["max"]),
        "availability": _none([f"{s['day']} {s['part']}" for s in slots], ", "),
        "interests": _none([f"{i['label']} ({i['weight']:.2f})" for i in shown[:12]], ", "),
        "activity": _none([f"{a['kind']}: {_activity_text(a)}" for a in recent], " | "),
    }
    return _SLOT.sub(lambda m: fields[m[1]], tpl)


def render(question: str, state: dict, contracts_dir: Path) -> str:
    q = load_questions(contracts_dir)
    frags = q["fragments"]
    flat = {**state.get("place", {}), **{k: v for k, v in state.items() if isinstance(v, str)}}

    def slot(m: re.Match) -> str:
        name, alias = m[1], m[2]
        if name == "user_summary":
            return user_summary(state["users"][alias], alias, frags["user_summary"])
        if name == "activity_type":
            return frags["activity_type"].replace("{activityType}", state["activityType"])
        return str(flat[name])

    # one regex pass: user text containing braces is never re-expanded
    return _SLOT.sub(slot, q["questions"][question]["state"])


def fake_p(version: int, key: str, state_text: str) -> float:
    return int(hashlib.sha256(f"{version}|{key}|{state_text}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def is_decisive(p: float, threshold: float) -> bool:
    return p >= threshold or p <= 1 - threshold


# Laya answer field mapping, mirrored from the sim's adapter so backend and tables agree. Verified against laya-serve 0.2.1 (2026-11-13).
ANSWER_SCALAR_FIELDS = (
    "noul",
    "p",
    "probability",
    "yes",
    "value",
    "expected",
)  # first numeric one wins; real laya-serve 0.2.1 sends {"noul": p}
ANSWER_DIST_FIELDS = ("probabilities", "distribution")  # list over criteria, or {label: p}


def _parse_answer(ans, qtype: str = "noul", criteria: list | None = None) -> float:
    """p (noul) or expected value over criteria (score). Anything unrecognised is LayaUnavailable."""
    if isinstance(ans, (int, float)) and not isinstance(ans, bool):
        return float(ans)
    if not isinstance(ans, dict):
        raise LayaUnavailable(f"unrecognised answer {ans!r}")
    for k in ANSWER_SCALAR_FIELDS:
        if isinstance(ans.get(k), (int, float)) and not isinstance(ans.get(k), bool):
            return float(ans[k])
    probs = next((ans[k] for k in ANSWER_DIST_FIELDS if ans.get(k)), None)
    if qtype == "score" and isinstance(probs, (list, dict)) and criteria:
        vals = (
            probs if isinstance(probs, list) else [probs.get(c, probs.get(str(i), 0.0)) for i, c in enumerate(criteria)]
        )  # real Laya keys by index
        if len(vals) > 1 and all(isinstance(v, (int, float)) for v in vals):
            return sum(p * i / (len(vals) - 1) for i, p in enumerate(vals))
    if qtype == "noul" and isinstance(probs, dict):
        yes = probs.get("yes", probs.get("true"))
        if isinstance(yes, (int, float)):
            return float(yes)
    raise LayaUnavailable(f"unrecognised answer {ans!r}")


class LayaClient:
    """Implements ports.Laya. Caches by (questionsVersion, question, sha256(state))."""

    def __init__(
        self,
        contracts_dir: Path,
        *,
        fake: bool,
        url: str = "",
        model: str = "laya",
        threshold: float = 0.85,
        timeout_s: float = 5.0,
    ):
        self.dir, self.fake, self.url, self.model = Path(contracts_dir), fake, url.rstrip("/"), model
        self.threshold, self.timeout_s = threshold, timeout_s
        self.version = load_questions(self.dir)["questionsVersion"]
        self.cache: dict[tuple, float] = {}
        self.calls = {"live": 0, "fake": 0, "cached": 0, "failed": 0}

    async def ask(self, question: str, state: dict) -> tuple[float, bool]:
        text = render(question, state, self.dir)
        key = (self.version, question, hashlib.sha256(text.encode()).hexdigest())
        if key in self.cache:
            self.calls["cached"] += 1
        elif self.fake:
            self.calls["fake"] += 1
            self.cache[key] = fake_p(self.version, question, text)
        else:
            self.cache[key] = await self._post(question, text)
        p = self.cache[key]
        return p, is_decisive(p, self.threshold)

    async def _post(self, question: str, text: str) -> float:
        q = load_questions(self.dir)["questions"][question]
        spec = {k: q[k] for k in ("type", "instructions", "criteria") if k in q}
        body = {"model": self.model, "state": text, "questions": {question: spec}}
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as c:
                r = await c.post(f"{self.url}/v1/systemone", json=body)
                r.raise_for_status()
                p = _parse_answer(r.json()["answers"][question], q["type"], q.get("criteria"))
        except (httpx.HTTPError, KeyError, TypeError, AttributeError, ValueError, LayaUnavailable) as e:
            self.calls["failed"] += 1
            if self.calls["failed"] > 0.05 * (self.calls["failed"] + self.calls["live"]):  # CONTRACTS Decisions
                log.error("laya fallbacks above 5%%: %s (check the answer-field adapter)", self.calls)
            log.warning("laya %s failed after %.0f ms: %s", question, (time.monotonic() - t0) * 1000, e)
            raise LayaUnavailable(str(e)) from e
        self.calls["live"] += 1
        log.info("laya %s p=%.3f %.0f ms", question, p, (time.monotonic() - t0) * 1000)
        return min(max(p, 0.0), 1.0)
