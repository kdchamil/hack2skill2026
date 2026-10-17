"""HTTP API. Never logs request bodies; never accepts profile fields."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.agent import pipeline
from app.ai import commentary as com_mod
from app.ai import listparse
from app.ai.tts import TTSUnavailable, synthesize
from app.config import get_settings
from app.models import ListParseRequest, ListParseResponse
from app.rules.ranges import ranges as range_table

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
    if fixture and not all(c.isalnum() or c == "_" for c in fixture):
        raise _bad("invalid fixture")
    if fixture:
        from app.rules.fixtures import list_fixtures

        if fixture not in {i["name"] if isinstance(i, dict) else i for i in list_fixtures()}:
            raise _bad("unknown fixture")

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


REPORT_FIELDS = {"scan_id", "finding_id", "note"}
MAX_NOTE = 500
MAX_REPORTS_PER_SCAN = 20
_CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f\u2028\u2029]")
_REPORT_COUNTS: dict[str, int] = {}


def _clean(s: str) -> str:
    return _CTRL.sub(" ", s.replace("\r", " ").replace("\n", " ")).strip()


@router.post("/report", status_code=202)
async def report(request: Request) -> dict[str, str]:
    """Correction queue. Accepts only {scan_id, finding_id?, note?}; no profile data, no images.
    Besides the in-memory queue, one JSON line goes to stdout so Cloud Logging keeps a durable queue."""
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        raise _bad("invalid JSON") from None
    if not isinstance(body, dict):
        raise _bad("expected a JSON object")
    extra = set(body) - REPORT_FIELDS
    if extra:
        raise _bad(f"unexpected field(s): {', '.join(sorted(map(str, extra)))}")
    scan_id, finding_id, note = body.get("scan_id"), body.get("finding_id"), body.get("note")
    if not isinstance(scan_id, str) or not 0 < len(scan_id) <= 64:
        raise _bad("scan_id required (max 64 chars)")
    if finding_id is not None and (not isinstance(finding_id, str) or not 0 < len(finding_id) <= 128):
        raise _bad("finding_id must be a string of at most 128 chars")
    if note is not None:
        if not isinstance(note, str) or len(note) > MAX_NOTE:
            raise _bad(f"note must be a string of at most {MAX_NOTE} chars")
        note = _clean(note) or None
    product_name = rule_pack = None
    cached = pipeline.SCANS.get(scan_id)
    if cached is not None:
        if finding_id is not None and finding_id not in {f.id for f in cached.analysis.findings}:
            raise _bad("unknown finding_id for this scan")
        product_name = cached.analysis.product.name.value
        rule_pack = cached.analysis.rule_pack_version
    if _REPORT_COUNTS.get(scan_id, 0) >= MAX_REPORTS_PER_SCAN:
        raise HTTPException(429, "too many reports for this scan")
    _REPORT_COUNTS[scan_id] = _REPORT_COUNTS.get(scan_id, 0) + 1
    if len(_REPORT_COUNTS) > 5000:
        _REPORT_COUNTS.pop(next(iter(_REPORT_COUNTS)))
    report_id = uuid.uuid4().hex
    rec = {
        "severity": "NOTICE", "type": "correction_report", "report_id": report_id, "scan_id": scan_id,
        "finding_id": finding_id, "product_name": product_name, "rule_pack_version": rule_pack, "note": note,
    }
    REPORTS.append(rec)
    del REPORTS[:-1000]
    print(json.dumps(rec, ensure_ascii=False), flush=True)
    return {"status": "queued", "report_id": report_id}


@router.get("/ranges")
async def get_ranges() -> dict[str, Any]:
    return {"ranges": range_table()}


_LIST_HITS: dict[str, list[float]] = {}
LIST_LIMIT, LIST_WINDOW_S = 30, 60.0


def _list_rate_ok(who: str) -> bool:
    now = time.monotonic()
    hits = [t for t in _LIST_HITS.get(who, []) if now - t < LIST_WINDOW_S]
    if len(hits) >= LIST_LIMIT:
        _LIST_HITS[who] = hits
        return False
    hits.append(now)
    _LIST_HITS[who] = hits
    if len(_LIST_HITS) > 5000:
        _LIST_HITS.pop(next(iter(_LIST_HITS)))
    return True


@router.post("/list/parse")
async def list_parse(request: Request) -> ListParseResponse:
    """Pasted text -> items. 400 on bad shape/extra fields/text over 2000 chars; 30 per minute per client; never logged or stored."""
    try:
        req = ListParseRequest.model_validate(await request.json())
    except Exception:  # noqa: BLE001 - invalid JSON or validation failure
        raise _bad("expected {text (max 2000 chars), lang en|si|ta} and nothing else") from None
    if not _list_rate_ok(request.client.host if request.client else "?"):
        raise HTTPException(429, "too many list requests")
    return ListParseResponse(items=await listparse.parse_list(req.text, req.lang))
