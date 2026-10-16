"""FastAPI app factory. Run: uvicorn app.main:app"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse

from app.api.routes import router
from app.config import get_settings

CSP = (
    "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; "
    "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; "
    "worker-src 'self' blob:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'"
)
HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(self), microphone=()",
}


def create_app() -> FastAPI:
    app = FastAPI(title="Five Seconds", docs_url=None, redoc_url=None, openapi_url=None)

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
