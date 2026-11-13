import json

from cg_sim.contracts import params
from cg_sim.mc import grid


def test_grid_select_holdout_confirm(tmp_path, monkeypatch):
    cur = params()["matching"].get("reunionBoost", 0.0)  # explicit current value: identity holds under any params.yaml
    monkeypatch.setattr(grid, "GRID", {"matching.reunionBoost": [cur, cur + 1]})
    monkeypatch.setattr(grid, "data_dir", lambda: tmp_path)
    assert grid.main(["--users", "30", "--seeds", "2", "--holdout", "2", "--top", "1", "--confirm",
                      "--fake-laya", "--workers", "1"]) == 0
    (out,) = (tmp_path / "sim" / "runs").iterdir()
    md = (out / "GRID.md").read_text()
    assert "not evidence" in md and "ADOPT vs CG current" in md and "## Held-out (seeds 2-3" in md
    rows = [json.loads(x) for x in (out / "confirm.jsonl").read_text().splitlines()]
    assert len(rows) == 25 * 2 * 3 and {r["seed"] for r in rows} == {2, 3}  # held-out seeds only
    sel = [json.loads(x) for x in (out / "grid.jsonl").read_text().splitlines()]
    z = {r["seed"]: r for r in sel if r["combo"] == {"matching.reunionBoost": cur}}
    b = {r["seed"]: r for r in sel if r["combo"] == {"matching.reunionBoost": None} and r["policy"] == "common_ground"}
    assert z == {s: {**b[s], "combo": z[s]["combo"]} for s in b}  # explicit current value == current params
