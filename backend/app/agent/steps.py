"""Pipeline steps and the decision policy shared by the ADK agent and the direct pipeline.

next_tool() looks at the current ScanState and decides which tool runs next (or None when done); both runners loop on
it. Decisions made on the way are written to the trace: capture assessment (reshoot or not), barcode route (Open Food
Facts or skip), grounding (Google Search for unresolved terms, or skip). Orchestration itself makes no model calls;
extract_label, resolve_terms (grounding) and write_commentary do."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

import httpx

from app.ai import commentary as com_mod
from app.ai.grounding import GroundedTerm, ground_terms
from app.ai.extract import extract_label as ai_extract
from app.config import get_settings
from app.models import Analysis, Commentary, Extraction, Finding, ScanResponse, Source

Emit = Callable[[str, Any], Awaitable[None]]
TOOLS = ["extract_label", "assess_capture", "lookup_open_food_facts", "run_rules", "resolve_terms", "write_commentary"]


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
    done: set[str] = field(default_factory=set)
    reshoot: list[str] = field(default_factory=list)  # key fields too unclear to trust, e.g. ["ingredients"]
    grounded: list[GroundedTerm] = field(default_factory=list)
    rules_runs: int = 0

    def record(self, tool: str, t0: float, calls: int = 0, **extra: Any) -> None:
        self.trace.append({"tool": tool, "ms": int((time.perf_counter() - t0) * 1000), "model_calls": calls, **extra})
        self.model_calls += calls
        self.done.add(tool)


def _analyze(ex: Extraction, market: str, resolved: dict[str, str] | None) -> Analysis:
    from app import rules

    return rules.analyze(ex, market=market, resolved=resolved or None)


async def extract_label(st: ScanState) -> None:
    t0 = time.perf_counter()
    st.extraction, calls = await ai_extract(st.images, st.barcode, st.fixture)
    st.record("extract_label", t0, calls)


LOW_CONF = 0.6
RESHOOT_ID = "capture.reshoot_ingredients"


def reshoot_fields(ex: Extraction) -> list[str]:
    """Key fields whose legibility is below 0.6 or Unknown. Ingredients must be readable; the allergen statement
    only counts when the model was unsure about it (an absent statement read clearly is a valid answer)."""
    out: list[str] = []
    ing = (ex.ingredients_verbatim, ex.ingredients)
    if all(f.value is None for f in ing) or max(f.confidence for f in ing) < LOW_CONF:
        out.append("ingredients")
    stm = (ex.allergen_contains_statement, ex.allergen_may_contain_statement)
    if any(f.confidence < LOW_CONF for f in stm):
        out.append("allergen_statement")
    return out


async def assess_capture(st: ScanState) -> None:
    """Decision 1: is the photo good enough, or should the user shoot the ingredient side again?"""
    t0 = time.perf_counter()
    assert st.extraction is not None
    st.reshoot = reshoot_fields(st.extraction)
    if st.reshoot:
        st.record("assess_capture", t0, 0, decision="needs_reshoot", fields=st.reshoot,
                  reason="key field legibility below 0.6 or unknown")
        await st.emit("needs_reshoot", {"fields": st.reshoot, "finding_id": RESHOOT_ID,
                                        "tip": st.extraction.retake_tip})
    else:
        st.record("assess_capture", t0, 0, decision="proceed", reason="ingredients and allergen statement legible")


def _barcode(st: ScanState) -> str | None:
    return st.barcode or (st.extraction.barcode if st.extraction else None)


async def lookup_open_food_facts(st: ScanState) -> None:
    """Decision 2: barcode route. Call Open Food Facts only when a numeric barcode exists and we are not in mock mode."""
    t0 = time.perf_counter()
    barcode = _barcode(st)
    if get_settings().mock:
        st.record("lookup_open_food_facts", t0, 0, skipped=True, decision="skip", reason="mock mode, no network")
        return
    if not barcode or not barcode.isdigit():
        st.record("lookup_open_food_facts", t0, 0, skipped=True, decision="skip",
                  reason="no barcode" if not barcode else "barcode not numeric")
        return
    try:
        async with httpx.AsyncClient(timeout=2.0) as c:
            r = await c.get(
                f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json",
                params={"fields": "product_name,brands,ecoscore_grade,ecoscore_score,packaging_tags"},
                headers={"User-Agent": "FiveSeconds-prototype/0.1"},
            )
        if r.status_code == 200 and r.json().get("status") == 1:
            p = r.json().get("product", {})
            st.off = {"name": p.get("product_name"), "brand": p.get("brands"), "barcode": barcode,
                      "ecoscore_grade": p.get("ecoscore_grade"), "ecoscore_score": p.get("ecoscore_score"),
                      "packaging_tags": p.get("packaging_tags")}
    except Exception:  # noqa: BLE001 - OFF is best-effort
        pass
    st.record("lookup_open_food_facts", t0, 0, found=st.off is not None, decision="call",
              reason="numeric barcode present")


def _tokens(s: str | None) -> set[str]:
    return {w for w in (s or "").lower().replace("-", " ").split() if len(w) > 2}


def _add_finding(analysis: Analysis, f: Finding) -> Analysis:
    if any(x.id == f.id for x in analysis.findings):
        return analysis
    areas = [a.model_copy(update={"finding_ids": [*a.finding_ids, f.id]}) if a.id == f.area else a
             for a in analysis.areas]
    return analysis.model_copy(update={"findings": [*analysis.findings, f], "areas": areas})


def apply_eco(st: ScanState, analysis: Analysis) -> Analysis:
    """Planet signal from Open Food Facts (ecoscore). Info only: it never feeds the A-E grade."""
    off = st.off or {}
    grade = str(off.get("ecoscore_grade") or "").lower()
    if grade not in ("a", "b", "c", "d", "e"):
        return analysis
    score = off.get("ecoscore_score")
    score_txt = f" (score {round(score)} out of 100)" if isinstance(score, (int, float)) else ""
    tags = [str(t) for t in (off.get("packaging_tags") or []) if isinstance(t, str)][:8]
    url = f"https://world.openfoodfacts.org/product/{off['barcode']}" if off.get("barcode") else "https://world.openfoodfacts.org"
    f = Finding(
        id="planet.ecoscore", area="planet", topic="carbon", card=None, category="ecoscore", severity="info",
        risk="no_known_concern", tier="verified", title=f"Eco-Score {grade.upper()} on Open Food Facts",
        reason=f"Open Food Facts lists an Eco-Score of {grade.upper()}{score_txt} for this barcode. "
               "It is a database estimate for the product, not a measurement of this pack.",
        next_step="Compare it with similar products if the environment matters to you.",
        sources=[Source(label="Open Food Facts", url=url)],
        data={"ecoscore_grade": grade, "ecoscore_score": score, "packaging_tags": tags},
    )
    return _add_finding(analysis, f)


def apply_capture(st: ScanState, analysis: Analysis) -> Analysis:
    if not st.reshoot:
        return analysis
    tip = (st.extraction.retake_tip if st.extraction else None) or "Photograph the ingredient side flat, close up, without glare."
    f = Finding(
        id=RESHOOT_ID, area="truth", topic="label_clarity", card=None, category="capture", severity="info",
        risk="no_known_concern", tier="unknown", title="Please photograph the ingredient side again",
        reason="The ingredients or allergen statement could not be read clearly, so this result may be missing things.",
        next_step=tip, sources=[Source(label="Pack label")], data={"fields": st.reshoot},
    )
    return _add_finding(analysis, f)


def apply_grounding(st: ScanState, analysis: Analysis) -> Analysis:
    """Each grounded term becomes an 'inferred' info finding that carries the grounding URL as its source."""
    for i, g in enumerate(st.grounded):
        label = g.title or "Google Search"
        f = Finding(
            id=f"ingredients.grounded.{i + 1}", area="body", topic="processing", card=None,
            category="grounding", severity="info", risk="no_known_concern", tier="inferred",
            title=f"Looked up: {g.token}",
            reason=f"Web search suggests \"{g.token}\" relates to {g.canonical_id}: {g.reason}",
            next_step="Check the pack or ask the maker if this matters to you.",
            sources=[Source(label=f"Google Search grounding: {label}"[:80], url=g.url)],
            data={"term": g.token, "resolved_to": g.canonical_id},
        )
        analysis = _add_finding(analysis, f)
    return analysis


def apply_off(st: ScanState, analysis: Analysis) -> Analysis:
    """Post-rules additions: capture advice, planet signal, grounding sources, barcode name mismatch."""
    analysis = apply_grounding(st, apply_eco(st, apply_capture(st, analysis)))
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
    return _add_finding(analysis, f)


async def run_rules(st: ScanState, resolved: dict[str, str] | None = None) -> None:
    t0 = time.perf_counter()
    assert st.extraction is not None
    st.analysis = apply_off(st, _analyze(st.extraction, st.market, resolved or st.resolved))
    st.rules_runs += 1
    st.record("run_rules", t0, 0, **({"rerun": True, "reason": "grounded terms applied"} if st.rules_runs > 1 else {}))
    await st.emit("analysis", st.analysis.model_dump(mode="json"))


async def resolve_terms(st: ScanState) -> None:
    """Decision 3: ground unresolved ingredient terms with Google Search (max 3, ~3 s). Skipped in mock mode or when
    the dictionary already covers everything; on any failure the terms fall through to write_commentary's merged
    resolve path."""
    t0 = time.perf_counter()
    assert st.analysis is not None
    pending = list(st.analysis.unresolved_terms)
    if get_settings().mock:
        st.record("resolve_terms", t0, 0, skipped=True, decision="skip", reason="mock mode, no network",
                  unresolved=len(pending))
        return
    if not pending:
        st.record("resolve_terms", t0, 0, skipped=True, decision="skip", reason="no unresolved terms")
        return
    got = await ground_terms(pending)
    if got:
        st.grounded = got
        st.resolved = {**st.resolved, **{g.token: g.canonical_id for g in got}}
    st.record("resolve_terms", t0, 1, decision="ground", unresolved=len(pending), resolved=len(got),
              **({} if got else {"fallback": "merged into write_commentary"}))


async def write_commentary(st: ScanState) -> None:
    t0 = time.perf_counter()
    assert st.analysis is not None
    old = st.analysis
    com, resolved, calls = await com_mod.write_commentary(old, st.lang, st.scan_id)
    if resolved:
        st.resolved = {**st.resolved, **resolved}
        new = apply_off(st, _analyze(st.extraction, st.market, resolved))  # type: ignore[arg-type]
        if new != old:
            st.analysis = new
            com = com_mod.regenerate_for_changed(com, old, new)
            com_mod.cache_put(st.scan_id, st.lang, com)
            await st.emit("analysis", new.model_dump(mode="json"))
    st.commentary = com
    st.record("write_commentary", t0, calls)
    await st.emit("commentary", com.model_dump(mode="json"))


TOOL_FNS: dict[str, Callable[[ScanState], Awaitable[None]]] = {
    "extract_label": extract_label, "assess_capture": assess_capture,
    "lookup_open_food_facts": lookup_open_food_facts, "run_rules": run_rules, "resolve_terms": resolve_terms,
    "write_commentary": write_commentary,
}


def next_tool(st: ScanState) -> str | None:
    """The agent's policy: choose the next tool from what has happened so far."""
    d = st.done
    if "extract_label" not in d:
        return "extract_label"
    if "assess_capture" not in d:
        return "assess_capture"
    if "lookup_open_food_facts" not in d:
        return "lookup_open_food_facts"
    if st.analysis is None:
        return "run_rules"
    if "resolve_terms" not in d:
        return "resolve_terms"
    if st.grounded and st.rules_runs < 2:
        return "run_rules"  # grounding produced new facts: re-run the rules once with them
    if "write_commentary" not in d:
        return "write_commentary"
    return None


def finish(st: ScanState) -> ScanResponse:
    assert st.analysis and st.commentary
    return ScanResponse(
        scan_id=st.scan_id, analysis=st.analysis, commentary=st.commentary,
        trace=st.trace, model_calls=st.model_calls, cached=False,
    )
