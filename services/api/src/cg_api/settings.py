"""Env vars (CONTRACTS §12) and contract files loaded once at startup."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[4]


def _env(name: str, default: str) -> str:
    return os.environ.get(name) or default


@dataclass(frozen=True)
class Settings:
    demo_mode: bool = field(default_factory=lambda: _env("DEMO_MODE", "1") == "1")
    muse_fake: bool = field(default_factory=lambda: _env("MUSE_FAKE", "0") == "1")
    laya_fake: bool = field(default_factory=lambda: _env("LAYA_FAKE", "0") == "1")
    model_api_key: str = field(default_factory=lambda: _env("MODEL_API_KEY", ""), repr=False)
    muse_base_url: str = field(default_factory=lambda: _env("MUSE_BASE_URL", "https://api.meta.ai/v1"))
    muse_model: str = field(default_factory=lambda: _env("MUSE_MODEL", "muse-spark-1.3"))
    laya_url: str = field(default_factory=lambda: _env("LAYA_URL", "http://127.0.0.1:8090"))
    laya_model: str = field(default_factory=lambda: _env("LAYA_MODEL", "laya"))
    api_host: str = field(default_factory=lambda: _env("CG_API_HOST", "0.0.0.0"))
    api_port: int = field(default_factory=lambda: int(_env("CG_API_PORT", "8000")))
    internal_host: str = field(default_factory=lambda: _env("CG_INTERNAL_HOST", "127.0.0.1"))
    internal_port: int = field(default_factory=lambda: int(_env("CG_INTERNAL_PORT", "9001")))
    database_url: str = field(default_factory=lambda: _env("DATABASE_URL", ""), repr=False)
    data_dir: Path = field(default_factory=lambda: Path(_env("CG_DATA_DIR", str(REPO / "data"))))
    contracts_dir: Path = field(default_factory=lambda: Path(_env("CG_CONTRACTS_DIR", str(REPO / "contracts"))))

    def contract(self, name: str) -> dict:
        return _load_yaml(self.contracts_dir / name)

    @property
    def params(self) -> dict:
        return self.contract("params.yaml")


@cache
def _load_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text())


@cache
def get_settings() -> Settings:
    return Settings()
