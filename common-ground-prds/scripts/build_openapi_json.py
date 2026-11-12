#!/usr/bin/env python3
"""Regenerate contracts/openapi.json from contracts/openapi.yaml. --check fails if it is stale."""
from __future__ import annotations

import json
import pathlib
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "contracts" / "openapi.yaml"
TARGET = ROOT / "contracts" / "openapi.json"


def render() -> str:
    return json.dumps(yaml.safe_load(SOURCE.read_text()), indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    content = render()
    if "--check" in sys.argv:
        if not TARGET.exists() or TARGET.read_text() != content:
            print("contracts/openapi.json is stale. Run: python scripts/build_openapi_json.py")
            return 1
        print("contracts/openapi.json is in sync.")
        return 0
    TARGET.write_text(content)
    print(f"Wrote {TARGET.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
