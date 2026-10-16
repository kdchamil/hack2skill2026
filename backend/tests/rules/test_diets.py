import pytest

from app.rules import analyze
from app.rules.diets import parse_marks, registry_match
from tests.rules.helpers import TODAY, mk


def diets(ext):
    return analyze(ext, today=TODAY).facts.diets


def finding(a, fid):
    return next(f for f in a.findings if f.id == fid)


def test_vegan_no_for_gelatin_and_carmine():
    assert diets(mk(["Sugar", "Gelatin"]))["vegan"] == "no"
    assert diets(mk(["Sugar", "Colour (E120)"]))["vegetarian"] == "no"
    assert diets(mk(["Sugar", "Lard"]))["vegetarian"] == "no"


def test_vegetarian_allows_milk_egg():
    d = diets(mk(["Milk powder", "Egg", "Honey"]))
    assert d["vegan"] == "no" and d["vegetarian"] == "yes"


def test_vegan_yes_inferred_and_label_stated():
    a = analyze(mk(["Water", "Oats"]), today=TODAY)
    assert finding(a, "diet.vegan").tier == "inferred"
    b = analyze(mk(["Water", "Salt"], marks=["vegan:V-Label"]), today=TODAY)
    assert finding(b, "diet.vegan").tier == "label_stated"


def test_vegan_unknown_with_unresolved_terms():
    assert diets(mk(["Water", "Zorblax"]))["vegan"] == "unknown"


def test_gluten_and_lactose():
    d = diets(mk(["Wheat flour", "Whey"]))
    assert d["gluten_free"] == "no" and d["lactose_free"] == "no"
    d = diets(mk(["Rice", "Salt"]))
    assert d["gluten_free"] == "yes" and d["lactose_free"] == "yes"
    d = diets(mk(["Rice"], may="may contain wheat and milk"))
    assert d["gluten_free"] == "unknown" and d["lactose_free"] == "unknown"
    assert diets(mk(["Milk"], claims=["Lactose free"]))["lactose_free"] == "yes"


def test_halal_verified_with_registry():
    for body in ["HAC Sri Lanka", "JAKIM", "MUIS", "hac"]:
        a = analyze(mk(["Wheat flour"], marks=[f"halal:{body}"]), today=TODAY)
        f = finding(a, "diet.halal")
        assert f.tier == "verified" and a.facts.diets["halal"] == "yes"


def test_halal_mark_not_in_registry_is_label_stated():
    a = analyze(mk(["Wheat flour"], marks=["halal:Totally Real Body"]), today=TODAY)
    f = finding(a, "diet.halal")
    assert f.tier == "label_stated" and "not registry-checked" in f.reason


def test_halal_no_mark_inference():
    a = analyze(mk(["Flour", "Lard"]), today=TODAY)
    assert a.facts.diets["halal"] == "no" and finding(a, "diet.halal").tier == "inferred"
    a = analyze(mk(["Wheat flour", "Sugar"]), today=TODAY)
    assert a.facts.diets["halal"] == "unknown"
    assert "No certification mark" in finding(a, "diet.halal").reason
    assert analyze(mk(["Sugar", "Rum"]), today=TODAY).facts.diets["halal"] == "no"
    assert analyze(mk(["Sugar", "Gelatine"]), today=TODAY).facts.diets["halal"] == "no"


def test_halal_mark_conflicting_with_pork_never_verified():
    a = analyze(mk(["Pork fat"], marks=["halal:JAKIM"]), today=TODAY)
    f = finding(a, "diet.halal")
    assert f.tier == "inferred" and a.facts.diets["halal"] == "unknown"


def test_kosher():
    assert analyze(mk(["Sugar"], marks=["kosher:OU"]), today=TODAY).facts.diets["kosher"] == "yes"
    assert finding(analyze(mk(["Sugar"], marks=["kosher:OU"]), today=TODAY), "diet.kosher").tier == "verified"
    assert diets(mk(["Prawn"]))["kosher"] == "no"
    assert diets(mk(["Beef", "Cheese"]))["kosher"] == "no"
    assert diets(mk(["Sugar"]))["kosher"] == "unknown"


def test_unknown_ingredients_all_unknown_tier_unknown():
    a = analyze(mk(None, ing_conf=0.2), today=TODAY)
    assert set(a.facts.diets.values()) == {"unknown"}
    assert all(finding(a, f"diet.{d}").tier == "unknown" for d in a.facts.diets)


def test_registry_helpers():
    assert registry_match("halal", "Muis") == "MUIS"
    assert registry_match("halal", "nope") is None
    assert parse_marks(mk(["a"], marks=["halal:JAKIM", "vegan:V-Label", "halal"])) == {
        "halal": ["JAKIM", ""], "vegan": ["V-Label"]}


def test_oats_not_allergen_but_gluten_free_unknown():
    a = analyze(mk(["Water", "Oats"]), today=TODAY)
    assert "wheat_gluten" not in a.facts.allergens_contains
    f = finding(a, "diet.gluten_free")
    assert f.data["value"] == "unknown" and f.tier == "inferred"
    assert "Oats may contain gluten unless certified gluten-free" in f.reason
    assert a.facts.diets["gluten_free"] == "unknown"
    b = analyze(mk(["Water", "Oats"], marks=["gluten_free:GF"]), today=TODAY)
    assert b.facts.diets["gluten_free"] == "yes"
    c = analyze(mk(["Water", "Wheat flour", "Oats"]), today=TODAY)
    assert c.facts.diets["gluten_free"] == "no"
