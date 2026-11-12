"""cg-sim command line (CONTRACTS §12): cg-sim <seed|eval|precompute|run|report> ...

Fixed dispatch: `cg-sim <cmd> ...` imports cg_sim.<module>.main lazily and calls main(argv) -> int.
Each slice owns its module and parses its own arguments.
"""

from __future__ import annotations

import importlib
import sys

COMMANDS = {
    "seed": "cg_sim.seed",
    "eval": "cg_sim.evalx",
    "precompute": "cg_sim.precompute",
    "run": "cg_sim.mc",
    "report": "cg_sim.report",
}


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] not in COMMANDS:
        print(f"usage: cg-sim <{'|'.join(COMMANDS)}> [args...]", file=sys.stderr)
        return 2
    module = importlib.import_module(COMMANDS[argv[0]])
    entry = getattr(module, "main", None)
    if entry is None:
        print(f"cg-sim {argv[0]}: not built yet", file=sys.stderr)
        return 2
    return entry(argv[1:]) or 0


if __name__ == "__main__":
    sys.exit(main())
