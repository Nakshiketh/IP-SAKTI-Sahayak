# IP-SAKTI Sahayak
#
# On Windows without GNU make, `.\make.ps1 <target>` runs the same commands.

PY := backend/.venv/Scripts/python.exe
ifeq ($(OS),)
  PY := backend/.venv/bin/python
endif

.PHONY: help install dev dev-backend dev-frontend test test-backend test-frontend \
        lint format schema ingest ingest-records refresh evals clean

help:
	@echo "install         install backend and frontend dependencies"
	@echo "dev             run the API and the web app together"
	@echo "test            run every test suite, including the schema-drift contract"
	@echo "lint            ruff, eslint, prettier and tsc"
	@echo "schema          regenerate schemas/domain.schema.json from the Pydantic model"
	@echo "i18n            sync every locale with the English key set, then report coverage"
	@echo "manifest        regenerate corpus/manifest.json from the planned source set"
	@echo "ingest          build the source corpus from corpus/manifest.json (Phase 11)"
	@echo "ingest-records  load the records layer from corpus/records-manifest.json (Phase 12)"
	@echo "evals           run the evaluation harness and write a report (Phase 13)"

install:
	$(PY) -m pip install -e "backend[dev]"
	cd frontend && npm install

dev:
	@echo "Run these in two terminals:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"

dev-backend:
	cd backend && .venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	cd backend && .venv/Scripts/python.exe -m pytest

test-frontend:
	cd frontend && npm test

lint:
	$(PY) -m ruff check .
	node scripts/i18n-seed.ts --check
	cd frontend && npm run lint && npm run format:check && npm run typecheck

format:
	$(PY) -m ruff format .
	cd frontend && npm run format

schema:
	$(PY) scripts/gen_schema.py

manifest:
	$(PY) scripts/build_manifest.py

i18n:
	node scripts/i18n-seed.ts
	node scripts/i18n-coverage.ts

i18n-check:
	node scripts/i18n-seed.ts --check
	node scripts/i18n-coverage.ts

ingest:
	@echo "The corpus pipeline arrives in Phase 11. Nothing is ingested yet, and"
	@echo "no index is built. See docs/MASTER_BUILD.md, Phase 11."
	@exit 1

ingest-records:
	@echo "The records layer arrives in Phase 12. See docs/MASTER_BUILD.md, Phase 12."
	@exit 1

evals:
	@echo "The evaluation harness arrives in Phase 13. See docs/MASTER_BUILD.md, Phase 13."
	@exit 1

clean:
	cd frontend && rm -rf dist node_modules/.vite
