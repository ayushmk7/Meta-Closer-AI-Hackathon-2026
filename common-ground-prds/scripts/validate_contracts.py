#!/usr/bin/env python3
"""Sanity checks for contracts/: YAML parses, taxonomy IDs are valid and unique, JSON schemas load,
and any committed seed files validate against their schemas."""
from __future__ import annotations

import json
import pathlib
import re
import sys

import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTRACTS = ROOT / "contracts"
ID_PATTERN = re.compile(r"^[a-z0-9_]+(\.[a-z0-9_]+){0,2}$")
SEED_FILES = {
    "pool.json": "pool.schema.json",
    "personas.jsonl": "persona.schema.json",
    "activity.jsonl": "activity.schema.json",
    "onboarding.jsonl": "onboarding_transcript.schema.json",
    "demo.json": "demo.schema.json",
}


def taxonomy_ids() -> list[str]:
    tree = yaml.safe_load((CONTRACTS / "taxonomy.yaml").read_text())["tree"]
    ids: list[str] = []
    for top, node in tree.items():
        ids.append(top)
        for mid, child in node["children"].items():
            ids.append(f"{top}.{mid}")
            for leaf in child["children"]:
                ids.append(f"{top}.{mid}.{leaf}")
    return ids


def main() -> int:
    errors: list[str] = []
    for name in ["params.yaml", "modes.yaml", "taxonomy.yaml", "laya_questions.yaml", "openapi.yaml", "openapi.internal.yaml"]:
        try:
            yaml.safe_load((CONTRACTS / name).read_text())
        except yaml.YAMLError as exc:
            errors.append(f"{name}: {exc}")

    ids = taxonomy_ids()
    errors += [f"taxonomy: bad id {i}" for i in ids if not ID_PATTERN.match(i)]
    if len(ids) != len(set(ids)):
        errors.append("taxonomy: duplicate ids")

    registry = Registry()
    schemas = {}
    for path in (CONTRACTS / "schemas").glob("*.schema.json"):
        schema = json.loads(path.read_text())
        Draft202012Validator.check_schema(schema)
        schemas[path.name] = schema
        registry = registry.with_resource(path.name, Resource.from_contents(schema))

    for pool_dir in sorted((ROOT / "data" / "seed").glob("pool_*")):
        for file_name, schema_name in SEED_FILES.items():
            path = pool_dir / file_name
            if not path.exists():
                continue
            validator = Draft202012Validator(schemas[schema_name], registry=registry)
            lines = path.read_text().splitlines() if path.suffix == ".jsonl" else [path.read_text()]
            for number, line in enumerate(lines, 1):
                if not line.strip():
                    continue
                for error in validator.iter_errors(json.loads(line)):
                    errors.append(f"{path.relative_to(ROOT)}:{number}: {error.message}")

    golden = json.loads((CONTRACTS / "laya_golden.json").read_text())
    if golden.get("questionsVersion") != yaml.safe_load((CONTRACTS / "laya_questions.yaml").read_text())["questionsVersion"]:
        errors.append("laya_golden.json questionsVersion does not match laya_questions.yaml")

    for error in errors:
        print(error)
    print("contracts OK" if not errors else f"{len(errors)} problem(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
