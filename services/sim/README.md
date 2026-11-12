# cg-sim

Seed data, Laya precompute and Monte Carlo simulation for Common Ground (PRD-3, contracts v2).

```sh
cd services/sim
uv run cg-sim seed                 # regenerate data/seed/* and data/sim_private/* (every pool)
uv run cg-sim seed --pool pool_sf_city --seed 7
uv run cg-sim seed --check         # validate the committed seed (presence, schemas, demo rules, privacy)
uv run cg-sim precompute|eval|run|report ...
uv run pytest -q
```

`cli.py` dispatches `cg-sim <cmd>` to `cg_sim.<module>.main(argv)`: seed -> `seed`, eval -> `evalx`,
precompute -> `precompute`, run -> `mc`, report -> `report`. Each module parses its own args.

Shared (read-only for other slices): `contracts.py` (paths, params, modes, taxonomy, schemas),
`matching_adapter.py` (cg_matching if installed, naive fallback otherwise; dict in / dict out).

Paths come from `CG_DATA_DIR` and `CG_CONTRACTS_DIR` (default: the repo's `data/` and `contracts/`).
Dependencies are declared once here; ask the sim lead to add more.

## Ground-truth API (read-only, `cg_sim.seed.export`)

Stand-in for `GET /internal/v1/pools/{id}/export` (`--use-ground-truth`). Reads the committed files, writes nothing.

```python
from cg_sim.seed.export import load_ground_truth, ground_truth_signals, load_ground_truth_export

load_ground_truth("pool_sf_city")         # {userId: ground_truth.jsonl row}
ground_truth_signals("pool_sf_city")      # {userId: {"frequentPlaces": [venueId], "routines": [{activity, day, part}],
                                          #           "sensitivePlace": venueId | None}}  (seeded truth, all users)
load_ground_truth_export("pool_sf_city")  # pool_export.schema.json dict; users[].signals filled from connected providers:
                                          #   google_maps -> frequent_place (sensitive place: visibility hidden, sensitive true)
                                          #   strava -> routine. with_signals=False leaves signals empty.
```

All take an optional `root` (default `CG_DATA_DIR`). Ground truth lives in `data/sim_private/`: never copy it
into `data/seed/` or `data/laya_tables/`.
