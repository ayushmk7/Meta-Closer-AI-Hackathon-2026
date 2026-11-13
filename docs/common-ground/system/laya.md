# Laya

Laya answers yes/no and scored questions as probabilities. It is served by `laya-serve` (separate from this repo) and called by the backend and the sim.

## Server

- URL `LAYA_URL` (default `http://127.0.0.1:8090`), model `LAYA_MODEL` (default `laya`).
- Jev-compatible `POST /v1/systemone`: body `{"model", "state": "<rendered text>", "questions": {"<key>": {"type", "instructions", "criteria"?}}}`, response `{"answers": {"<key>": ...}}` (`contracts/laya_questions.yaml` header; `laya/__init__.py` `_post`).
- Answer parsing is tolerant and lives in one place per service (`cg_api/laya/__init__.py` `_parse_answer`, `cg_sim/laya/__init__.py` `_answer_p`): a bare number, or first numeric of `p, probability, yes, value, expected`, else `probabilities`/`distribution` (list over criteria for `score`, `{yes|true: p}` for `noul`). Anything else raises `LayaUnavailable`.
- **TODO (unverified):** real field names. Both adapters and CONTRACTS Decisions still say "unverified"; `HUMAN_TODO.md` §2.3 has the curl to check. The brief for this doc says answers carry `noul`/`score`/`probabilities`; that is not confirmed by code in this repo.
- **TODO (not in repo):** `LAYA_SERVE_BACKEND=laya` (real weights) vs a fake backend is a `laya-serve` setting; nothing in this repo reads it. See [runbook.md](runbook.md).

## Questions

`contracts/laya_questions.yaml` (`questionsVersion: 2`) is the single source of templates, shared by backend and sim; `contracts/laya_golden.json` holds reference renders both must match byte for byte. Only `noul` (p ∈ [0,1]) and `score` (expected value over `criteria`) are used, never `choice`.

| Key | Type | Used for |
| --- | --- | --- |
| `sensitive_interest` | noul | free-text/edge-case interest sensitivity |
| `sensitive_place` | noul | every place signal; yes hides the signal and derived interests (P4) |
| `interest_strength` | score | interest weight |
| `join_activity` | noul | `p_join` table |
| `show_up` | noul | `p_show` table |
| `meet_again` | noul | `p_meet_again` table |
| `plan_ok` | noul | screens user-created plans and share captions (`domain/create_plan.py`, `domain/shares.py`); skipped under `LAYA_FAKE`; decisive no = 422 `screened` |
| `message_flag`, `report_severe` | noul | declared `usedBy: backend`; **TODO:** no call site found in `services/api/src` |

Decisive rule: `laya.decisiveThreshold` 0.85. A noul answer with p ≥ 0.85 or ≤ 0.15 is decided by Laya; otherwise the caller escalates to Muse (`muse/extract.py` `_yes`). Changing any template bumps `questionsVersion`.

## LayaClient (backend)

`cg_api/laya/__init__.py`. `ask(question, state)` renders the state (only fields named in the template can leak), caches by `(questionsVersion, question, sha256(state))`, returns `(p, decisive)`. Failures raise `LayaUnavailable` and log an error when fallbacks exceed 5% of calls. `LAYA_FAKE=1`: `p = int(sha256(f"{version}|{question}|{state}")[:8],16)/0xFFFFFFFF` (same formula in the sim). **Tests only**: it is a hash, not a judgement, and marks random interests sensitive (HUMAN_TODO §2).

## Tables

`laya_questions.yaml#tables`:

| Table | Columns | Read by |
| --- | --- | --- |
| `activity.parquet` | `user_id, activity_type, p_join, p_show` | `rank_plans` via `LayaTables.p_join/p_show` |
| `meet_again.parquet` | `user_a < user_b, p_meet_again` (each user's top `sim.candidatesPerUser` 20) | `form_groups` pair score |
| `manifest.json` | `poolId, questionsVersion, layaModel, createdAt, rows, exportGeneratedAt` | provenance |

Locations: `data/laya_tables/<pool>/` is what the **backend** loads (live, from the backend export); `data/sim/laya_gt/<pool>/` is **sim-only** (built from ground truth). Current state on this branch: only `data/sim/laya_gt/` is committed, and its manifests say `"layaModel": "fake"`. `data/laya_tables/` is absent. **TODO:** real tables not yet committed.

## Precompute

```sh
cd services/sim
uv run cg-sim precompute --pool pool_sf_city                       # backend export (needs `make api` running) -> data/laya_tables/<pool>, then POST /internal/v1/laya-tables/reload
uv run cg-sim precompute --pool pool_sf_city --use-ground-truth    # export from data/sim_private -> data/sim/laya_gt/<pool>, no reload
uv run cg-sim precompute --fake-laya ...                           # hash rule instead of LAYA_URL
uv run cg-sim precompute                                           # every pool
```

Flags: `--pool`, `--fake-laya`, `--use-ground-truth`, `--out DIR`, `--no-reload` (`precompute/__init__.py`). Per user × activity type, one Laya call answers `join_activity` and `show_up`. Without `--use-ground-truth` it fetches `CG_INTERNAL_URL/internal/v1/pools/<id>/export`, so seed the pool first. Ground-truth tables never go to `data/laya_tables/` (PRD-3 §2).
