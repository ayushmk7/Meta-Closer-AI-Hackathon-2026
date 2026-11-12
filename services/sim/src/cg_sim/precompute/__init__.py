"""cg-sim precompute: Laya tables (laya_questions.yaml#tables) for one or every pool.

    cg-sim precompute [--pool ID] [--fake-laya] [--use-ground-truth] [--out DIR] [--no-reload]

activity.parquet: every user x every activity type (join_activity -> p_join, show_up -> p_show; one Laya
call per state since both questions share it). meet_again.parquet: union of each user's top
params.sim.candidatesPerUser candidates, user_a < user_b. manifest.json alongside.

Output: data/laya_tables/<pool>/ (backend loads it) only from the backend export. --use-ground-truth
tables are derived from sim_private, so they go to data/sim/laya_gt/<pool>/ (sim/MC only) and never
trigger a backend reload (PRD-3 §2).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

from cg_sim import laya, matching_adapter
from cg_sim.contracts import data_dir, params, pool_ids


def _jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def internal_url() -> str:
    return (os.environ.get("CG_INTERNAL_URL") or "http://127.0.0.1:9001").rstrip("/")


def load_export(pool_id: str, use_ground_truth: bool) -> dict:
    if use_ground_truth:
        from cg_sim.seed.export import load_ground_truth_export

        return load_ground_truth_export(pool_id)  # signals filled from connected providers
    import httpx

    r = httpx.get(f"{internal_url()}/internal/v1/pools/{pool_id}/export", timeout=60)
    r.raise_for_status()
    return r.json()


def load_activity(pool_id: str) -> dict[str, list[dict]]:
    by_user: dict[str, list[dict]] = defaultdict(list)
    for a in _jsonl(data_dir() / "seed" / pool_id / "activity.jsonl"):
        by_user[a["userId"]].append(a)
    return by_user


def candidates(export: dict, k: int) -> dict[str, list[tuple[str, float]]]:
    """Top-k candidates per user via matching_adapter (cg_matching when installed), minus blocked pairs."""
    p = params()
    cands = matching_adapter.candidates(export, matching_adapter.build_vectors(export, p), p)
    blocked = {u["userId"]: set(u["blockedIds"]) for u in export["users"]}
    return {a: [(b, c) for b, c in lst if b not in blocked[a] and a not in blocked.get(b, ())][:k]
            for a, lst in cands.items()}


def meet_again_pairs(cands: dict[str, list[tuple[str, float]]]) -> list[tuple[str, str]]:
    return sorted({tuple(sorted((a, b))) for a, lst in cands.items() for b, _ in lst})


def build_tables(export: dict, activity: dict[str, list[dict]], client: laya.LayaClient):
    q = laya.questions()
    users = {u["userId"]: u for u in sorted(export["users"], key=lambda u: u["userId"])}
    types = q["activityTypes"]

    act_keys = [(uid, t) for uid in users for t in types]
    states = [laya.render_state("join_activity", users={"A": users[uid]}, activities={"A": activity.get(uid, [])},
                                activityType=t) for uid, t in act_keys]
    # join_activity and show_up have the same state template, so one call answers both.
    assert q["questions"]["join_activity"]["state"] == q["questions"]["show_up"]["state"]
    answers = client.ask_many([(s, ["join_activity", "show_up"]) for s in states])
    act_rows = [{"user_id": u, "activity_type": t, "p_join": a["join_activity"], "p_show": a["show_up"]}
                for (u, t), a in zip(act_keys, answers)]

    pairs = meet_again_pairs(candidates(export, params()["sim"]["candidatesPerUser"]))
    states = [laya.render_state("meet_again", users={"A": users[a], "B": users[b]},
                                activities={"A": activity.get(a, []), "B": activity.get(b, [])}) for a, b in pairs]
    answers = client.ask_many([(s, ["meet_again"]) for s in states])
    meet_rows = [{"user_a": a, "user_b": b, "p_meet_again": ans["meet_again"]} for (a, b), ans in zip(pairs, answers)]
    return act_rows, meet_rows


def write_tables(out: Path, pool_id: str, export: dict, act_rows: list[dict], meet_rows: list[dict],
                 model: str) -> dict:
    import pyarrow as pa
    import pyarrow.parquet as pq

    out.mkdir(parents=True, exist_ok=True)
    act_schema = pa.schema([("user_id", pa.string()), ("activity_type", pa.string()),
                            ("p_join", pa.float64()), ("p_show", pa.float64())])
    meet_schema = pa.schema([("user_a", pa.string()), ("user_b", pa.string()), ("p_meet_again", pa.float64())])
    # Fixed metadata-free writes so reruns are byte-identical.
    for name, rows, schema in (("activity.parquet", act_rows, act_schema), ("meet_again.parquet", meet_rows, meet_schema)):
        pq.write_table(pa.Table.from_pylist(rows, schema=schema), out / name, compression="zstd",
                       store_schema=False)
    manifest = {
        "poolId": pool_id,
        "questionsVersion": laya.questions_version(),
        "layaModel": model,
        # Tables are deterministic per export, so createdAt is pinned to the export instant.
        "createdAt": export["generatedAt"],
        "rows": {"activity": len(act_rows), "meet_again": len(meet_rows)},
        "exportGeneratedAt": export["generatedAt"],
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def reload_backend(pool_id: str) -> None:
    import httpx

    try:
        httpx.post(f"{internal_url()}/internal/v1/laya-tables/reload", json={"poolId": pool_id}, timeout=10).raise_for_status()
        print(f"[{pool_id}] backend reloaded tables")
    except httpx.HTTPError as e:
        print(f"[{pool_id}] backend reload skipped ({type(e).__name__}); backend reads tables at start", file=sys.stderr)


def run(pool_id: str, fake: bool, use_ground_truth: bool, out: Path | None = None, reload: bool = True) -> dict:
    export = load_export(pool_id, use_ground_truth)
    if export["questionsVersion"] != laya.questions_version():
        print(f"[{pool_id}] export questionsVersion {export['questionsVersion']} != {laya.questions_version()}",
              file=sys.stderr)
    client = laya.LayaClient(fake=fake)
    act_rows, meet_rows = build_tables(export, load_activity(pool_id), client)
    default = data_dir() / ("sim/laya_gt" if use_ground_truth else "laya_tables") / pool_id
    manifest = write_tables(out or default, pool_id, export, act_rows, meet_rows,
                            "fake" if fake else client.model)
    print(f"[{pool_id}] {manifest['rows']} questionsVersion {manifest['questionsVersion']}")
    if reload and not use_ground_truth:
        reload_backend(pool_id)
    return manifest


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="cg-sim precompute")
    ap.add_argument("--pool", choices=pool_ids(), help="default: every pool")
    ap.add_argument("--fake-laya", action="store_true", help="contract hash rule instead of LAYA_URL")
    ap.add_argument("--use-ground-truth", action="store_true", help="build the export from data/sim_private")
    ap.add_argument("--out", type=Path, help="output dir (single pool only); default data/laya_tables/<pool>, data/sim/laya_gt/<pool> with --use-ground-truth")
    ap.add_argument("--no-reload", action="store_true", help="skip POST /internal/v1/laya-tables/reload")
    a = ap.parse_args(argv)
    fake = a.fake_laya or os.environ.get("LAYA_FAKE") == "1"
    for pid in [a.pool] if a.pool else pool_ids():
        run(pid, fake, a.use_ground_truth, a.out if a.pool else None, not a.no_reload)
    return 0
