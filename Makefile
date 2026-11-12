# Thin wrappers around each owner's standard commands (contracts/CONTRACTS.md §12).
POOL ?= pool_sf_city

.PHONY: api seed dashboard app mock-api sim-seed sim-precompute sim-run contracts-check

api:            ## backend: public :8000, internal :9001
	cd services/api && uv run cg-api

seed:           ## backend loads data/seed/$(POOL)
	cd services/api && uv run cg-api-load-seed $(POOL)

dashboard:      ## laptop dashboard on 127.0.0.1:9100
	cd services/dashboard && uv run cg-dashboard

app:            ## Expo dev server for Expo Go
	cd facebook-clone && npm start

mock-api:       ## Prism mock of the public contract on :8000
	npx -y @stoplight/prism-cli mock contracts/openapi.yaml --host 0.0.0.0 --port 8000

sim-seed:
	cd services/sim && uv run cg-sim seed --pool $(POOL)

sim-precompute:
	cd services/sim && uv run cg-sim precompute --pool $(POOL)

sim-run:
	cd services/sim && uv run cg-sim run --pool $(POOL)

contracts-check:
	python scripts/validate_contracts.py && python scripts/build_openapi_json.py --check
