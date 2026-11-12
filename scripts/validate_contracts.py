#!/usr/bin/env python3
"""Sanity checks for contracts/: YAML parses, taxonomy IDs are valid and unique, JSON schemas load,
every openapi.yaml example validates against its schema, params/config/connectors agree, and any
committed seed files validate against their schemas and reference known activity types, providers and IDs."""
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
    "connectors.jsonl": "connector_record.schema.json",
    "venues.jsonl": "venue.schema.json",
    "plans.jsonl": "plan.schema.json",
    "demo.json": "demo.schema.json",
}
YAML_FILES = [
    "params.yaml",
    "modes.yaml",
    "connectors.yaml",
    "taxonomy.yaml",
    "laya_questions.yaml",
    "openapi.yaml",
    "openapi.internal.yaml",
]


def load(name: str):
    return yaml.safe_load((CONTRACTS / name).read_text())


def taxonomy_ids() -> list[str]:
    tree = load("taxonomy.yaml")["tree"]
    ids: list[str] = []
    for top, node in tree.items():
        ids.append(top)
        for mid, child in node["children"].items():
            ids.append(f"{top}.{mid}")
            for leaf in child["children"]:
                ids.append(f"{top}.{mid}.{leaf}")
    return ids


def check_openapi_examples(errors: list[str]) -> None:
    """Every 2xx response example in openapi.yaml must validate against its response schema."""
    doc = load("openapi.yaml")
    checked = 0
    for path, methods in doc["paths"].items():
        for method, op in methods.items():
            if not isinstance(op, dict) or "responses" not in op:
                continue
            for code, response in op["responses"].items():
                if not str(code).startswith("2"):
                    continue
                media = (response.get("content") or {}).get("application/json") or {}
                if "example" not in media or "schema" not in media:
                    continue
                root = {"components": doc["components"], **media["schema"]}
                validator = Draft202012Validator(root)
                for error in validator.iter_errors(media["example"]):
                    where = "/".join(str(p) for p in error.absolute_path)
                    errors.append(f"openapi.yaml {op.get('operationId')} example at '{where}': {error.message}")
                checked += 1
    if checked < 15:
        errors.append(f"openapi.yaml: only {checked} examples checked; expected at least 15")


def check_cross_file(errors: list[str]) -> None:
    params = load("params.yaml")
    doc = load("openapi.yaml")
    config = doc["components"]["schemas"]["Config"]["properties"]
    feature_props = set(config["features"]["properties"])
    for key in params["features"]:
        if key not in feature_props:
            errors.append(f"params.features.{key} is not declared in openapi Config.features")
    for key in feature_props:
        if key not in params["features"]:
            errors.append(f"openapi Config.features.{key} has no value in params.features")

    questions = load("laya_questions.yaml")
    if questions["questionsVersion"] != params["laya"]["questionsVersion"]:
        errors.append("params.laya.questionsVersion does not match laya_questions.yaml")
    golden = json.loads((CONTRACTS / "laya_golden.json").read_text())
    if golden.get("questionsVersion") != questions["questionsVersion"]:
        errors.append("laya_golden.json questionsVersion does not match laya_questions.yaml")
    for case in golden["cases"]:
        question = case.get("question")
        if question and question not in questions["questions"]:
            errors.append(f"laya_golden.json case {case['name']} uses unknown question {question}")

    connectors = load("connectors.yaml")
    for key, provider in connectors["providers"].items():
        if not re.match(r"^[a-z0-9_]+$", key):
            errors.append(f"connectors.yaml: bad provider key {key}")
        for field in ("label", "reads", "recordKinds", "signalKinds", "simulated", "status"):
            if field not in provider:
                errors.append(f"connectors.yaml {key}: missing {field}")
        for kind in provider.get("signalKinds", []):
            if kind not in connectors["signalKinds"]:
                errors.append(f"connectors.yaml {key}: unknown signal kind {kind}")
    signal_enum = set(doc["components"]["schemas"]["Signal"]["properties"]["kind"]["enum"])
    for kind in connectors["signalKinds"]:
        if kind not in signal_enum:
            errors.append(f"connectors.yaml signal kind {kind} missing from openapi Signal.kind")


def check_seed(errors: list[str], schemas: dict, registry: Registry) -> None:
    activity_types = set(load("laya_questions.yaml")["activityTypes"])
    providers = set(load("connectors.yaml")["providers"])
    for pool_dir in sorted((ROOT / "data" / "seed").glob("pool_*")):
        rows: dict[str, list[dict]] = {}
        for file_name, schema_name in SEED_FILES.items():
            path = pool_dir / file_name
            if not path.exists():
                continue
            validator = Draft202012Validator(schemas[schema_name], registry=registry)
            lines = path.read_text().splitlines() if path.suffix == ".jsonl" else [path.read_text()]
            rows[file_name] = []
            for number, line in enumerate(lines, 1):
                if not line.strip():
                    continue
                item = json.loads(line)
                rows[file_name].append(item)
                for error in validator.iter_errors(item):
                    errors.append(f"{path.relative_to(ROOT)}:{number}: {error.message}")
        rel = pool_dir.relative_to(ROOT)
        for venue in rows.get("venues.jsonl", []):
            for t in venue.get("activityTypes", []):
                if t not in activity_types:
                    errors.append(f"{rel}/venues.jsonl {venue['venueId']}: unknown activity type {t}")
        venue_ids = {v["venueId"] for v in rows.get("venues.jsonl", [])}
        for plan in rows.get("plans.jsonl", []):
            if plan["activityType"] not in activity_types:
                errors.append(f"{rel}/plans.jsonl {plan['planId']}: unknown activity type {plan['activityType']}")
            if venue_ids and plan["venueId"] not in venue_ids:
                errors.append(f"{rel}/plans.jsonl {plan['planId']}: unknown venue {plan['venueId']}")
        for record in rows.get("connectors.jsonl", []):
            if record["provider"] not in providers:
                errors.append(f"{rel}/connectors.jsonl {record['recordId']}: unknown provider {record['provider']}")
        for persona in rows.get("personas.jsonl", []):
            for provider in persona.get("connectedProviders", []):
                if provider not in providers:
                    errors.append(f"{rel}/personas.jsonl {persona['userId']}: unknown provider {provider}")
        plan_ids = {p["planId"] for p in rows.get("plans.jsonl", [])}
        user_ids = {p["userId"] for p in rows.get("personas.jsonl", [])}
        for demo in rows.get("demo.json", []):
            for key in ("heroPlanId", "nudgePlanId", *demo.get("featuredPlanIds", [])):
                plan_id = demo.get(key, key)
                if plan_ids and plan_id not in plan_ids:
                    errors.append(f"{rel}/demo.json: unknown plan {plan_id}")
            for user_id in [demo["liveUserId"], *demo["counterpartIds"]]:
                if user_ids and user_id not in user_ids:
                    errors.append(f"{rel}/demo.json: unknown user {user_id}")
            if demo["liveUserId"] not in demo["counterpartIds"]:
                errors.append(f"{rel}/demo.json: liveUserId must be in counterpartIds")


def main() -> int:
    errors: list[str] = []
    for name in YAML_FILES:
        try:
            load(name)
        except yaml.YAMLError as exc:
            errors.append(f"{name}: {exc}")
    if errors:
        for error in errors:
            print(error)
        return 1

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

    check_openapi_examples(errors)
    check_cross_file(errors)
    check_seed(errors, schemas, registry)

    for error in errors:
        print(error)
    print("contracts OK" if not errors else f"{len(errors)} problem(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
