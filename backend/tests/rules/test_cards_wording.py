import json
import re

from app.models import Analysis
from app.rules import analyze, list_fixtures, load_fixture
from app.rules.areas import build_areas
from app.rules.cards import build_cards
from app.rules.taxonomy import AREA_ORDER, CARD_ORDER, RULE_PACK_VERSION, make_finding, strongest, weakest, worst
from tests.rules.helpers import TODAY, area, mk, nut


def all_text(a: Analysis) -> str:
    parts = [a.ri_reference]
    for f in a.findings:
        parts += [f.title, f.reason, f.next_step or ""]
    parts += [c.headline for c in a.cards] + [x.headline for x in a.areas]
    return " ".join(parts)


def test_no_output_says_safe_across_all_fixtures():
    for fx in list_fixtures():
        a = analyze(load_fixture(fx["name"]), today=TODAY)
        text = all_text(a).lower()
        assert "safe" not in text, fx["name"]
        for f in a.findings:
            assert json.dumps(f.model_dump())  # serialisable


def test_medical_adjacent_next_steps_end_with_professional():
    for fx in list_fixtures():
        a = analyze(load_fixture(fx["name"]), today=TODAY)
        for f in a.findings:
            if f.category in ("allergen_contains", "allergen_may_contain") or (
                    f.category == "nutrient_level" and f.severity == "check"):
                if f.next_step:
                    assert f.next_step.endswith("Check with a professional."), f.id


def test_helpers_orderings():
    assert weakest(["verified", "inferred", "label_stated"]) == "inferred"
    assert weakest([]) == "unknown" and strongest(["unknown", "verified"]) == "verified"
    assert worst(["good", "avoid", "info"]) == "avoid" and worst([]) == "info"


def test_card_status_is_worst_severity():
    a = analyze(mk(["Egg", "Zorblax"], nutrition=nut(sodium_mg=2000), dates=[
        {"kind": "expiry", "raw": "01/01/2020", "iso": None}]), today=TODAY)
    by = {c.id: c for c in a.cards}
    assert by["nutrition"].status == "check"
    assert area(a, "body").status == "avoid"  # expired date
    for c in a.cards:
        for fid in c.finding_ids:
            assert next(f for f in a.findings if f.id == fid).card == c.id
    for x in a.areas:
        for fid in x.finding_ids:
            assert next(f for f in a.findings if f.id == fid).area == x.id


def test_empty_card_defaults():
    cards = build_cards([], {k: "x" for k in CARD_ORDER}, {k: None for k in CARD_ORDER})
    assert all(c.status == "info" and c.tier == "unknown" and c.grade is None for c in cards)
    areas = build_areas([], {k: "x" for k in AREA_ORDER})
    assert [a.id for a in areas] == AREA_ORDER and all(a.tier == "unknown" for a in areas)


def test_headline_word_cap():
    a = analyze(mk(["Egg", "Milk", "Soy", "Peanut", "Sesame", "Fish", "Wheat"], may="may contain mustard, celery, lupin, prawn"),
                today=TODAY)
    assert len(area(a, "body").headline.split()) <= 12 and "and more" in area(a, "body").headline


def test_sources_always_include_rule_pack_and_label_when_read():
    f = make_finding("x", "claims", "claim", "info", "no_known_concern", "inferred", "t", "r")
    assert [s.label for s in f.sources] == [f"Rule pack {RULE_PACK_VERSION}", "Pack label"]
    g = make_finding("x", "claims", "claim", "info", "no_known_concern", "inferred", "t", "r", label_read=False)
    assert [s.label for s in g.sources] == [f"Rule pack {RULE_PACK_VERSION}"]


def test_retake_banners():
    a = analyze(mk(["Water"], missing=["nutrition", "front"]), today=TODAY)
    assert "retake:nutrition" in a.banners and "retake:front" in a.banners and "retake:ingredients" not in a.banners
    b = analyze(mk(["Water"], missing=["ingredients"]), today=TODAY)
    assert "retake:ingredients" in b.banners


def test_facts_canonical_ids():
    a = analyze(mk(["Sugar", "Emulsifier (E471)", "Wheat flour"]), today=TODAY)
    assert {"sugar", "e471", "wheat_gluten"} <= set(a.facts.canonical_ingredient_ids)


def test_market_param_accepted():
    assert analyze(mk(["Water"]), market="LK", today=TODAY).rule_pack_version == RULE_PACK_VERSION


def test_no_forbidden_imports_in_rules():
    import pathlib
    root = pathlib.Path(__file__).resolve().parents[2] / "app" / "rules"
    for p in root.glob("*.py"):
        src = p.read_text(encoding="utf-8")
        assert not re.search(r"^\s*(import|from)\s+(google|vertexai|httpx|requests|openai|anthropic)", src, re.M), p
