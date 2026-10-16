# Five Seconds: single image serving the API and the built PWA.
# Stage 1 builds the web app; stage 2 runs the FastAPI backend with uv.

# ---- Stage 1: web build -------------------------------------------------
FROM node:22-alpine AS web-build
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- Stage 2: runtime ---------------------------------------------------
FROM python:3.12-slim AS runtime

# uv pinned to a specific release (bump deliberately).
COPY --from=ghcr.io/astral-sh/uv:0.8.22 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_CACHE_DIR=/tmp/uv-cache \
    WEB_DIST=/app/web/dist \
    PORT=8080

RUN groupadd --system app \
 && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app \
 && mkdir -p /tmp/uv-cache && chown app:app /tmp/uv-cache

WORKDIR /app/backend

# Dependency layer first (cache-friendly), then the source.
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/ ./
RUN uv sync --frozen --no-dev

COPY --from=web-build /src/web/dist /app/web/dist

USER app
EXPOSE 8080

CMD ["sh", "-c", "uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
