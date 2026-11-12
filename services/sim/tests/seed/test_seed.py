import filecmp
import json
import shutil

import pytest

from cg_sim.contracts import params, pool_ids, schemas
from cg_sim.seed import maya
from cg_sim.seed.check import check_pool
from cg_sim.seed.generate import generate

SEED = params()["matching"]["rngSeedDefault"]
CITY, EVENT = "pool_sf_city", "pool_evt_closer_together"


@pytest.fixture(scope="module")
def regenerated(tmp_path_factory):
    root = tmp_path_factory.mktemp("data")
    for pool_id in pool_ids():
        generate(pool_id, SEED, root)
    return root


def _tree(root):
    return sorted(p.relative_to(root) for p in root.rglob("*") if p.is_file())


def _copy(committed, tmp_path, pool_id):
    for sub in ("seed", "sim_private"):
        shutil.copytree(committed / sub / pool_id, tmp_path / sub / pool_id)
    return tmp_path


def _edit_jsonl(path, fn):
    rows = [json.loads(line) for line in path.read_text().splitlines()]
    fn(rows)
    path.write_text("".join(json.dumps(r) + "\n" for r in rows))


def _edit_json(path, fn):
    obj = json.loads(path.read_text())
    fn(obj)
    path.write_text(json.dumps(obj))


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
        generate(EVENT, SEED, tmp_path / run)
    files = _tree(tmp_path / "one")
    assert files == _tree(tmp_path / "two")
    for f in files:
        assert (tmp_path / "one" / f).read_bytes() == (tmp_path / "two" / f).read_bytes()


def test_other_seed_differs_and_still_passes(committed, tmp_path):
    generate(EVENT, SEED + 1, tmp_path)
    assert check_pool(tmp_path, EVENT) == []
    name = f"seed/{EVENT}/personas.jsonl"
    assert (tmp_path / name).read_bytes() != (committed / name).read_bytes()


def test_ground_truth_export_matches_schema(committed):
    from jsonschema import Draft202012Validator
    from referencing import Registry, Resource

    from cg_sim.seed.generate import REF_TIME, ground_truth_export  # noqa: F401

    seed_dir = committed / "seed" / CITY
    load = lambda f: [json.loads(x) for x in (seed_dir / f).read_text().splitlines()]  # noqa: E731
    truth = [json.loads(x) for x in (committed / "sim_private" / CITY / "ground_truth.jsonl").read_text().splitlines()]
    export = ground_truth_export(CITY, load("personas.jsonl"), truth, load("connectors.jsonl"))
    reg = Registry()
    for n, s in schemas().items():
        reg = reg.with_resource(n, Resource.from_contents(s))
    assert list(Draft202012Validator(schemas()["pool_export.schema.json"], registry=reg).iter_errors(export)) == []


def test_maya_activity_is_verbatim_from_clone():
    clone = maya.clone_seed_text()
    for _, _, text, _ in maya.POSTS:
        for line in text.split("\n"):
            assert line in clone
    for _, _, text in maya.COMMENTS:
        assert text in clone
    for _, name in maya.GROUPS + maya.EVENTS:
        assert name in clone


def test_check_catches_private_leak(committed, tmp_path):
    root = _copy(committed, tmp_path, CITY)
    latent = json.loads((root / f"sim_private/{CITY}/latent.jsonl").read_text().splitlines()[5])
    path = root / f"seed/{CITY}/activity.jsonl"
    row = json.loads(path.read_text().splitlines()[0])
    row["text"] = f"score {latent['flakiness']} and outdoors.hiking.coastal_hikes"
    path.write_text(path.read_text() + json.dumps(row) + "\n")
    errors = check_pool(root, CITY)
    assert any("hidden trait value" in e for e in errors)
    assert any("taxonomy IDs" in e for e in errors)


