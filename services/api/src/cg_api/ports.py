"""Seams between slices. C (domain) calls these; D (AI) provides the real ones; stubs keep everything runnable.

D installs real providers by exposing `cg_api.providers.install(ports: Ports)`; the app factory calls it if present.
Changing a Protocol is a shared-file change: ask slice A ("NEEDS:").
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol, TypedDict

log = logging.getLogger("cg_api.ports")


class Unavailable(Exception):
    """A dependency (Muse, Laya) is down or faked out; callers run their D4 fallback."""


# ---------- Protocols ----------
class Muse(Protocol):
    async def respond(
        self,
        purpose: str,
        input: str | list[dict],
        *,
        schema: dict | None = None,
        tools: list[dict] | None = None,
        effort: str = "low",
        timeout_s: float | None = None,
    ) -> dict:
        """One Responses API call. Returns {"text": str, "json": dict | None, "tool_calls": list[dict]}.
        Raises Unavailable; callers fall back (D4)."""
        ...


class Laya(Protocol):
    async def ask(self, question: str, state: dict) -> tuple[float, bool]:
        """(p, decisive) for one laya_questions.yaml question rendered from state."""
        ...


class Extractor(Protocol):
    venue: Callable[[str], dict | None]  # venue-ID lookup into the loaded seed; set by cg_api.seed.load

    async def extract(self, user_id: str, activity: list[dict], records: list[dict]) -> dict:
        """{"interests": [{id, weight, evidence, source, sensitive, visibility}], "signals": [...]}; owner-only."""
        ...


class CopyInterest(TypedDict):
    """An interest handed to Copy. Copy itself drops sensitive or hidden ones (P1, P4): never pass bare labels."""

    id: str
    label: str
    visibility: str  # "shown" | "hidden"
    sensitive: bool  # taxonomy flag OR Laya/Muse gate OR sensitive venue


def safe_labels(items: list[CopyInterest]) -> list[str]:
    """Labels Copy may put in text: shown and not sensitive, order kept."""
    return [i["label"] for i in items if i["visibility"] == "shown" and not i["sensitive"]]


class Copy(Protocol):
    async def plan_title(self, plan: dict) -> str: ...
    async def plan_reason(self, plan: dict, shared: list[CopyInterest]) -> str: ...
    async def setup_review(self, user_id: str, interests: list[CopyInterest]) -> str: ...
    async def intro(self, first_names: list[str], shared: list[CopyInterest], plan: dict) -> tuple[str, list[str]]: ...
    async def nudge(self, signal_label: str, plan: dict, unless_pending: bool = False) -> tuple[str, str] | None:
        """(title, text) for Nudge.title / Nudge.text. About the activity and place, never about being alone.
        unless_pending=True: None while Muse's text is still on its way (the caller asks again later)."""
        ...


class AgentRunner(Protocol):
    async def start(self, meetup_id: str) -> None: ...
    async def on_approval(self, approval_id: str) -> None: ...
    async def on_message(self, thread_id: str, message_id: str) -> None: ...


# ---------- stub defaults ----------
class StubMuse:
    async def respond(self, purpose, input, *, schema=None, tools=None, effort="low", timeout_s=None) -> dict:
        raise Unavailable("muse stub")


class StubLaya:
    """LAYA_FAKE formula on a canonical JSON render. ponytail: D swaps in the real template render."""

    async def ask(self, question: str, state: dict) -> tuple[float, bool]:
        text = json.dumps(state, sort_keys=True, separators=(",", ":"))
        h = hashlib.sha256(f"2|{question}|{text}".encode()).hexdigest()[:8]
        return int(h, 16) / 0xFFFFFFFF, False


class StubExtractor:
    # Fail closed: default to the live store, so a sensitive venue is always recognised (P4).
    venue: Callable[[str], dict | None] = staticmethod(lambda vid: _store().venues.get(vid))

    async def extract(self, user_id: str, activity: list[dict], records: list[dict]) -> dict:
        return {"interests": [], "signals": []}


class StubCopy:
    async def plan_title(self, plan: dict) -> str:
        return plan.get("title") or plan.get("activityType", "plan").replace("_", " ").capitalize()

    async def plan_reason(self, plan: dict, shared: list[CopyInterest]) -> str:
        shared_labels = safe_labels(shared)
        return f"You both like {shared_labels[0].lower()}." if shared_labels else "Something new nearby."

    async def setup_review(self, user_id: str, interests: list[CopyInterest]) -> str:
        interest_labels = safe_labels(interests)
        if not interest_labels:
            return "I didn't find much yet. Add a few things you like and I'll find meetups."
        return f"I noticed you're into {', '.join(interest_labels[:3]).lower()}. Here's what I'd suggest."

    async def intro(self, first_names, shared: list[CopyInterest], plan) -> tuple[str, list[str]]:
        shared_labels = safe_labels(shared)
        names = ", ".join(first_names)
        common = f" You all like {shared_labels[0].lower()}." if shared_labels else ""
        text = f"Hi {names}! I'm Muse.{common} I'm handling the booking and the calendar."
        return text, ["What got you into this?", "Been here before?", "Anyone want to grab food after?"]

    async def nudge(self, signal_label: str, plan: dict, unless_pending: bool = False) -> tuple[str, str] | None:
        title = (plan.get("title") or "A meetup you might like")[:60]
        return (
            title,
            f"Muse noticed {signal_label[:1].lower() + signal_label[1:]}. There's a meetup for that this week.",
        )


def _store():
    from cg_api.store import store  # local: store must not depend on ports

    return store


class StubAgent:
    async def start(self, meetup_id: str) -> None:
        log.info("agent stub: start %s (no steps)", meetup_id)

    async def on_approval(self, approval_id: str) -> None: ...

    async def on_message(self, thread_id: str, message_id: str) -> None: ...


@dataclass
class Ports:
    muse: Muse = field(default_factory=StubMuse)
    laya: Laya = field(default_factory=StubLaya)
    extractor: Extractor = field(default_factory=StubExtractor)
    copy: Copy = field(default_factory=StubCopy)
    agent: AgentRunner = field(default_factory=StubAgent)


ports = Ports()


def install_providers() -> None:
    try:
        from cg_api.providers import install  # slice D
    except ImportError:
        log.info("no cg_api.providers yet; using stub ports")
        return
    install(ports)


def matching() -> Any:
    """cg_matching (path dependency on packages/matching), imported lazily. Raises Unavailable if missing."""
    try:
        import cg_matching
    except ImportError as e:
        raise Unavailable("cg_matching not installed (uv sync)") from e
    return cg_matching
