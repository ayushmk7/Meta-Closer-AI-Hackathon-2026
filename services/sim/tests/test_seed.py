import filecmp
import json
import shutil

import pytest

from cg_sim import maya
from cg_sim.check import check_pool
from cg_sim.contracts import params, pool_ids
from cg_sim.seed import generate

SEED = params()["matching"]["rngSeedDefault"]


@pytest.fixture(scope="module")
def regenerated(tmp_path_factory):
    root = tmp_path_factory.mktemp("data")
    for pool_id in pool_ids():
        generate(pool_id, SEED, root)
    return root


def _tree(root):
    return sorted(p.relative_to(root) for p in root.rglob("*") if p.is_file())


@pytest.mark.parametrize("pool_id", pool_ids())
def test_committed_seed_passes_check(committed, pool_id):
    assert check_pool(committed, pool_id) == []


@pytest.mark.parametrize("sub", ["seed", "sim_private"])
def test_committed_seed_is_reproducible(committed, regenerated, sub):
    """Same seed, same bytes; the committed files are exactly what the generator writes."""
    a, b = committed / sub, regenerated / sub
    assert _tree(a) == _tree(b)
    _, mismatch, errors = filecmp.cmpfiles(a, b, [str(p) for p in _tree(a)], shallow=False)
    assert mismatch == [] and errors == []


def test_two_runs_identical(tmp_path):
    for run in ("one", "two"):
        generate("pool_evt_closer_together", SEED, tmp_path / run)
    files = _tree(tmp_path / "one")
    assert files == _tree(tmp_path / "two")
    for f in files:
        assert (tmp_path / "one" / f).read_bytes() == (tmp_path / "two" / f).read_bytes()


def test_other_seed_differs_and_still_passes(committed, tmp_path):
    generate("pool_evt_closer_together", SEED + 1, tmp_path)
    assert check_pool(tmp_path, "pool_evt_closer_together") == []
    name = "seed/pool_evt_closer_together/personas.jsonl"
    assert (tmp_path / name).read_bytes() != (committed / name).read_bytes()


def test_maya_activity_is_verbatim_from_clone():
    clone = maya.clone_seed_text()
    for _, _, text, _ in maya.POSTS:
        for line in text.split("\n"):
            assert line in clone
    for _, _, text in maya.COMMENTS:
        assert text in clone
    for _, name in maya.GROUPS + maya.EVENTS:
        assert name in clone


def test_clone_names_parsed():
    names = maya.clone_people_names()
    assert "Maya Chen" in names and "Amina Rahman" in names and len(names) >= 10


def _copy(committed, tmp_path, pool_id):
    for sub in ("seed", "sim_private"):
        shutil.copytree(committed / sub / pool_id, tmp_path / sub / pool_id)
    return tmp_path


def test_check_catches_private_leak(committed, tmp_path):
    root = _copy(committed, tmp_path, "pool_sf_city")
    latent = json.loads((root / "sim_private/pool_sf_city/latent.jsonl").read_text().splitlines()[5])
    path = root / "seed/pool_sf_city/activity.jsonl"
    row = json.loads(path.read_text().splitlines()[0])
    row["text"] = f"score {latent['flakiness']} and outdoors.hiking.coastal_hikes"
    path.write_text(path.read_text() + json.dumps(row) + "\n")
    errors = check_pool(root, "pool_sf_city")
    assert any("hidden trait value" in e for e in errors)
    assert any("taxonomy IDs" in e for e in errors)


def test_check_catches_bad_demo(committed, tmp_path):
    root = _copy(committed, tmp_path, "pool_sf_city")
    path = root / "seed/pool_sf_city/demo.json"
    demo = json.loads(path.read_text())
    demo["publicFeaturedId"] = demo["privateFeaturedId"]
    demo["counterpartIds"] = demo["counterpartIds"][1:]
    path.write_text(json.dumps(demo))
    errors = check_pool(root, "pool_sf_city")
    assert any("not public" in e for e in errors)
    assert any("counterpartIds" in e for e in errors)
    assert any("liveUserId" in e for e in errors)


def test_check_catches_schema_violation(committed, tmp_path):
    root = _copy(committed, tmp_path, "pool_evt_closer_together")
    path = root / "seed/pool_evt_closer_together/personas.jsonl"
    row = json.loads(path.read_text().splitlines()[0])
    row["outgoingness"] = 0.5
    path.write_text(path.read_text() + json.dumps(row) + "\n")
    assert any("Additional properties" in e for e in check_pool(root, "pool_evt_closer_together"))
