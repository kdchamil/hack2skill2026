"""Pipeline steps shared by the ADK agent and the direct pipeline. Orchestration makes NO model calls itself;
only extract_label and write_commentary (which also resolves terms) call Gemini."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

import httpx

from app.ai import commentary as com_mod
from app.ai.extract import extract_label as ai_extract
from app.config import get_settings
from app.models import Analysis, Commentary, Extraction, Finding, ScanResponse, Source

Emit = Callable[[str, Any], Awaitable[None]]
TOOLS = ["extract_label", "lookup_open_food_facts", "run_rules", "check_claims", "resolve_terms", "write_commentary"]


@dataclass
class ScanState:
    images: list[tuple[str, bytes]]
    barcode: str | None
    lang: str
    market: str
    fixture: str | None
    emit: Emit
    scan_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    extraction: Extraction | None = None
    off: dict[str, Any] | None = None
    analysis: Analysis | None = None
    commentary: Commentary | None = None
    resolved: dict[str, str] = field(default_factory=dict)
    trace: list[dict[str, Any]] = field(default_factory=list)
    model_calls: int = 0

    def record(self, tool: str, t0: float, calls: int = 0, **extra: Any) -> None:
        self.trace.append({"tool": tool, "ms": int((time.perf_counter() - t0) * 1000), "model_calls": calls, **extra})
        self.model_calls += calls


def _analyze(ex: Extraction, market: str, resolved: dict[str, str] | None) -> Analysis:
    from app import rules

    return rules.analyze(ex, market=market, resolved=resolved or None)


async def extract_label(st: ScanState) -> None:
    t0 = time.perf_counter()
    st.extraction, calls = await ai_extract(st.images, st.barcode, st.fixture)
    st.record("extract_label", t0, calls)


async def lookup_open_food_facts(st: ScanState) -> None:
    t0 = time.perf_counter()
    barcode = st.barcode or (st.extraction.barcode if st.extraction else None)
    if get_settings().mock or not barcode or not barcode.isdigit():
        st.record("lookup_open_food_facts", t0, 0, skipped=True)
        return
    try:
        async with httpx.AsyncClient(timeout=2.0) as c:
            r = await c.get(
                f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json",
                params={"fields": "product_name,brands"},
                headers={"User-Agent": "FiveSeconds-prototype/0.1"},
            )
        if r.status_code == 200 and r.json().get("status") == 1:
            p = r.json().get("product", {})
            st.off = {"name": p.get("product_name"), "brand": p.get("brands")}
    except Exception:  # noqa: BLE001 - OFF is best-effort
        pass
    st.record("lookup_open_food_facts", t0, 0, found=st.off is not None)


def _tokens(s: str | None) -> set[str]:
    return {w for w in (s or "").lower().replace("-", " ").split() if len(w) > 2}


def apply_off(st: ScanState, analysis: Analysis) -> Analysis:
    """Add an info finding when the barcode record's name conflicts with the label name."""
    if not st.off or not st.off.get("name") or not analysis.product.name.value:
        return analysis
    label_name = analysis.product.name.value
    a, b = _tokens(label_name), _tokens(st.off["name"])
    if not a or not b or a & b:
        return analysis
    f = Finding(
        id="barcode.name_differs", area="truth", topic="authenticity", card=None, category="barcode", severity="info",
        risk="no_known_concern", tier="verified", title="Barcode record differs from label",
        reason="The product name in the barcode database does not match the name read from the pack.",
        next_step="Check you scanned the right product.",
        sources=[Source(label="Open Food Facts", url="https://world.openfoodfacts.org")],
        data={"off_name": st.off.get("name"), "off_brand": st.off.get("brand"), "label_name": label_name},
    )
    areas = [a.model_copy(update={"finding_ids": [*a.finding_ids, f.id]}) if a.id == "truth" else a
             for a in analysis.areas]
    return analysis.model_copy(update={"findings": [*analysis.findings, f], "areas": areas})


async def run_rules(st: ScanState, resolved: dict[str, str] | None = None) -> None:
    t0 = time.perf_counter()
    assert st.extraction is not None
    st.analysis = apply_off(st, _analyze(st.extraction, st.market, resolved))
    st.record("run_rules", t0, 0)
    await st.emit("analysis", st.analysis.model_dump(mode="json"))


async def check_claims(st: ScanState) -> None:
    """Claim verification lives in rules (claims.py); this step surfaces it in the trace."""
    t0 = time.perf_counter()
    assert st.analysis is not None
    n = sum(1 for f in st.analysis.findings if f.category == "claim")
    st.record("check_claims", t0, 0, claim_findings=n)


async def resolve_terms(st: ScanState) -> None:
    """No separate call: unresolved terms are resolved inside write_commentary's single Flash call."""
    t0 = time.perf_counter()
    assert st.analysis is not None
    st.record("resolve_terms", t0, 0, unresolved=len(st.analysis.unresolved_terms), merged_into="write_commentary")


async def write_commentary(st: ScanState) -> None:
    t0 = time.perf_counter()
    assert st.analysis is not None
    old = st.analysis
    com, resolved, calls = await com_mod.write_commentary(old, st.lang, st.scan_id)
    if resolved:
        st.resolved = resolved
        new = apply_off(st, _analyze(st.extraction, st.market, resolved))  # type: ignore[arg-type]
        if new != old:
            st.analysis = new
            com = com_mod.regenerate_for_changed(com, old, new)
            com_mod.cache_put(st.scan_id, st.lang, com)
            await st.emit("analysis", new.model_dump(mode="json"))
    st.commentary = com
    st.record("write_commentary", t0, calls)
    await st.emit("commentary", com.model_dump(mode="json"))


STEPS: list[Callable[[ScanState], Awaitable[None]]] = [
    extract_label, lookup_open_food_facts, run_rules, check_claims, resolve_terms, write_commentary,
]


def finish(st: ScanState) -> ScanResponse:
    assert st.analysis and st.commentary
    return ScanResponse(
        scan_id=st.scan_id, analysis=st.analysis, commentary=st.commentary,
        trace=st.trace, model_calls=st.model_calls, cached=False,
    )
