# Muse

Muse is Meta's model, model id `muse-spark-1.3`, reached through an OpenAI-compatible **Responses API**. Besides Laya it is the only model peer the backend talks to (P10). Client: `services/api/src/cg_api/muse/__init__.py` (`MuseClient`, `openai.AsyncOpenAI` with `max_retries=0`), wired in `cg_api/providers/__init__.py`.

The design rule: **Muse is kept off the request path.** Meta's endpoint takes about 10 s per answer (`FILL_TIMEOUT_S` comment in `muse/copy.py`) and sheds load with 503s. So most user-facing text is served from a template first and replaced by Muse's text once a background fill lands. A cache file and a precompute command warm that before the demo.

## Config

| Env | Default (`cg_api/settings.py`) | Notes |
| --- | --- | --- |
| `MUSE_BASE_URL` | `https://api.meta.ai/v1` | |
| `MODEL_API_KEY` | empty | Secret. Lives only in the gitignored root `.env`; `repr` hides it. |
| `MUSE_MODEL` | `muse-spark-1.3` | At startup a daemon thread calls `GET {base}/models` and logs `muse models: [...] (using muse-spark-1.3)`, or `NOT LISTED` when the id is missing |
| `MUSE_FAKE` | `0` | `1` = every call raises `Unavailable` and callers use their templates. Tests set it (`services/api/tests/conftest.py`). It also disables the copy cache file. |

