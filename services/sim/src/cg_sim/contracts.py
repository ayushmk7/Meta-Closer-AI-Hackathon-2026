"""Paths and read-only access to contracts/ (CONTRACTS §12: CG_DATA_DIR, CG_CONTRACTS_DIR)."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import cache
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[4]


def contracts_dir() -> Path:
    return Path(os.environ.get("CG_CONTRACTS_DIR") or REPO_ROOT / "contracts").resolve()


def data_dir() -> Path:
    return Path(os.environ.get("CG_DATA_DIR") or REPO_ROOT / "data").resolve()


def clone_dir() -> Path:
    return REPO_ROOT / "facebook-clone"


@cache
def load_yaml(name: str) -> dict:
    return yaml.safe_load((contracts_dir() / name).read_text())


def params() -> dict:
    return load_yaml("params.yaml")


def modes() -> dict:
    return load_yaml("modes.yaml")


def pool_def(pool_id: str) -> dict:
    for pool in modes()["pools"]:
        if pool["poolId"] == pool_id:
            return pool
    raise KeyError(f"unknown pool {pool_id}; pools are listed in contracts/modes.yaml")


def pool_ids() -> list[str]:
    return [p["poolId"] for p in modes()["pools"]]


@dataclass(frozen=True)
class Leaf:
    id: str
    label: str
    sensitive: bool

    @property
    def level2(self) -> str:
        return self.id.rsplit(".", 1)[0]


@cache
def taxonomy() -> tuple[int, dict[str, Leaf], dict[str, str]]:
    """Returns (version, leaves by id, labels for every node id)."""
    doc = load_yaml("taxonomy.yaml")
    leaves: dict[str, Leaf] = {}
    labels: dict[str, str] = {}
    for top, node in doc["tree"].items():
        labels[top] = node["label"]
        top_sensitive = bool(node.get("sensitive"))
        for mid, child in node["children"].items():
            mid_id = f"{top}.{mid}"
            labels[mid_id] = child["label"]
            mid_sensitive = top_sensitive or bool(child.get("sensitive"))
            for leaf, label in child["children"].items():
                leaf_id = f"{mid_id}.{leaf}"
                labels[leaf_id] = label
                leaves[leaf_id] = Leaf(leaf_id, label, mid_sensitive)
    return doc["version"], leaves, labels


@cache
def schemas() -> dict[str, dict]:
    return {p.name: json.loads(p.read_text()) for p in (contracts_dir() / "schemas").glob("*.schema.json")}
