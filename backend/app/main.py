"""FastAPI app factory. Run: uvicorn app.main:app"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse

from app.api.routes import router
from app.config import get_settings
from app.store import warmup_caches

CSP = (
    "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; "
    "worker-src 'self' blob:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'"
)
HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(self), microphone=()",
}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm the Firestore client in the background so the first scan doesn't pay channel/token setup.
    task = asyncio.create_task(warmup_caches())
    yield
    task.cancel()


def create_app() -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    app = FastAPI(title="Five Seconds", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        resp = await call_next(request)
        for k, v in HEADERS.items():
            resp.headers.setdefault(k, v)
        return resp

    app.include_router(router)

    dist = get_settings().web_dist.resolve()
    if dist.is_dir():
        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str) -> FileResponse:
            if path.startswith("api/"):
                raise HTTPException(404)
            target = (dist / path).resolve()
            if path and target.is_file() and dist in target.parents:
                return FileResponse(target)
            index = dist / "index.html"
            if not index.is_file():
                raise HTTPException(404)
            return FileResponse(index)

    return app


app = create_app()