def test_check_catches_bad_demo(committed, tmp_path):
    root = _copy(committed, tmp_path, CITY)
    seed_dir = root / "seed" / CITY
    demo = json.loads((seed_dir / "demo.json").read_text())
    hero_id, nudge_id = demo["heroPlanId"], demo["nudgePlanId"]

    def break_demo(d):
        d["liveUserId"] = d["privateCounterpartId"]  # private, and pre-joined

    def break_plans(rows):
        for r in rows:
            if r["planId"] == hero_id:
                r["cost"] = {"kind": "free", "perPersonCents": 0, "currency": "USD"}
                r["seedJoinIds"] = ["u_maya"]
            if r["planId"] == nudge_id:
                r["venueId"] = "vn_ocean_beach"

    _edit_json(seed_dir / "demo.json", break_demo)
    _edit_jsonl(seed_dir / "plans.jsonl", break_plans)
    errors = "\n".join(check_pool(root, CITY))
    for needle in ("liveUserId must be public", "pre-joined", "hero plan must be prepaid",
                   "seedJoinIds include u_maya", "frequent place", "cost differs"):
        assert needle in errors, needle


def test_check_catches_bad_plan(committed, tmp_path):
    root = _copy(committed, tmp_path, EVENT)
    seed_dir = root / "seed" / EVENT
    venues = [json.loads(x) for x in (seed_dir / "venues.jsonl").read_text().splitlines()]
    sensitive = next(v for v in venues if v.get("sensitive"))

    def bad(rows):
        rows[-1]["venueId"] = sensitive["venueId"]
        rows[-2]["startsAt"] = "2026-11-13T09:00:00Z"
        rows[-3]["targetInterestIds"] = ["identity_values.faith"]

    _edit_jsonl(seed_dir / "plans.jsonl", bad)
    errors = "\n".join(check_pool(root, EVENT))
    assert "sensitive venue" in errors and "outside the plan horizon" in errors and "non-sensitive level-2" in errors


def test_featured_plan_must_fit_maya_calendar(committed, tmp_path):
    root = _copy(committed, tmp_path, CITY)
    seed_dir = root / "seed" / CITY
    demo = json.loads((seed_dir / "demo.json").read_text())

    def tuesday_morning(rows):  # Maya works Tuesdays 9 to 5:30
        for r in rows:
            if r["planId"] == demo["heroPlanId"]:
                r["startsAt"], r["endsAt"] = "2026-11-17T18:00:00Z", "2026-11-17T20:00:00Z"

    _edit_jsonl(seed_dir / "plans.jsonl", tuesday_morning)
    assert any("busy block" in e for e in check_pool(root, CITY))


def test_check_catches_schema_violation(committed, tmp_path):
    root = _copy(committed, tmp_path, EVENT)
    path = root / f"seed/{EVENT}/personas.jsonl"
    row = json.loads(path.read_text().splitlines()[0])
    row["outgoingness"] = 0.5
    path.write_text(path.read_text() + json.dumps(row) + "\n")
    assert any("Additional properties" in e for e in check_pool(root, EVENT))


def test_check_requires_every_file(committed, tmp_path):
    root = _copy(committed, tmp_path, EVENT)
    (root / f"seed/{EVENT}/plans.jsonl").unlink()
    assert any("plans.jsonl: missing" in e for e in check_pool(root, EVENT))


@pytest.mark.parametrize("pool_id", [CITY, EVENT])
def test_demo_plans_use_leiden_scene_ids(committed, pool_id):
    from cg_sim.seed.export import load_ground_truth_export
    from cg_sim.seed.generate import _leiden_scenes

    scene_of = _leiden_scenes(load_ground_truth_export(pool_id, committed, with_signals=False), SEED)
    demo = json.loads((committed / "seed" / pool_id / "demo.json").read_text())
    plans = {p["planId"]: p for p in map(json.loads, (committed / "seed" / pool_id / "plans.jsonl").read_text().splitlines())}
    for pid in (demo["heroPlanId"], demo["nudgePlanId"], demo["featuredPlanIds"][2]):
        p = plans[pid]
        assert p["sceneId"] in {scene_of[u] for u in p["seedJoinIds"]}, pid
