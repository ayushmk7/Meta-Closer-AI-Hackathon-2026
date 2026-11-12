"""Muse: OpenAI-compatible Responses API at MUSE_BASE_URL (P10: the only model peer besides Laya).

MUSE_FAKE=1 makes every call raise Unavailable, so callers take their templated path; fake and fallback are the
same deterministic code.
"""

from __future__ import annotations

import json
import logging
import time

from cg_api.ports import Unavailable

log = logging.getLogger("cg_api.muse")


class MuseClient:
    """Implements ports.Muse."""

    def __init__(
        self,
        *,
        fake: bool,
        base_url: str = "",
        api_key: str = "",
        model: str = "muse-spark-1.3",
        timeout_s: float = 8.0,
    ):
        self.fake, self.model, self.timeout_s = fake, model, timeout_s
        self.calls: dict[str, int] = {}
        self._client = None
        if not fake:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(base_url=base_url, api_key=api_key, max_retries=1)

    def _count(self, purpose: str, outcome: str) -> None:
        k = f"{purpose}.{outcome}"
        self.calls[k] = self.calls.get(k, 0) + 1

    async def list_models(self) -> list[str]:
        if self.fake:
            return []
        return [m.id async for m in self._client.models.list()]

    async def respond(self, purpose, input, *, schema=None, tools=None, effort="low", timeout_s=None) -> dict:
        if self.fake:
            self._count(purpose, "fake")
            raise Unavailable("MUSE_FAKE=1")
        kw: dict = {"model": self.model, "input": input, "reasoning": {"effort": effort or "low"}}
        if schema:
            kw["text"] = {
                "format": {"type": "json_schema", "name": purpose.replace(".", "_"), "schema": schema, "strict": True}
            }
        if tools:
            kw["tools"] = tools
        t0 = time.monotonic()
        try:
            # live calls (bar, chat, agent) get one attempt so the timeout is the whole budget; batch gets a retry
            retries = 1 if effort == "high" else 0
            client = self._client.with_options(timeout=timeout_s or self.timeout_s, max_retries=retries)
            r = await client.responses.create(**kw)
            text = r.output_text or ""
            data = json.loads(text) if schema else None
        except Exception as e:  # any SDK/network/parse failure is a D4 fallback, never a 500
            self._count(purpose, "failed")
            log.warning("muse %s failed after %.0f ms: %s", purpose, (time.monotonic() - t0) * 1000, e)
            raise Unavailable(str(e)) from e
        self._count(purpose, "live")
        log.info("muse %s %.0f ms", purpose, (time.monotonic() - t0) * 1000)
        calls = [
            {"id": o.call_id, "name": o.name, "arguments": json.loads(o.arguments or "{}")}
            for o in r.output
            if getattr(o, "type", "") == "function_call"
        ]
        return {"text": text, "json": data, "tool_calls": calls}
