import pytest

from app.rules import analyze
from app.rules.nutrition import compute, level, salt_g_from_sodium_mg, sodium_mg_from_salt_g, NRV
from tests.rules.helpers import TODAY, area, card, mk, nut


@pytest.mark.parametrize("nutrient,value,expected", [
    ("sugars_total", 22.6, "high"), ("sugars_total", 22.5, "medium"), ("sugars_total", 5, "low"), ("sugars_total", 5.1, "medium"),
    ("fat_saturated", 5.1, "high"), ("fat_saturated", 5, "medium"), ("fat_saturated", 1.5, "low"),
    ("sodium_mg", 601, "high"), ("sodium_mg", 600, "medium"), ("sodium_mg", 120, "low"), ("sodium_mg", None, "unknown"),
])
def test_fsa_levels(nutrient, value, expected):
    assert level(nutrient, value) == expected


def test_salt_sodium_conversion():
    assert salt_g_from_sodium_mg(1000) == pytest.approx(2.5)
    assert sodium_mg_from_salt_g(1.5) == pytest.approx(600)


def test_salt_only_label_converted_and_inferred():
    r = compute(mk(["a"], nutrition=nut(salt_g=2.5)))
    assert r.per100["sodium_mg"] == pytest.approx(1000) and r.levels["sodium"] == "high"
    a = analyze(mk(["a"], nutrition=nut(salt_g=2.5)), today=TODAY)
    f = next(x for x in a.findings if x.id == "nutrition.sodium")
    assert f.tier == "inferred" and f.data["level"] == "high"
    assert f.next_step.endswith("Check with a professional.")


def test_per_serving_to_per_100g_and_ri():
    rows = [{"nutrient": "sodium_mg", "per_100g": None, "per_serving": 300, "unit": "mg"},
            {"nutrient": "energy_kcal", "per_100g": None, "per_serving": 200, "unit": "kcal"}]
    r = compute(mk(["a"], nutrition=rows, serving=50.0))
    assert r.per100["sodium_mg"] == pytest.approx(600) and r.levels["sodium"] == "medium"
    assert r.pct_ri["sodium_mg"] == pytest.approx(15.0) and "serving" in r.ri_basis
    assert r.pct_ri["energy_kcal"] == pytest.approx(10.0)


def test_per_100g_to_serving():
    r = compute(mk(["a"], nutrition=nut(sugars_total=10), serving=30.0))
    assert r.per_serving["sugars_total"] == pytest.approx(3.0)
    assert r.pct_ri["sugars_total"] == pytest.approx(6.0)


def test_nrv_reference_recorded():
    a = analyze(mk(["a"], nutrition=nut(sodium_mg=100)), today=TODAY)
    assert "Codex NRV (adult)" in a.ri_reference and "2000 mg" in a.ri_reference
    assert NRV["sodium_mg"] == 2000 and NRV["sugars_total"] == 50 and NRV["fat_saturated"] == 20


def test_missing_nutrition():
    a = analyze(mk(["a"]), today=TODAY)
    assert a.facts.nutrient_levels == {"sodium": "unknown", "sugars": "unknown", "fat_saturated": "unknown"}
    assert card(a, "nutrition").headline == "Nutrition not read"
    assert card(a, "nutrition").tier == "unknown" and card(a, "nutrition").grade is None


def test_summary_sentence_and_headline():
    a = analyze(mk(["a"], nutrition=nut(energy_kcal=500, sodium_mg=900, sugars_total=1, fat_saturated=1)), today=TODAY)
    s = next(f for f in a.findings if f.id == "nutrition.summary")
    assert s.reason.startswith("Per 100 g: 500 kcal") and "sodium 900 mg (high)" in s.reason
    assert card(a, "nutrition").headline == "High in sodium" and card(a, "nutrition").status == "check"
    b = analyze(mk(["a"], nutrition=nut(sodium_mg=10, sugars_total=1, fat_saturated=1)), today=TODAY)
    assert card(b, "nutrition").headline == "No high nutrient levels found"
    c = analyze(mk(["a"], nutrition=nut(protein=5)), today=TODAY)
    assert card(c, "nutrition").headline == "Nutrition read, levels unknown"
