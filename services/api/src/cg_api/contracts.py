"""The two OpenAPI files as data: operations, $ref resolution, response validation and example synthesis.

Used by the app factory (spec-example fallthrough) and the contract tests.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import cache
from urllib.parse import urljoin

import jsonschema
import yaml
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from cg_api.settings import get_settings

PUBLIC, INTERNAL = "openapi.yaml", "openapi.internal.yaml"
_METHODS = ("get", "post", "put", "patch", "delete")
_BASE = "file:///contracts/"


@dataclass(frozen=True)
class Operation:
    spec: str
    method: str
    path: str
    operation_id: str
    op: dict

    @property
    def success(self) -> tuple[int, dict]:
        """First 2xx/101 response (status, response object)."""
        for code, resp in self.op["responses"].items():
            if str(code)[0] in "12":
                return int(code), resp
        raise KeyError(self.operation_id)

    @property
    def public_needs_user(self) -> bool:
        return self.spec == PUBLIC and self.op.get("security", [{"demoUser": []}]) != []


@cache
def registry() -> Registry:
    d = get_settings().contracts_dir
    resources = [(_BASE + name, yaml.safe_load((d / name).read_text())) for name in (PUBLIC, INTERNAL)]
    resources += [(_BASE + f"schemas/{p.name}", json.loads(p.read_text())) for p in (d / "schemas").glob("*.json")]
    reg = Registry()
    for uri, doc in resources:
        reg = reg.with_resource(uri, Resource.from_contents(doc, default_specification=DRAFT202012))
    return reg.crawl()


def doc(spec: str) -> dict:
    return registry().contents(_BASE + spec)


@cache
def operations(spec: str) -> tuple[Operation, ...]:
    out = []
    for path, item in doc(spec)["paths"].items():
        for method in _METHODS:
            if method in item:
                out.append(Operation(spec, method, path, item[method]["operationId"], item[method]))
    return tuple(out)


def op_by_id(operation_id: str) -> Operation:
    return next(o for s in (PUBLIC, INTERNAL) for o in operations(s) if o.operation_id == operation_id)


def _deref(node: dict, base: str) -> tuple[dict, str]:
    """Follow $ref chains; returns (schema, base uri for nested refs)."""
    while isinstance(node, dict) and "$ref" in node:
        resolved = registry().resolver(base).lookup(node["$ref"])
        node, base = resolved.contents, _base_of(resolved.resolver, base)
    return node, base


def _base_of(resolver, fallback: str) -> str:
    return str(getattr(resolver, "_base_uri", "") or fallback)


def response_schema(op: Operation, status: int | None = None) -> tuple[dict | None, str]:
    """(JSON schema, base uri) of a response, or (None, base) when it has no body."""
    status = status or op.success[0]
    base = _BASE + op.spec
    resp = op.op["responses"].get(str(status)) or op.op["responses"].get("default")
    resp, base = _deref(resp, base)
    content = (resp or {}).get("content", {}).get("application/json")
    return (content.get("schema"), base) if content else (None, base)


def validate(op: Operation, status: int, body) -> None:
    """Raise jsonschema.ValidationError unless body matches the spec response for status."""
    schema, base = response_schema(op, status)
    if schema is None:
        assert body in (None, b"", ""), f"{op.operation_id} {status} must have no body"
        return
    v = jsonschema.Draft202012Validator(
        _absolute(schema, base), registry=registry(), format_checker=jsonschema.FormatChecker()
    )
    v.validate(body)


def _absolute(node, base: str):
    """Copy of an inline schema with every $ref made absolute, so it validates outside its document."""
    if isinstance(node, dict):
        return {k: urljoin(base, v) if k == "$ref" else _absolute(v, base) for k, v in node.items()}
    if isinstance(node, list):
        return [_absolute(v, base) for v in node]
    return node


def example(op: Operation):
    """The spec's inline 2xx example, else one synthesised from the schema. None for bodiless responses."""
    _, resp = op.success
    resp, base = _deref(resp, _BASE + op.spec)
    content = (resp or {}).get("content", {}).get("application/json")
    if not content:
        return None
    if "example" in content:
        return content["example"]
    if content.get("examples"):
        return next(iter(content["examples"].values()))["value"]
    return synth(content["schema"], base)


# ---------- example synthesis (for the operations without an inline example) ----------
_PATTERN_SAMPLES = ["u_maya", "pool_sf_city", "vn_hayes_clay", "pl_sf_hero_wheel", "cr_0001",
                    "outdoors.hiking", "10:00", "USD", "coffee"]  # fmt: skip
_SAMPLE_TIME = "2026-11-14T18:00:00Z"


def synth(schema, base: str, depth: int = 0):
    schema, base = _deref(schema, base)
    if not isinstance(schema, dict) or depth > 12:
        return None
    if "example" in schema:
        return schema["example"]
    if schema.get("examples"):
        return schema["examples"][0]
    if "const" in schema:
        return schema["const"]
    if "enum" in schema:
        return schema["enum"][0]
    if "allOf" in schema:
        merged: dict = {}
        for part in schema["allOf"]:
            v = synth(part, base, depth + 1)
            if isinstance(v, dict):
                merged.update(v)
        rest = {k: v for k, v in schema.items() if k != "allOf"}
        if rest.get("properties"):
            merged.update(synth({**rest, "type": "object"}, base, depth + 1))
        return merged
    for key in ("oneOf", "anyOf"):
        if key in schema:
            options = [s for s in schema[key] if s.get("type") != "null"] or schema[key]
            return synth(options[0], base, depth + 1)
    typ = schema.get("type")
    if isinstance(typ, list):
        typ = next((t for t in typ if t != "null"), "null")
    if typ is None:
        typ = "object" if "properties" in schema else "string"
    if typ == "object":
        props = schema.get("properties", {})
        # ponytail: required fields only, plus all props when nothing is required (keeps examples small but valid).
        keys = schema.get("required") or list(props)
        return {k: synth(props.get(k, {"type": "string"}), base, depth + 1) for k in keys}
    if typ == "array":
        n = max(1, schema.get("minItems", 0))
        return [synth(schema.get("items", {"type": "string"}), base, depth + 1) for _ in range(n)]
    if typ in ("integer", "number"):
        lo = schema.get("minimum", 1 if schema.get("maximum", 2) >= 1 else 0)
        return int(lo) if typ == "integer" else float(lo)
    if typ == "boolean":
        return False
    if typ == "null":
        return None
    if schema.get("format") == "date-time":
        return _SAMPLE_TIME
    if schema.get("format") == "uri":
        return "http://localhost:8000/static/example"
    if pat := schema.get("pattern"):
        return next((s for s in _PATTERN_SAMPLES if re.search(pat, s)), "x")
    return "x" * max(1, schema.get("minLength", 1))
