"""cg-sim seed [--pool ID] [--seed N] [--check] [--fake-muse]"""

from __future__ import annotations

import argparse
import subprocess
import sys

from cg_sim.contracts import REPO_ROOT, data_dir, params, pool_ids


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="cg-sim seed")
    ap.add_argument("--pool", help="pool ID from contracts/modes.yaml (default: every pool)")
    ap.add_argument("--seed", type=int, help="RNG seed (default params.matching.rngSeedDefault)")
    ap.add_argument("--check", action="store_true", help="only validate the committed seed")
    ap.add_argument("--fake-muse", action="store_true", help="templated text (the only writer in M0)")
    args = ap.parse_args(argv)

    from cg_sim.seed.check import check_pool

    pools = [args.pool] if args.pool else pool_ids()
    if not args.check:
        from cg_sim.seed.generate import generate

        seed = args.seed if args.seed is not None else params()["matching"]["rngSeedDefault"]
        for pool_id in pools:
            s = generate(pool_id, seed)
            print(f"wrote {pool_id} (seed {seed}): " + ", ".join(f"{v} {k}" for k, v in s.items() if k != "poolId"))
    errors = [e for pool_id in pools for e in check_pool(data_dir(), pool_id)]
    for e in errors:
        print(e, file=sys.stderr)
    if not errors and args.check:
        script = REPO_ROOT / "scripts" / "validate_contracts.py"
        if script.exists():
            r = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
            if r.returncode:
                errors.append("validate_contracts.py failed")
                print(r.stdout + r.stderr, file=sys.stderr)
    print("seed check OK" if not errors else f"seed check FAILED: {len(errors)} problem(s)")
    return 1 if errors else 0
