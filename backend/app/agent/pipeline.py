"""Pipeline entry: cache, ADK-or-direct selection, scan store."""

from __future__ import annotations

import copy
import hashlib
import logging
from collections import OrderedDict

from app.agent.direct import run_direct
from app.agent.steps import Emit, ScanState
from app.ai import commentary as com_mod
from app.config import get_settings
from app.models import ScanResponse

log = logging.getLogger("fivesec")
_BY_KEY: "OrderedDict[str, ScanResponse]" = OrderedDict()
SCANS: "OrderedDict[str, ScanResponse]" = OrderedDict()
_MAX = 256


def cache_key(barcode: str | None, images: list[tuple[str, bytes]], fixture: str | None, market: str) -> str:
    h = hashlib.sha256()
    h.update((barcode or "").encode())
    for _, b in images:
        h.update(hashlib.sha256(b).digest())
    h.update((fixture or "").encode())
    h.update(market.encode())
    return h.hexdigest()


def _remember(d: "OrderedDict[str, ScanResponse]", k: str, v: ScanResponse) -> None:
    d[k] = v
    while len(d) > _MAX:
        d.popitem(last=False)


async def run_scan(
    images: list[tuple[str, bytes]], barcode: str | None, lang: str, market: str,
    fixture: str | None, emit: Emit,
) -> ScanResponse:
    key = cache_key(barcode, images, fixture, market)
    hit = _BY_KEY.get(key)
    if hit is not None:
        await emit("analysis", hit.analysis.model_dump(mode="json"))
        com = com_mod.cache_get(hit.scan_id, lang)
        calls = 0
        if com is None:
            com, _, calls = await com_mod.write_commentary(hit.analysis, lang, hit.scan_id)
        await emit("commentary", com.model_dump(mode="json"))
        trace = [{"tool": "cache_hit", "ms": 0, "model_calls": 0}]
        if calls:
            trace.append({"tool": "write_commentary", "ms": 0, "model_calls": calls})
        return hit.model_copy(update={"commentary": com, "cached": True, "model_calls": calls, "trace": trace})

    def new_state() -> ScanState:
        return ScanState(images=images, barcode=barcode, lang=lang, market=market, fixture=fixture, emit=emit)

    resp: ScanResponse | None = None
    if get_settings().pipeline == "adk":
        try:
            from app.agent.adk_agent import run_adk

            resp = await run_adk(new_state())
        except NotImplementedError:
            raise
        except Exception as e:  # noqa: BLE001
            log.warning("ADK pipeline failed (%s); falling back to direct", type(e).__name__)
    if resp is None:
        resp = await run_direct(new_state())
    stored = copy.deepcopy(resp)
    _remember(_BY_KEY, key, stored)
    _remember(SCANS, resp.scan_id, stored)
    return resp