Params (`contracts/params.yaml`, `muse:`): `liveTimeoutS` 8 (the client's default timeout), `batchTimeoutS` 60 (extraction), `askPerHour` 30, `askMaxChars` 500.

Request shape (`MuseClient.respond(purpose, input, schema, tools, effort, timeout_s)`): `responses.create(model, input, reasoning={"effort": effort}, text.format = json_schema strict)`, plus `tools` when given. Each call is one attempt: the SDK's own retry would honour a 503's `Retry-After: 60` and stall, so callers do their own capped backoff. Any SDK, network or parse failure raises `Unavailable` (D4), never a 500. Counters: `client.calls["<purpose>.<live|failed|fake>"]`; each call logs its latency in ms.

## What Muse generates

| Purpose | Effort | Where | On the request path? | Fallback |
| --- | --- | --- | --- | --- |
| `bar`: Muse bar understanding (text → filter + 1 to 2 sentence reply) | low | `muse/bar.py` `understand`, route `routes/muse_bar.py` | **yes**, up to `liveTimeoutS` 8 s | keyword filter + templated reply |
| `copy.title`: title of a plan made from the Muse bar (`createPlan`) | low | `muse/copy.py` | **yes**, up to 8 s | template `plan_title` |
| `copy.intro`: group intro + 3 conversation starters when a meetup forms | low | `muse/copy.py`, called by `domain/runner.py` | **yes** (runner, not an HTTP request), up to 8 s | template `intro_text`, `starters` |
| `copy.reason`: "why this meetup fits me" on feed cards and plan pop-ups | low | `muse/copy.py`, `domain/plans.py` | no: template now, background fill | template `plan_reason` |
| `copy.setup`: the setup review line ("What Muse picked up") | low | `muse/copy.py`, `routes/setup.py` | no | template `setup_review` |
| `copy.nudge`: nudge title and text | low | `muse/copy.py`, `domain/nudges.py` | no; in `DEMO_MODE` the nudge waits unshown until Muse's text lands | template `nudge` |
| `extract`: interests and signals from activity + connector records | high | `muse/extract.py` `Extractor` | not on a read path: `seed.derive` on seed load, setup and connector connect/disconnect, `batchTimeoutS` 60; cached | deterministic extraction |
| `escalate.<question>`: Laya undecided | low | `muse/extract.py` | only when `inline_muse` is set (off by default) | fail closed with live Muse and live Laya |

The system prompt for copy says: "You are Muse, the planning assistant in Common Ground. Call the things people join "meetups", never "plans". Warm, short, plain. First person, never pretend to be a person. No emoji, no percentages or scores. Talk about the activity, never about loneliness. Use only the facts given." The bar prompt also says "meetups, never plans" (Meetups rebrand, #148). An answer that is empty or over the limit (title 60, reason 160, nudge title 80 / text 160, starters under 90 characters and exactly 3) is replaced by the template.

**Muse does not generate:**

- **Agent steps and approvals.** `ports.agent` stays the `StubAgent`; `domain/runner.py` drives `agent.ScriptedRun`, the scripted planner (also the Muse-down fallback). Step labels such as "Reserved a table for 4 at Little Fern Kitchen · 7 PM" and approval text come from template helpers (`agent/__init__.py`, `muse/copy.py` `approval_copy`). The app's faux restaurant call is drawn on top of that label and is UI only ([app.md](app.md)). PRD-2 describes a tool-using Muse agent; `respond(tools=...)` is supported by the client but no caller passes tools.
- **Muse's chat answers.** A message to Muse in a group thread (the Ask Muse toggle, or text starting "Muse") goes to `runner.to_muse`, which answers from the scripted run with templated text: a new time is parsed and the run reschedules (steps tick again); a different day, another venue or cancelling gets "… needs everyone's OK"; anything else gets "Here are the details: …".
- **Synthetic counterparts' chat lines.** When a person posts in a group thread, one synthetic member replies after `demo.syntheticDelayS` (2 to 5 s) with one of six fixed lines (`cg_api/synthetic/__init__.py` `CHAT_LINES`, #160). **They are templated on purpose: real Muse refuses to speak as a person** ("I'm Muse Spark, an AI...") and takes 8 to 20 s (code comment there). The app shows typing only for Muse ([app.md](app.md)).

### Muse bar (`askMuse`)

`POST /v1/muse/ask` with `{text, conversationId}`. Checks: non-empty, at most `askMaxChars` 500, opted in, at most `askPerHour` 30 per user (429 `rate_limited`). Conversations are in-process, scoped to the owner and keyed by an unguessable `mc_<hex>`, so another user's id starts a fresh conversation. The last 6 turns go to Muse along with the local time in `America/Los_Angeles` and the activity-type list. Muse's JSON is checked field by field: unknown activity types and sensitive or unknown interest ids are dropped, and group size must be between 2 and 20. The filter then runs over the viewer's own ranked plan cards (`bar.best`). Muse's reply is used only when it found plans without relaxing the filter; otherwise `bar.reply` writes "I found N meetups that fit." and similar. A pasted Google Maps link is parsed locally and never fetched (P10). `createdPlanId` is always null here: creating a plan is `createPlan`, which reuses the bar parser.

Live latency: an ask that reaches Muse is bounded by `liveTimeoutS` (8 s). Meta's endpoint often takes about 10 s, so a slow answer falls back to the keyword filter and the user still gets an answer. The app allows 30 s for this call (`api.ts` `LONG`) and shows `MuseThinking` lines meanwhile.

## Off the request path: background cache

`MuseCopy` (`muse/copy.py`) never waits on Muse for reasons, setup review or nudges. It returns the **template immediately** and starts a background fill: 3 concurrent, 3 attempts, backoff `min(5 s, 1 s × 2^attempt)` (a 503's `Retry-After` is ignored), 30 s timeout per fill (`FILL_TIMEOUT_S`). A failed key is not retried for 60 s. The next request for the same prompt gets Muse's text. Only `intro` and `plan_title` wait for Muse, up to `liveTimeoutS`.

- **Cache file**: `services/api/.cache/muse_copy.json`, gitignored by `services/api/.gitignore`. Keyed by sha256 of purpose + prompt, saved atomically (`.tmp` then rename) as each answer arrives, and loaded at startup, so a restarted server starts warm. Not used when `MUSE_FAKE=1`.
- **Nudges** (#175): in `DEMO_MODE` a new nudge stays unseen until Muse's wording lands (or the fill gives up and the template is used), and the copy it is first served with is frozen. Before this fix every `listNudges` asked Copy again, and the text flipped between Muse's and the template.
- **Prompt privacy** (PRD-2 §3.6): prompts are built only from the call's arguments; plans pass through `public_plan` (title, activity, venue, neighborhood, times, cost label). `safe_labels` fails closed: only interests with `visibility: "shown"` and `sensitive: false` are spoken (`tests/ai/test_prompt_privacy.py`).
- **Extraction cache**: `Extractor` keeps an in-process cache by content hash. The seed loader also caches on disk under `services/api/.cache/extract/` (`seed/__init__.py` `_extract`), keyed `{Extractor}-{live|fake}-v{cache_version}-{sha256}`; fake and live never share entries. `cache_version` is 3. Busy blocks never reach Muse or Laya.

## Precompute: `cg-api-precompute-muse <poolId>`

`cg_api/muse/precompute.py` (script entry in `services/api/pyproject.toml`). Needs `MUSE_FAKE=0` and `MODEL_API_KEY`; with `MUSE_FAKE=1` it prints a message and exits 2. It sets `DEMO_MODE=1` and loads the seed in-process; it never touches the running server. Then it walks the pool's demo users (`mayaId` and `liveUserId`) through the app's own requests over an in-process ASGI client: opt in, setup, connect every connector, setup again, feed, every feed plan, nudges, and the reasons for every ranked plan the Muse bar can surface (`plans.warm_reasons`). Copy therefore sees exactly the prompts the live server will send. It prints progress every 5 s while fills are in flight and ends with `done: N cached (M new), F failed -> <path>`. Exit 0 when nothing failed; exit 1 means run it again (it is resumable).

```sh
cd services/api && uv run cg-api-precompute-muse pool_sf_city
cd services/api && uv run cg-api-precompute-muse pool_evt_closer_together
```

Run it once per pool, re-run until it reports 0 failed, then restart the backend so it loads the warm cache ([runbook.md](runbook.md)).

## Fallbacks

Every Muse call site catches `Unavailable` (timeout, 503, parse error, `MUSE_FAKE`) and returns the deterministic template; the fake path and the fallback are the same code (D4). Signs that Muse is not live: templated text in the app and `muse <purpose> failed after N ms` in the backend log. The API returns 503 `muse_unavailable` only where no fallback exists. Troubleshooting: [runbook.md](runbook.md).
