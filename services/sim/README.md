# cg-sim

Seed data, Laya precompute and Monte Carlo simulation for Common Ground (PRD-3).

```sh
cd services/sim
uv run cg-sim seed                 # regenerate data/seed/* and data/sim_private/* (seed 7, every pool)
uv run cg-sim seed --pool pool_sf_city --seed 7
uv run cg-sim seed --check         # validate the committed seed (schemas, demo rules, privacy)
uv run pytest -q
```

Paths come from `CG_DATA_DIR` and `CG_CONTRACTS_DIR` (default: the repo's `data/` and `contracts/`).
