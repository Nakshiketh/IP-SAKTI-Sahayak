# IP-SAKTI Sahayak
#
# On Windows without GNU make, `.\make.ps1 <target>` runs the same commands.

PY := backend/.venv/Scripts/python.exe
ifeq ($(OS),)
  PY := backend/.venv/bin/python
endif

.PHONY: help install install-llm dev dev-backend dev-frontend dev-frontend-mock \
        test test-backend test-frontend lint format schema ingest ingest-samples \
        ingest-records ingest-records-samples refresh evals clean

help:
	@echo "install         install backend and frontend dependencies"
	@echo "install-llm     the same, plus the hosted-model client"
	@echo "dev             run the API and the web app together"
	@echo "dev-frontend-mock  run the web app alone, answering from the demo fixture"
	@echo "test            run every test suite, including the schema-drift contract"
	@echo "lint            ruff, eslint, prettier and tsc"
	@echo "schema          regenerate schemas/domain.schema.json from the Pydantic model"
	@echo "i18n            sync every locale with the English key set, then report coverage"
	@echo "manifest        regenerate corpus/manifest.json from the planned source set"
	@echo "ingest          build the index from corpus/manifest.json"
	@echo "ingest-samples  build the index from the fixture documents, into data/index-samples"
	@echo "refresh         re-fetch and report what has changed since the last ingest"
	@echo "ingest-records  load the records layer from corpus/records-manifest.json"
	@echo "ingest-records-samples  load the fixture registry, into data/records-samples.sqlite3"
	@echo "evals           run the evaluation harness and write a report (Phase 13)"

install:
	$(PY) -m pip install -e "backend[dev]"
	cd frontend && npm install

install-llm:
	$(PY) -m pip install -e "backend[dev,llm]"

dev:
	@echo "Run these in two terminals:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"

dev-backend:
	cd backend && .venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

# The web app with no API running, answering from the demo fixture.
dev-frontend-mock:
	cd frontend && VITE_SAHAYAK_API=mock npm run dev

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
	$(PY) scripts/build_records_manifest.py

i18n:
	node scripts/i18n-seed.ts
	node scripts/i18n-coverage.ts

i18n-check:
	node scripts/i18n-seed.ts --check
	node scripts/i18n-coverage.ts

# Build the index from the real source set. Today every entry is skipped for
# want of a verified source_url, and the run says so rather than guessing one.
ingest:
	$(PY) scripts/ingest.py

# The same pipeline over the committed fixture documents, which is what proves
# it works end to end while the real manifest has nothing to fetch.
ingest-samples:
	$(PY) scripts/ingest.py --manifest corpus/samples/manifest.json --index-dir data/index-samples

# Re-fetch and report what has moved. Writes nothing without --write.
refresh:
	$(PY) scripts/refresh.py

# Layer 2, in its own database. Today every one of the 17 sources is either a
# portal this never fetches or has a licence nobody has read, so nothing loads.
ingest-records:
	$(PY) scripts/ingest_records.py

# The same loader over the fixture registry, which is what proves it works.
ingest-records-samples:
	$(PY) scripts/ingest_records.py --manifest corpus/samples/records-manifest.json --database data/records-samples.sqlite3 --no-write-back

evals:
	@echo "The evaluation harness arrives in Phase 13. See docs/MASTER_BUILD.md, Phase 13."
	@exit 1

clean:
	cd frontend && rm -rf dist node_modules/.vite
