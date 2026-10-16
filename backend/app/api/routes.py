"""HTTP API. Never logs request bodies; never accepts profile fields."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.agent import pipeline
from app.ai import commentary as com_mod
from app.ai.tts import TTSUnavailable, synthesize
from app.config import get_settings

log = logging.getLogger("fivesec")
router = APIRouter(prefix="/api")

ALLOWED_FIELDS = {"images", "barcode", "lang", "market", "fixture"}
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 5 * 1024 * 1024
REPORTS: list[dict[str, Any]] = []


def _bad(msg: str) -> HTTPException:
    return HTTPException(status_code=400, detail=msg)


def _sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.get("/health")
async def health() -> dict[str, Any]:
    s = get_settings()
    return {"status": "ok", "mock": s.mock, "pipeline": s.pipeline}


@router.get("/fixtures")
async def fixtures() -> list[dict[str, str]]:
    try:
        from app.rules.fixtures import list_fixtures, load_fixture

        out = []
        for item in list_fixtures():
            name = item if isinstance(item, str) else (item.get("name") if isinstance(item, dict) else getattr(item, "name"))
            title = name.replace("_", " ")
            try:
                fx = load_fixture(name)
                n = fx["name"]["value"] if isinstance(fx, dict) else fx.name.value
                title = n or title
            except Exception:  # noqa: BLE001
                pass
            out.append({"name": name, "title": title})
        return out
    except (ImportError, NotImplementedError):
        return []


@router.post("/scan")
async def scan(request: Request) -> StreamingResponse:
    form = await request.form()
    extra = set(form.keys()) - ALLOWED_FIELDS
    if extra:
        raise _bad("unexpected form field")
    files = form.getlist("images")
    if not 1 <= len(files) <= 4:
        raise _bad("send 1 to 4 images")
    images: list[tuple[str, bytes]] = []
    for f in files:
        if isinstance(f, str) or not hasattr(f, "read"):
            raise _bad("images must be files")
        if f.content_type not in ALLOWED_TYPES:
            raise _bad("images must be jpeg, png or webp")
        data = await f.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise _bad("image larger than 5 MB")
        if not data:
            raise _bad("empty image")
        images.append((f.content_type, data))
    lang = str(form.get("lang") or "en")
    if lang not in ("en", "si", "ta"):
        raise _bad("lang must be en, si or ta")
    barcode = str(form.get("barcode") or "").strip() or None
    if barcode and (len(barcode) > 32 or not barcode.isdigit()):
        raise _bad("invalid barcode")
    market = str(form.get("market") or "SG").strip().upper()[:4] or "SG"
    fixture = str(form.get("fixture") or "").strip() or None
    if fixture and not get_settings().mock:
        fixture = None
    if fixture and not all(c.isalnum() or c == "_" for c in fixture):
        raise _bad("invalid fixture")

    queue: asyncio.Queue[tuple[str, Any] | None] = asyncio.Queue()

    async def emit(event: str, data: Any) -> None:
        await queue.put((event, data))

    async def runner() -> None:
        try:
            resp = await pipeline.run_scan(images, barcode, lang, market, fixture, emit)
            await queue.put(("done", resp.model_dump(mode="json")))
        except NotImplementedError:
            await queue.put(("error", {"code": "rules_unavailable", "message": "Rules engine not available."}))
        except Exception as e:  # noqa: BLE001
            log.error("scan failed: %s", type(e).__name__)
            await queue.put(("error", {"code": "scan_failed", "message": "We could not analyse this scan. Please retry."}))
        finally:
            await queue.put(None)

    task = asyncio.create_task(runner())

    async def stream():
        try:
            while (item := await queue.get()) is not None:
                yield _sse(*item)
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


class CommentaryReq(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scan_id: str = Field(max_length=64)
    lang: Literal["en", "si", "ta"]


@router.post("/commentary")
async def commentary(req: CommentaryReq) -> Any:
    resp = pipeline.SCANS.get(req.scan_id)
    if resp is None:
        raise HTTPException(404, "unknown scan_id")
    com, _, _ = await com_mod.write_commentary(resp.analysis, req.lang, req.scan_id)
    return com


class TTSReq(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=1500)
    lang: Literal["en", "si", "ta"]


@router.post("/tts")
async def tts(req: TTSReq) -> Response:
    try:
        audio = await synthesize(req.text, req.lang)
    except TTSUnavailable:
        return JSONResponse({"detail": "tts unavailable"}, status_code=503)
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


class ReportReq(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scan_id: str = Field(max_length=64)
    finding_id: str | None = Field(default=None, max_length=128)
    note: str | None = Field(default=None, max_length=500)


@router.post("/report", status_code=202)
async def report(req: ReportReq) -> dict[str, str]:
    REPORTS.append(req.model_dump())
    del REPORTS[:-1000]
    return {"status": "queued"}
