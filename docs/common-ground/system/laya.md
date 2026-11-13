# Laya

Laya is the local probability model. It answers yes/no questions (`noul`) and graded questions (`score`) about a rendered text "state" and returns probabilities. It runs as `laya-serve` (a separate package, not in this repo) and is called by the backend (`services/api`) and the simulation (`services/sim`). Muse (Meta's LLM API) is the escalation path for answers Laya is unsure about; see [muse.md](muse.md).

Everything below was checked against `origin/main` code. File references are relative to the repo root.

## Where Laya is used

| Caller | Question(s) | When | Code |
| --- | --- | --- | --- |
| Backend, interest extraction | `sensitive_interest` (noul), `interest_strength` (score) | Every extracted interest when a persona's activity is extracted (seed/pool load) | `services/api/src/cg_api/muse/extract.py` `_gate_interest` |
| Backend, signal gate | `sensitive_place` (noul) | Every non-sensitive `frequent_place`, `saved_place`, `post` or `ticket` signal with a place name | `extract.py` `gate_signal` |
| Backend, create a meetup | `plan_ok` (noul) | `createPlan` from the Muse bar | `services/api/src/cg_api/domain/create_plan.py` |
| Backend, share caption | `plan_ok` (noul) | `shareMeetup` caption | `services/api/src/cg_api/domain/shares.py` `share_meetup` |
| Sim precompute | `join_activity`, `show_up`, `meet_again` (noul) | Offline, `cg-sim precompute` | `services/sim/src/cg_sim/precompute/__init__.py` |
| Matching (via tables) | none live: reads `p_join`, `p_show`, `p_meet_again` | `rank_plans`, `form_groups` | `packages/matching/src/cg_matching/types.py` `LayaTables` |

`message_flag` and `report_severe` are declared in `contracts/laya_questions.yaml` with `usedBy: [backend]` but nothing in `services/api/src` asks them.

## Running laya-serve (real weights)

laya-serve 0.2.1 (it pulls in the `laya` package, 0.4.31 on the demo laptop) is installed outside the repo, for example with `uv tool install laya-serve`, which puts its interpreter at `~/.local/share/uv/tools/laya-serve/bin/python`. Start it from a neutral directory with uvicorn directly:

```sh
cd /tmp && \
LAYA_SERVE_BACKEND=laya LAYA_SERVE_PRELOAD=true HF_HUB_DISABLE_XET=1 HF_HUB_OFFLINE=1 \
  <laya-serve venv python> -m uvicorn laya_serve.app:create_app --factory --host 0.0.0.0 --port 8090
```

Why each piece is there:

| Setting | Why |
| --- | --- |
| `uvicorn ... --factory --port 8090` instead of the `laya-serve` CLI | The CLI defaults to `0.0.0.0:8000` (`laya_serve/cli.py`), and its torch worker child re-binds `0.0.0.0:8000`, which collides with the backend (`cg-api` on 8000). Calling uvicorn on the app factory avoids the CLI entirely. |
| `cd /tmp` | Keeps the repo's own modules off `sys.path` of the laya-serve interpreter. |
| `LAYA_SERVE_BACKEND=laya` | **Required.** laya-serve's default backend is `fake` (`laya_serve/settings.py`: deterministic, weight-free answers). Our clients cannot tell the difference, and the precompute manifest records `LAYA_MODEL` (`laya`) either way, so a forgotten flag produces tables labelled `laya` that are not real. |
| `LAYA_SERVE_PRELOAD=true` | Loads the weights at start, so the first request does not time out the backend's 5 s client. |
| `HF_HUB_DISABLE_XET=1` | Hugging Face's XET transfer stalled weight downloads on the demo network. |
| `HF_HUB_OFFLINE=1` | Use the cached weights only. Drop it for the very first run, when the weights still need downloading. |

Other laya-serve settings (all `LAYA_SERVE_` prefixed): `DEVICE`, `MAX_LOADED` (1), `SERVING_MODEL` (`laya-english`), `EXTRA_MODELS`, `API_KEY`, `RATE_LIMIT_PER_MINUTE` (0 = off). Do not set `LAYA_SERVE_API_KEY`: neither client sends an `Authorization` header. The request `model` field accepts the built-in aliases (`laya`, `jev-latest`, `jev-preview`, `jev-1.13`, `jev-1.13.0`) plus `EXTRA_MODELS`.

Check it answers with the real shape:

```sh
curl -s -X POST http://127.0.0.1:8090/v1/systemone -H 'Content-Type: application/json' \
  -d '{"model":"laya","state":"User likes ceramics.","questions":{"q":{"type":"noul","instructions":"Is this sensitive?"}}}'
# -> {"answers": {"q": {"type": "noul", "noul": 0.0...}}, ...}
```

Start order and the rest of the stack: [runbook.md](runbook.md).

## Client configuration

| Variable | Default | Read by | Meaning |
| --- | --- | --- | --- |
| `LAYA_URL` | `http://127.0.0.1:8090` | backend `settings.py`, sim `LayaClient` | laya-serve base URL |
| `LAYA_MODEL` | `laya` | both | sent as `model`; the sim also writes it into `manifest.json` as `layaModel` |
| `LAYA_FAKE` | `0` | backend `settings.py`; sim `precompute` treats `LAYA_FAKE=1` like `--fake-laya` | **Tests and offline only.** Replaces Laya with a hash (below) |

Backend client timeout: 5 s per call (`LayaClient(timeout_s=5.0)`). Sim client timeout: 60 s per call, 8 worker threads. The decisive threshold comes from `contracts/params.yaml` `laya.decisiveThreshold` (0.85), wired in `services/api/src/cg_api/providers/__init__.py` `install`.

### `LAYA_FAKE` (the hash)

```
p = int(sha256(f"{questionsVersion}|{questionKey}|{renderedState}").hexdigest()[:8], 16) / 0xFFFFFFFF
```

Same formula in both services (`cg_api/laya` `fake_p`, `cg_sim/laya` `fake_p`), and score questions use the same `p` as their expected value. It is a hash of the text, not a judgement: p is uniform, so about 15% of noul answers land decisive-yes (p ≥ 0.85) and it marks random interests sensitive, and under `LAYA_FAKE` `interest_strength` sets interest weights to hash values. The backend therefore never fails closed on it (see below) and skips the `plan_ok` screen entirely. Do not confuse it with laya-serve's own `fake` backend: that one is inside laya-serve and invisible to us.

## Wire protocol

Jev-compatible `POST {LAYA_URL}/v1/systemone`:

```json
{"model": "laya",
 "state": "<rendered state text>",
 "questions": {"<key>": {"type": "noul" | "score", "instructions": "...", "criteria": ["..."]}}}
```

`criteria` is sent only for `score` questions. The backend sends one question per request (`LayaClient._post`). The sim sends `join_activity` and `show_up` together because they share one state template (precompute asserts this), and `meet_again` alone.

### Answer shapes (laya-serve 0.2.1, real weights, captured 2026-11-13)

```json
{"type": "noul", "noul": 0.0889}
{"type": "score", "score": 1.0,
 "legend": {"0": "weak", "1": "medium", "2": "strong"},
 "probabilities": {"0": 0.2, "1": 0.3, "2": 0.5},
 "confidence": 0.4}
```

`score` answers key `probabilities` and `legend` by the criterion's index as a string, not by its label.

### Parsing

Both adapters were fixed for these shapes in #130 (backend) and #131 (sim); before that every real answer failed and fell back. The mapping lives in one place per service:

- `services/api/src/cg_api/laya/__init__.py`: `ANSWER_SCALAR_FIELDS`, `ANSWER_DIST_FIELDS`, `_parse_answer`
- `services/sim/src/cg_sim/laya/__init__.py`: same constants, `_answer_p`

```python
ANSWER_SCALAR_FIELDS = ("noul", "p", "probability", "yes", "value", "expected")
ANSWER_DIST_FIELDS = ("probabilities", "distribution")
```

Rules, in order:

1. A bare number is the answer.
2. Otherwise the first numeric field in `ANSWER_SCALAR_FIELDS` wins. Real noul answers hit `noul`. `score` is deliberately not in the list, so the server's `score` field is ignored.
3. For `score` questions: take the first non-empty field in `ANSWER_DIST_FIELDS`. A list is used as is; a dict is read per criterion as `probs.get(label, probs.get(str(index), 0.0))` (labels first, then the index keys real Laya sends). The result is the expected value normalised to [0, 1]: `sum(p_i * i / (n - 1))`. For the captured example: 0.3 × 0.5 + 0.5 × 1.0 = 0.65.
4. For `noul` questions with a dict distribution: `yes`, else `true`.
5. Anything else is an error.

Small differences between the two adapters (code is frozen, so they stay):

| | Backend `_parse_answer` | Sim `_answer_p` |
| --- | --- | --- |
| Bad shape | raises `LayaUnavailable` | raises `ValueError` (caught per key, falls back to `fake_p`) |
| Booleans | rejected | `True` is accepted as 1.0 |
| Single-criterion score | rejected (needs > 1 value) | would divide by zero |
| Non-dict, non-number answer (e.g. a string) | `LayaUnavailable` | `AttributeError`, not caught, aborts the batch |
| Clamp to [0, 1] | yes, after parsing | no |

Tests that pin the real shapes: `services/api/tests/ai/test_laya.py::test_parse_real_laya_serve_answers` and `services/sim/tests/laya/test_real_fields.py::test_parse_real_laya_serve_answers`.

## Questions

`contracts/laya_questions.yaml` (`questionsVersion: 2`) is the only source of templates. Both services render `state` from it, and `contracts/laya_golden.json` holds reference renders they must reproduce byte for byte (tests in both services). Any template or instruction change bumps `questionsVersion`; tables with an older version are ignored by the backend and must be recomputed. Only `noul` and `score` are used, never `choice`.

| Key | Type | State template (fields) | Used for |
| --- | --- | --- | --- |
| `sensitive_interest` | noul | `Interest: {label} ({path}). Evidence: {evidence}` | Free-text/edge-case check. Taxonomy nodes marked sensitive are always sensitive without asking. |
| `sensitive_place` | noul | `Place: {placeName}. Kind: {placeKind}. Pattern: {pattern}` | Every place signal. Yes hides the signal, relabels it "A place you visit"/"A place you saved", and hides every interest it produced (P4). |
| `interest_strength` | score, criteria `passing mention, occasional, regular hobby, core part of their life` | same as `sensitive_interest` | The interest's weight (rounded to 2 dp). Falls back to the extractor's own weight if Laya is unavailable. |
| `join_activity` | noul | `{user_summary:A}` + `Activity type: {activityType}.` | `p_join` in `activity.parquet` |
| `show_up` | noul | same as `join_activity` | `p_show` in `activity.parquet` |
| `meet_again` | noul | `{user_summary:A}` + `{user_summary:B}` | `p_meet_again` in `meet_again.parquet` |
| `plan_ok` | noul | `Plan proposed by a user on a friend-finding app: "{text}"` | Screens created meetups and share captions |
| `message_flag`, `report_severe` | noul | chat message / report text | Declared, no call site |

`user_summary` renders only public fields: alias `A`/`B` (never a name), neighborhood, age band, group-size preference, availability slots (sorted mon..sun, morning..evening), up to 12 shown non-sensitive interests (weight desc, then id) as `Label (0.82)`, and up to 5 most recent activity items, newest first, text cut at 117 chars + `...`. Empty lists render `none`. Hidden and sensitive interests never reach Laya. There are 31 `activityTypes`, so `activity.parquet` has 31 rows per user.

### Decisive rule and fail-closed

`is_decisive(p) = p >= 0.85 or p <= 0.15` (`laya.decisiveThreshold`).

- **Sensitivity gates** (`Extractor._yes`): a decisive answer decides (`yes` if p ≥ 0.85). If Laya is undecided or unavailable (treated as p = 0.5), the code escalates to Muse only when `inline_muse` is on, and `providers.install` never turns it on. So an undecided answer returns `fail_closed`, which is `true` (hide it) only when Muse is live **and** Laya is not fake. With `LAYA_FAKE=1` or `MUSE_FAKE=1` undecided means "not sensitive". The comment cites the reason: failing closed on the hash hid about 70% of Maya's interests (#65).
- **`plan_ok`**: only a decisive no (p ≤ 0.15) blocks, with `422 screened`. Undecided passes. Under `LAYA_FAKE` the screen is skipped. If laya-serve is down, `LayaUnavailable` is not caught on this path, so `createPlan` and `shareMeetup` return the generic `500 internal` (retryable) until Laya is back.

## Backend `LayaClient`

`services/api/src/cg_api/laya/__init__.py`, installed as `ports.laya` by `providers.install`.

- `ask(question, state) -> (p, decisive)`. Renders the state with `render()`: one regex pass over the template, so braces inside user text are never expanded again, and only fields named in the template can leak.
- Cache: in-process dict keyed by `(questionsVersion, question, sha256(rendered state))`. Unbounded, lives for the process, and stores fake and live answers alike. Failures are not cached, so the next call retries.
- Counters `calls = {live, fake, cached, failed}`. Each failure logs a warning with latency; when failures exceed 5% of `failed + live` it also logs `laya fallbacks above 5%` at error level (CONTRACTS Decisions). Each live answer logs `laya <question> p=… <ms>`.
- Failure handling: any HTTP error, bad JSON, missing key or unrecognised shape becomes `LayaUnavailable` (a `ports.Unavailable`). What happens next is up to the caller (table above).
- Startup log line: `providers: muse <url|fake>, laya <url|fake>`.

## Sim `LayaClient`

`services/sim/src/cg_sim/laya/__init__.py`. `ask_many([(state, [keys])]) -> [{key: p}]`, eight threads over one `httpx.Client` (60 s timeout).

- A failed request prints `laya: request failed (...)` and answers every key with `fake_p`. A bad answer for one key prints `laya: bad answer for <key>` and falls back for that key only. Every fallback is recorded in `client.fallbacks`.
- `precompute.run` refuses to write anything when fallbacks exceed `MAX_FALLBACK_SHARE` (5%) of questions asked. Below that it writes the tables and records the count in the manifest, e.g. `"layaModel": "laya (12 fake fallbacks)"`.
- Fake mode (`--fake-laya` or `LAYA_FAKE=1`) never touches the network.

## Tables

Schema (`contracts/laya_questions.yaml#tables`; parquet, zstd, no schema metadata so reruns are byte-identical):

| File | Columns | Key | Read by |
| --- | --- | --- | --- |
| `activity.parquet` | `user_id, activity_type, p_join, p_show` (float64) | `(user_id, activity_type)`, every user × 31 activity types | `rank_plans` via `LayaTables.p_join/p_show` |
| `meet_again.parquet` | `user_a, user_b, p_meet_again` | `user_a < user_b`; the union of each user's top `sim.candidatesPerUser` (20) `cg_matching.candidates`, minus blocked pairs | `form_groups` pair score |
| `manifest.json` | `poolId, questionsVersion, layaModel, createdAt, rows, exportGeneratedAt` | | provenance; `createdAt` is pinned to the export's `generatedAt` |

`LayaTables` (`packages/matching/src/cg_matching/types.py`) returns `default` 0.5 for any missing row and rejects non-finite values. The sim's own dense `Tables` (`services/sim/src/cg_sim/mc/world.py`) defaults missing `p_join`/`p_show` to 0.5 and missing `p_meet_again` to 0.2 (pairs outside the top-K get a low prior).

### What is committed

| Directory | Built from | `layaModel` | Users | Rows (activity / meet_again) | Mean p_join / p_show / p_meet_again | Consumer |
| --- | --- | --- | --- | --- | --- | --- |
| `data/laya_tables/pool_sf_city/` | backend export, real laya-serve (#138) | `laya` | 300 | 9300 / 3129 | 0.474 / 0.367 / 0.655 | backend (`reloadLayaTables`) |
| `data/sim/laya_gt/pool_sf_city/` | ground-truth export (`data/sim_private`), real laya-serve (#138) | `laya` | 301 | 9331 / 2804 | 0.433 / 0.317 / 0.627 | sim (`cg-sim run`, grid, tune) |
| `data/sim/laya_gt/pool_evt_closer_together/` | ground-truth export, hash | `fake` | 80 | 2480 / 426 | 0.500 / 0.493 / 0.518 | sim only |

There is no `data/laya_tables/pool_evt_closer_together/`: the event pool's backend tables were skipped on purpose (human decision, #138). Ground-truth tables never go to `data/laya_tables/` (PRD-3 §2), so the backend never sees anything derived from `sim_private`.

### How the backend loads tables, and a known gap

At pool load (`cg_api/seed/__init__.py` `_maybe_tables`) and on `POST /internal/v1/laya-tables/reload {"poolId"}` (`internal/pools.py` `load_tables`), the backend reads `data/laya_tables/<pool>/manifest.json`. If its `questionsVersion` matches `params.laya.questionsVersion` it sets `store.laya_tables_dir` and returns the row counts; otherwise it logs a warning and clears it. A missing directory returns `404 not_found` from the reload endpoint and an info log at load.

**Gap (code frozen, not fixed):** nothing reads `store.laya_tables_dir`. `services/api/src/cg_api/domain/matching.py` passes an empty `cgm.LayaTables()` to both `rank_plans` and `form_groups`, so the live app ranks with `p_join = p_show = p_meet_again = 0.5` for everyone. The committed real tables are loaded and reported but do not change live ranking or grouping. The sim does use its real tables. The load log "no data/laya_tables/<pool> yet; Laya rows are computed live" is also misleading: nothing computes them live. The fix would be to build `LayaTables.from_dir(store.laya_tables_dir)` once per reload and pass it in both calls.

## Precompute

```sh
cd services/sim
uv run cg-sim precompute --pool pool_sf_city                      # backend export -> data/laya_tables/pool_sf_city, then reload
uv run cg-sim precompute --pool pool_sf_city --use-ground-truth   # data/sim_private -> data/sim/laya_gt/pool_sf_city, no reload
uv run cg-sim precompute --pool pool_sf_city --fake-laya          # hash instead of LAYA_URL
uv run cg-sim precompute                                          # every pool in contracts/modes.yaml
make sim-precompute POOL=pool_sf_city                             # the first line
```

| Flag | Effect |
| --- | --- |
| `--pool ID` | One pool; default every pool |
| `--fake-laya` | Hash rule (also `LAYA_FAKE=1`) |
| `--use-ground-truth` | Export built from `data/sim_private` instead of the backend; output to `data/sim/laya_gt/`; never reloads |
| `--out DIR` | Output directory (single pool only) |
| `--no-reload` | Skip `POST /internal/v1/laya-tables/reload` |

Without `--use-ground-truth` it fetches `GET {CG_INTERNAL_URL}/internal/v1/pools/<id>/export` (default `http://127.0.0.1:9001`), so the backend must be running with the pool loaded. A failed reload only prints a warning. A `questionsVersion` mismatch between export and contracts prints a warning and continues. Real Laya cost: one call per user × activity type (about 9.3k for `pool_sf_city`) plus one per candidate pair (about 2.8k to 3.1k). Do not run it against the live demo backend; it reloads that backend's tables.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `laya fallbacks above 5%` in the backend log | laya-serve down, slow (5 s timeout), or answering a shape the adapter does not parse. Run the curl above. |
| Many interests hidden as sensitive | `LAYA_FAKE=1` with an older build, or real Laya undecided with live Muse (fail closed). Check the startup `providers:` line. |
| Precompute exits `N/M Laya answers fell back to fake_p; nothing written` | More than 5% of answers failed; check `LAYA_URL` and the laya-serve log. |
| Tables look real but feel random | laya-serve started without `LAYA_SERVE_BACKEND=laya` (its default is `fake`). |
| Port 8000 taken after starting Laya | Started with the `laya-serve` CLI; use the uvicorn command above. |
| Weight download hangs | Set `HF_HUB_DISABLE_XET=1`; for a stuck cache see [runbook.md](runbook.md). |
| Backend ignores new tables | Manifest `questionsVersion` mismatch (warning in the log), and see the gap above. |
