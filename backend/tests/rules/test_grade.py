import pytest

from app.rules import analyze, grade
from tests.rules.helpers import TODAY, area, card, mk, nut

HEALTH_OK = {"nutrition": "A", "processing": "A", "additives": "A"}


def L(**kw):
    return {"carbon": None, "water_land": None, "packaging": None, **kw}


def test_nutrition_points_and_bands():
    assert grade.grade_nutrition({"energy_kcal": 50, "sugars_total": 1, "fat_saturated": 0.5, "sodium_mg": 20}) == "A"
    assert grade.grade_nutrition({"energy_kcal": 480, "sugars_total": 25, "fat_saturated": 8, "sodium_mg": 400}) == "E"
    assert grade.grade_nutrition({"sugars_total": 9, "fat_saturated": 3, "sodium_mg": 270}) == "C"  # 2+3+3 = 8
    assert grade.nutrition_points({"sugars_total": 100, "fat_saturated": 100, "sodium_mg": 99999}) == 30  # capped


def test_nutrition_needs_three_values():
    assert grade.grade_nutrition({"sugars_total": 1, "sodium_mg": 10}) is None
    assert grade.grade_nutrition({}) is None


def test_processing_bands():
    assert grade.grade_processing(True, 3, 0) == "A"
    assert grade.grade_processing(True, 8, 0) == "B"
    assert grade.grade_processing(True, 12, 0) == "C"
    assert grade.grade_processing(True, 20, 0) == "D"
    assert grade.grade_processing(True, 40, 0) == "E"
    assert grade.grade_processing(True, 3, 1) == "C" and grade.grade_processing(True, 3, 3) == "D"
    assert grade.grade_processing(True, 3, 5) == "E"
    assert grade.grade_processing(False, 3, 0) is None


def test_additives_bands():
    assert grade.grade_additives(True, []) == "A"
    assert grade.grade_additives(True, ["no_known_concern"] * 2) == "B"
    assert grade.grade_additives(True, ["no_known_concern"] * 4) == "C"
    assert grade.grade_additives(True, ["no_known_concern"] * 6) == "D"
    assert grade.grade_additives(True, ["debated"]) == "C"
    assert grade.grade_additives(True, ["debated", "debated"]) == "D"
    assert grade.grade_additives(True, ["restricted"]) == "D"
    assert grade.grade_additives(True, ["prohibited"]) == "E"
    assert grade.grade_additives(False, []) is None


def test_packaging_classes():
    assert grade.grade_packaging(["GL"]) == "A" and grade.grade_packaging(["PET"]) == "B"
    assert grade.grade_packaging(["PP", "PET"]) == "C" and grade.grade_packaging(["PVC", "GL"]) == "E"
    assert grade.grade_packaging([]) is None and grade.grade_packaging(["??"]) is None


def test_overall_thin_data_when_health_card_unknown():
    for missing in HEALTH_OK:
        g = grade.overall(L(**{**HEALTH_OK, missing: None}, packaging="A"))
        assert g.letter is None and g.reason == "thin_data" and g.drivers == []


def test_overall_planet_unknown_left_out_and_partial():
    g = grade.overall(L(**HEALTH_OK))
    assert g.letter == "A" and g.reason is None and g.planet_partial and g.rule_version == "grade-1.0"
    g = grade.overall(L(**HEALTH_OK, packaging="E"))
    assert g.letter == "B" and g.planet_partial  # mean (1+1+1+5)/4 = 2 -> B; carbon/water left out


def test_overall_not_partial_when_all_known():
    g = grade.overall({**HEALTH_OK, "carbon": "A", "water_land": "A", "packaging": "A"})
    assert g.letter == "A" and not g.planet_partial


def test_overall_rounds_toward_worse():
    assert grade.overall(L(nutrition="B", processing="C", additives="C")).letter == "C"  # 2.67 -> 3
    assert grade.overall(L(nutrition="B", processing="B", additives="C", packaging="C")).letter == "C"  # 2.5 -> 3


def test_health_e_caps_at_d():
    g = grade.overall(L(nutrition="E", processing="A", additives="A", packaging="A"))
    assert g.letter == "D" and g.drivers[0] == "nutrition"  # mean 2.0 would be B


def test_planet_e_does_not_cap():
    assert grade.overall(L(**HEALTH_OK, packaging="E")).letter == "B"


def test_drivers_at_most_two_furthest_from_c():
    g = grade.overall(L(nutrition="E", processing="A", additives="C", packaging="B"))
    assert len(g.drivers) == 2 and set(g.drivers) == {"nutrition", "processing"} and g.drivers[0] == "nutrition"
    assert grade.overall(L(nutrition="C", processing="C", additives="C")).drivers == []


def test_end_to_end_grade_and_cards():
    a = analyze(mk(["Rice", "Salt"], nutrition=nut(energy_kcal=350, sugars_total=1, fat_saturated=0.5, sodium_mg=10),
                   codes=["GL 70"]), today=TODAY)
    assert [card(a, c).grade for c in ("nutrition", "processing", "additives", "carbon", "water_land", "packaging")] == \
        ["B", "A", "A", None, None, "A"]
    assert a.grade.letter == "A" and a.grade.planet_partial
    assert card(a, "additives").finding_ids == ["additives.none"] and card(a, "additives").tier == "inferred"


def test_end_to_end_thin_without_nutrition():
    a = analyze(mk(["Rice"]), today=TODAY)
    assert card(a, "nutrition").grade is None and a.grade.letter is None and a.grade.reason == "thin_data"
    assert area(a, "body").headline  # areas still produced


@pytest.mark.parametrize("n", [1, 2])
def test_grade_deterministic(n):
    e = mk(["Sugar", "Flavour enhancer (E621)"], nutrition=nut(energy_kcal=400, sugars_total=30, fat_saturated=6, sodium_mg=700))
    assert analyze(e, today=TODAY).grade == analyze(e, today=TODAY).grade
