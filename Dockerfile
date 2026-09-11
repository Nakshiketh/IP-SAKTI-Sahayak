# One container for a public deployment: the built web app, and the API behind
# /api, on one origin. The same shape scripts/share.ps1 runs on this machine,
# minus the tunnel — the host's own https URL takes its place. See render.yaml.

# -- the web app -------------------------------------------------------------
FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json frontend/
RUN npm --prefix frontend ci
# The build reads ../corpus, ../backend/app and ../data/fixtures through its
# aliases, so the whole source tree goes in, not just frontend/.
COPY . .
RUN npm --prefix frontend run build

# -- the API, and the edge in front of it ------------------------------------
FROM python:3.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# OpenCV's headless wheel still wants glib at import time on a slim image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*
# serve-public.mjs needs node and nothing from npm.
COPY --from=web /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY . .
# Editable, so settings.py still finds the repo root from its own path.
RUN pip install --no-cache-dir -e backend
COPY --from=web /app/frontend/dist frontend/dist

# The host sets PORT. The API stays on loopback; only the edge is reachable.
# If either process exits, the container exits and the host restarts it.
EXPOSE 10000
CMD ["bash", "-c", "(cd backend && exec python -m uvicorn app.main:app --host 127.0.0.1 --port 8000) & node scripts/serve-public.mjs --host 0.0.0.0 --port \"${PORT:-10000}\" & wait -n"]
