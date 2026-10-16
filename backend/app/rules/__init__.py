"""Deterministic rules engine (no model calls). Public API: analyze()."""

from __future__ import annotations

from datetime import date

from app.models import Analysis, Extraction, Finding

from . import additives, allergens, cards, claims, dates, diets, nutrition, packaging
from .fixtures import list_fixtures, load_fixture
from .ingredients import build_info
from .taxonomy import RULE_PACK_VERSION

__all__ = ["analyze", "RULE_PACK_VERSION", "load_fixture", "list_fixtures"]


def analyze(
    extraction: Extraction,
    market: str = "SG",
    resolved: dict[str, str] | None = None,
    today: date | None = None,
) -> Analysis:
    """Analyse an Extraction. Label text is data only; nothing in it changes the logic."""
    today = today or date.today()
    info = build_info(extraction, resolved)
    al = allergens.detect(info)
    diet_res = diets.evaluate(extraction, info, al)
    nut = nutrition.compute(extraction)
    adds = additives.summarise(info)

    fields, date_findings, banners = dates.evaluate(extraction.dates.value or [], today)
    product = extraction
    if extraction.dates.value:
        product = extraction.model_copy(update={"dates": extraction.dates.model_copy(update={"value": fields})})

    findings: list[Finding] = []
    findings += allergens.findings(al, info)
    findings += nutrition.findings(nut, extraction)
    findings += diets.findings(diet_res)
    findings += additives.findings(info)
    findings += claims.evaluate(claims.ClaimContext(extraction, info, al, diet_res, nut))
    findings += packaging.findings(extraction.packaging_codes.value, extraction.packaging_codes.value is not None)
    findings += date_findings

    if not info.known or "ingredients" in extraction.missing_sides:
        banners.append("retake:ingredients")
    if "nutrition" in extraction.missing_sides:
        banners.append("retake:nutrition")
    if "front" in extraction.missing_sides:
        banners.append("retake:front")

    heads = cards.headlines_for(findings, al, info, nut, diet_res, adds)
    return Analysis(
        product=product,
        findings=findings,
        cards=cards.build_cards(findings, heads),
        facts=cards.build_facts(al, info, diet_res, nut),
        banners=list(dict.fromkeys(banners)),
        rule_pack_version=RULE_PACK_VERSION,
        ri_reference=nutrition.RI_REFERENCE,
        unresolved_terms=list(info.unresolved),
    )
