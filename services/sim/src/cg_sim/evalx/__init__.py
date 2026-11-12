"""cg-sim eval: extraction and sensitive-gate eval of a pool export against ground truth (PRD-3 §4).

    cg-sim eval [--pool ID] [--use-ground-truth] [--run-id ID] [--out PATH]

Writes data/sim/runs/<runId>/extraction.json (all pools in one file) and prints a markdown table.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from cg_sim.contracts import data_dir, pool_ids
from cg_sim.matching_adapter import ACTIVITY_INTERESTS
from cg_sim.precompute import _jsonl, load_export


def _pr(pred: set, truth: set) -> dict:
    tp = len(pred & truth)
    return {
        "tp": tp, "predicted": len(pred), "actual": len(truth),
        "precision": round(tp / len(pred), 4) if pred else None,
        "recall": round(tp / len(truth), 4) if truth else None,
    }


def evaluate(export: dict, truth: list[dict]) -> dict:
    users = {u["userId"]: u for u in export["users"]}
    leaf_p, leaf_t, l2_p, l2_t = set(), set(), set(), set()
    sens_p, sens_t, place_p, place_t, freq_p, freq_t, rout_p, rout_t = (set() for _ in range(8))
    for t in truth:
        uid = t["userId"]
        u = users.get(uid, {"interests": [], "signals": []})
        for i in t["interests"]:
            leaf_t.add((uid, i["id"]))
            l2_t.add((uid, i["id"].rsplit(".", 1)[0]))
            if i["sensitive"]:
                sens_t.add((uid, i["id"]))
        for i in u["interests"]:
            leaf_p.add((uid, i["id"]))
            l2_p.add((uid, i["id"].rsplit(".", 1)[0]))
            if i["sensitive"]:
                sens_p.add((uid, i["id"]))
        if t.get("sensitivePlace"):
            place_t.add((uid, t["sensitivePlace"]))
        freq_t |= {(uid, v) for v in t.get("frequentPlaces", [])}
        for r in t.get("routines", []):
            rout_t.add((uid, r["activity"]))
        for s in u["signals"]:
            if s.get("venueId") and s["sensitive"]:
                place_p.add((uid, s["venueId"]))
            if s["kind"] == "frequent_place" and s.get("venueId"):
                freq_p.add((uid, s["venueId"]))
            if s["kind"] == "routine":
                l2 = {i.rsplit(".", 1)[0] for i in s["interestIds"]}
                rout_p |= {(uid, a) for a, targets in ACTIVITY_INTERESTS.items() if l2 & set(targets)}
    return {
        "users": len(truth),
        "interests_leaf": _pr(leaf_p, leaf_t),
        "interests_level2": _pr(l2_p, l2_t),
        "sensitive_interests": _pr(sens_p, sens_t),
        "sensitive_places": _pr(place_p, place_t),
        "frequent_places": _pr(freq_p, freq_t),
        # ponytail: a routine counts as found if any routine signal targets the activity's interests.
        "routines": {k: v for k, v in _pr(rout_p & rout_t, rout_t).items() if k not in ("precision", "predicted")},
    }


def table(results: dict) -> str:
    lines = ["| pool | metric | precision | recall | n |", "| --- | --- | --- | --- | --- |"]
    for pid, r in results.items():
        for k, v in r.items():
            if isinstance(v, dict):
                lines.append(f"| {pid} | {k} | {v.get('precision', '')} | {v['recall']} | {v['actual']} |")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="cg-sim eval")
    ap.add_argument("--pool", choices=pool_ids(), help="default: every pool")
    ap.add_argument("--use-ground-truth", action="store_true", help="build the export from data/sim_private")
    ap.add_argument("--run-id", default="eval-latest")
    ap.add_argument("--out", type=Path, help="default data/sim/runs/<runId>/extraction.json")
    a = ap.parse_args(argv)
    results = {}
    for pid in [a.pool] if a.pool else pool_ids():
        truth = _jsonl(data_dir() / "sim_private" / pid / "ground_truth.jsonl")
        results[pid] = evaluate(load_export(pid, a.use_ground_truth), truth)
    out = a.out or data_dir() / "sim" / "runs" / a.run_id / "extraction.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    doc = {"runId": a.run_id, "source": "ground_truth" if a.use_ground_truth else "backend_export", "pools": results}
    out.write_text(json.dumps(doc, indent=2) + "\n")
    print(table(results))
    print(f"wrote {out}", file=sys.stderr)
    return 0
