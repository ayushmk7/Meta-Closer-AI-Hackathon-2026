"""cg-sim command line (CONTRACTS §12): cg-sim <seed|eval|precompute|run|report> ..."""

from __future__ import annotations

import argparse
import sys

from cg_sim.contracts import data_dir, params, pool_ids


def _seed(args: argparse.Namespace) -> int:
    from cg_sim.check import check_pool
    from cg_sim.seed import generate

    pools = [args.pool] if args.pool else pool_ids()
    if not args.check:
        seed = args.seed if args.seed is not None else params()["matching"]["rngSeedDefault"]
        for pool_id in pools:
            summary = generate(pool_id, seed)
            print(
                f"wrote {pool_id}: {summary['people']} people, {summary['activity']} activity items (seed {seed})"
            )
    errors = [e for pool_id in pools for e in check_pool(data_dir(), pool_id)]
    for e in errors:
        print(e, file=sys.stderr)
    print("seed check OK" if not errors else f"seed check FAILED: {len(errors)} problem(s)")
    return 1 if errors else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cg-sim")
    sub = parser.add_subparsers(dest="command", required=True)
    seed = sub.add_parser("seed", help="generate data/seed/<poolId> and data/sim_private/<poolId>")
    seed.add_argument("--pool", help="pool ID from contracts/modes.yaml (default: every pool)")
    seed.add_argument("--seed", type=int, help="RNG seed (default params.matching.rngSeedDefault)")
    seed.add_argument("--check", action="store_true", help="only validate the committed seed")
    seed.add_argument(
        "--fake-muse", action="store_true", help="templated text instead of Muse (the only writer in seed v0)"
    )
    seed.set_defaults(func=_seed)
    for name in ("eval", "precompute", "run", "report"):
        sub.add_parser(name, help="not built yet (M1/M2)").set_defaults(
            func=lambda a, n=name: print(f"cg-sim {n}: not built yet", file=sys.stderr) or 2
        )
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
