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
