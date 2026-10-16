import pytest
from pydantic import ValidationError

from app.models import (
    Analysis,
    Card,
    Commentary,
    DateField,
    Extraction,
    Finding,
    HouseholdFacts,
    Legible,
    ScanResponse,
)


def _legible(v, conf=0.9):
    return {"value": v, "confidence": conf}


def _extraction() -> Extraction:
    return Extraction(
        name=_legible("Kokis"),
        brand=_legible(None, 0.0),
        category=_legible("food"),
        label_languages=["si", "en"],
        ingredients_verbatim=_legible("Wheat flour, sesame"),
        ingredients=_legible(["wheat flour", "sesame"]),
        allergen_contains_statement=_legible("Contains: sesame"),
        allergen_may_contain_statement=_legible(None, 0.0),
        nutrition=_legible([]),
        serving_size_g=_legible(30.0),
        claims=_legible([]),
        dates=_legible([DateField(kind="expiry", raw="2026-12-01", iso="2026-12-01")]),
        batch_lot=_legible(None, 0.0),
        manufacturer=_legible(None, 0.0),
        origin=_legible(None, 0.0),
        certification_marks=_legible([]),
        packaging_codes=_legible(["PP 5"]),
        barcode=None,
        missing_sides=[],
        retake_tip=None,
    )


def test_legible_low_confidence_nulls_value():
    assert Legible[str](value="x", confidence=0.59).value is None
    assert Legible[str](value="x", confidence=0.6).value == "x"


def test_finding_without_tier_raises():
    data = {
        "id": "allergen.contains.sesame",
        "card": "allergens",
        "category": "allergen_contains",
        "severity": "avoid",
        "risk": "allergen",
        "title": "Contains sesame",
        "reason": "Sesame is listed.",
        "next_step": None,
        "sources": [{"label": "Pack label"}],
    }
    with pytest.raises(ValidationError):
        Finding(**data)
    with pytest.raises(ValidationError):
        Finding(**data, tier=None)
    assert Finding(**data, tier="label_stated").tier == "label_stated"


def test_extraction_round_trips_json():
    ext = _extraction()
    restored = Extraction.model_validate_json(ext.model_dump_json())
    assert restored == ext
    assert restored.name.value == "Kokis"
    assert restored.brand.value is None


def test_scan_response_builds():
    ext = _extraction()
    finding = Finding(
        id="allergen.contains.sesame",
        card="allergens",
        category="allergen_contains",
        severity="avoid",
        risk="allergen",
        tier="label_stated",
        title="Contains sesame",
        reason="Sesame is listed in the allergen statement.",
        next_step=None,
        sources=[],
    )
    cards = [
        Card(id=cid, status="info", tier="unknown", headline="ok", finding_ids=[])
        for cid in ["allergens", "nutrition", "diet", "ingredients", "claims", "packaging"]
    ]
    facts = HouseholdFacts(
        allergens_contains=["sesame"],
        allergens_may_contain=[],
        ingredients_known=True,
        diets={"vegan": "unknown"},
        nutrient_levels={"sodium": "high"},
        canonical_ingredient_ids=["sesame"],
    )
    analysis = Analysis(
        product=ext,
        findings=[finding],
        cards=cards,
        facts=facts,
        banners=[],
        rule_pack_version="v1",
        ri_reference="Codex NRV (adult)",
        unresolved_terms=[],
    )
    resp = ScanResponse(
        scan_id="abc",
        analysis=analysis,
        commentary=Commentary(lang="en", summary="Contains sesame.", cards={}, source="template"),
        trace=[{"tool": "extract_label", "ms": 1, "model_calls": 0}],
        model_calls=0,
        cached=False,
    )
    assert resp.analysis.findings[0].tier == "label_stated"
    assert len(resp.analysis.cards) == 6
