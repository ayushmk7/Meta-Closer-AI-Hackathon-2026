# Muse

Muse is Meta's model, reached through an OpenAI-compatible **Responses API**. Client: `services/api/src/cg_api/muse/__init__.py` (`MuseClient`, uses the `openai` SDK `AsyncOpenAI`, `max_retries=0`).

## Config

| Env | Default | Notes |
| --- | --- | --- |
| `MUSE_BASE_URL` | `https://api.meta.ai/v1` | |
| `MODEL_API_KEY` | (secret) | never commit `.env` |
| `MUSE_MODEL` | `muse-spark-1.3` | `HUMAN_TODO.md` §1: verify with `GET /models` |
| `MUSE_FAKE` | `0` | `1` = every call raises `Unavailable`; callers use templates. Tests only (`tests/conftest.py` sets it) |

At startup a background thread logs `GET {base}/models` and whether `MUSE_MODEL` is listed. Request shape: `responses.create(model, input, reasoning={"effort": ...}, text.format=json_schema strict, tools)`. Timeout default `muse.liveTimeoutS` 8 s; `batchTimeoutS` 60.

## Effort levels in use (from code)

| Purpose | Effort | File |
| --- | --- | --- |
| `bar` (Muse bar understanding) | low | `muse/bar.py` |
| `copy.*` (title, reason, setup, intro, nudge) | low | `muse/copy.py` |
| `escalate.<question>` (Laya undecided) | default low | `muse/extract.py` |
| `extract` (interests/signals from activity + records) | high | `muse/extract.py` |

## What Muse is used for

- **Muse bar** (`askMuse`, `routes/muse_bar.py`): text → filter over the viewer's ranked plans + 1 to 2 sentence reply. On the request path with the live timeout; any failure falls back to keyword matching (`bar.keyword_filter`). Rate limit `muse.askPerHour` 30; text ≤ `askMaxChars` 500. Pasted Google Maps links are parsed locally, never fetched (P10).
- **Copy** (`MuseCopy`): plan titles, "why this plan" reasons, setup review, group intro + 3 starters, nudge text.
- **Extraction** (`Extractor`): interests and signals from activity and simulated connector records; Laya gates sensitivity; cached on disk under `services/api/.cache/extract/` (key `{Extractor}-{live|fake}-v{cache_version}-{sha256(input)}`; fake and live never share; `cache_version` is 3 in `muse/extract.py`).
- **Agent steps**: `ports.agent` stays the stub; `domain/runner.py` drives `agent.ScriptedRun`, the scripted planner (also the Muse-down fallback), whose step and approval text comes from `muse/copy.py` helpers. **TODO:** PRD-2 describes a tool-using Muse agent; the code on this branch does not call `respond(tools=...)`.

## Off the request path: background cache

`MuseCopy` (docstring): feed/plan reasons, titles, setup review and nudges return the **template immediately** and fill a cache in the background (3 concurrent, 3 retries, backoff capped at 5 s, 30 s fill timeout; failures not retried for 60 s). Later requests get Muse's text. Only `intro` and `plan_title` (createPlan) wait for Muse up to the live timeout. Any failure or over-long answer = template.

Cache: `services/api/.cache/muse_copy.json` (gitignored), keyed by sha256 of purpose + prompt, saved atomically as answers arrive. Not used when `MUSE_FAKE=1`. Prompt privacy: prompts are built only from filtered arguments and `public_plan`; `safe_labels` drops sensitive/hidden interests (`tests/ai/test_prompt_privacy.py`).

## Precompute: `cg-api-precompute-muse <poolId>`

`cg_api/muse/precompute.py`. Needs `MUSE_FAKE=0` and `MODEL_API_KEY` (exits 2 otherwise). Loads the seed in-process, walks Maya and the live user through the app's own requests (optIn, setup, connect every connector, feed, every plan, nudges, all ranked plans), then waits for fills. Resumable: run again to retry failures (exit 1 if any failed).

```sh
cd services/api && uv run cg-api-precompute-muse pool_sf_city
cd services/api && uv run cg-api-precompute-muse pool_evt_closer_together
```

## Fallbacks

Every Muse call site catches `Unavailable` (timeout, 503, parse error) and returns the deterministic template; the fake and the fallback are the same code. Counters: `client.calls["<purpose>.<live|failed|fake>"]`; `store.counters.muse_fallbacks`. API-level: 503 `muse_unavailable` only where no fallback exists.
