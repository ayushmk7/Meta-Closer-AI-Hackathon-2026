#!/usr/bin/env python3
"""Fail if a branch changes files outside its agent's paths (docs/common-ground/AGENT_RULES.md R1).

Usage: python scripts/check_ownership.py [--branch NAME] [--base REF]
Defaults: branch from GITHUB_HEAD_REF or the current git branch; base origin/main.
"""
from __future__ import annotations

import argparse
import fnmatch
import os
import subprocess
import sys

IOS = [
    "facebook-clone/src/features/common-ground/*",
    "facebook-clone/src/app/common-ground/*",
    "facebook-clone/assets/common-ground/*",
    "facebook-clone/tests/common-ground/*",
]
OWNERS: dict[str, dict[str, list[str]]] = {
    "cg/ios/": {"allow": IOS, "deny": []},
    "cg/backend/": {"allow": ["services/api/*", "packages/matching/*"], "deny": []},
    "cg/sim/": {"allow": ["services/sim/*", "services/dashboard/*", "data/*"], "deny": []},
    "cg/shell/": {"allow": ["facebook-clone/*"], "deny": IOS},
    "cg/contracts/": {
        "allow": [
            "contracts/*",
            "docs/common-ground/*",
            "scripts/*",
            ".github/*",
            "README.md",
            "HUMAN_TODO.md",
            "Makefile",
            ".env.example",
            ".gitignore",
        ],
        "deny": [],
    },
}


def match(path: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatch(path, pattern) for pattern in patterns)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--branch", default=os.environ.get("GITHUB_HEAD_REF") or None)
    parser.add_argument("--base", default="origin/main")
    args = parser.parse_args()
    branch = args.branch or git("rev-parse", "--abbrev-ref", "HEAD")

    prefix = next((p for p in OWNERS if branch.startswith(p)), None)
    if prefix is None:
        print(f"Branch '{branch}' has no agent prefix ({', '.join(OWNERS)}); skipping ownership check.")
        return 0

    changed = [line for line in git("diff", "--name-only", f"{args.base}...HEAD").splitlines() if line]
    rules = OWNERS[prefix]
    violations = [
        path for path in changed if not match(path, rules["allow"]) or match(path, rules["deny"])
    ]
    if violations:
        print(f"Branch '{branch}' ({prefix}) changed files outside its ownership:")
        for path in violations:
            print(f"  {path}")
        print("See docs/common-ground/AGENT_RULES.md R1 and R9.")
        return 1
    print(f"Ownership OK: {len(changed)} file(s) within {prefix} paths.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
