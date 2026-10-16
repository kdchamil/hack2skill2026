import pytest

from app.rules import analyze
from app.rules.allergens import detect
from app.rules.ingredients import build_info, scan_allergens
from tests.rules.helpers import TODAY, mk


def contains(ext, **kw):
    return detect(build_info(ext, kw.get("resolved"))).contains


@pytest.mark.parametrize("text,allergen", [
    ("තල (sesame)", "sesame"), ("Gingelly oil", "sesame"), ("எள்", "sesame"), ("芝麻", "sesame"), ("ごま", "sesame"),
    ("तिल", "sesame"), ("wijen", "sesame"),
    ("කජු", "tree_nut"), ("Cashew nuts", "tree_nut"), ("රටකජු", "peanut"), ("Groundnut oil", "peanut"),
    ("நிலக்கடலை", "peanut"), ("花生", "peanut"), ("Wheat flour", "wheat_gluten"), ("Atta", "wheat_gluten"),
    ("Semolina", "wheat_gluten"), ("Maida", "wheat_gluten"), ("whey powder", "milk"), ("Ghee", "milk"),
    ("Casein", "milk"), ("කිරි", "milk"), ("பால்", "milk"), ("अंडा", "egg"),
    ("Soy lecithin", "soy"), ("Prawns", "crustacean"), ("sulphites", "sulphite"), ("E223", "sulphite"),
    ("Mustard seed", "mustard"), ("Buckwheat", "buckwheat"), ("celery", "celery"), ("Lupin flour", "lupin"),
    ("squid", "mollusc"), ("Anchovy", "fish"), ("Egg white", "egg"),
])
def test_synonyms(text, allergen):
    assert allergen in scan_allergens(text)


@pytest.mark.parametrize("text,not_allergen", [
    ("coconut milk", "milk"), ("පොල් කිරි", "milk"), ("cocoa butter", "milk"), ("eggplant", "egg"),
    ("cream of tartar", "milk"), ("nutmeg", "tree_nut"), ("buckwheat", "wheat_gluten"), ("coconut", "tree_nut"),
    ("peanut", "tree_nut"), ("乳化剂", "milk"),
])
def test_no_false_positives(text, not_allergen):
    assert not_allergen not in scan_allergens(text)


def test_bracket_contents_scanned():
    assert "soy" in scan_allergens("Emulsifier (Soy Lecithin)")
    assert "soy" in scan_allergens("Emulsifier [E322 (soy)]")


def test_direct_vs_derived_tier():
    a = analyze(mk(["Whey powder", "Egg"]), today=TODAY)
    byid = {f.id: f for f in a.findings}
    assert byid["allergen.contains.milk"].tier == "inferred"
    assert byid["allergen.contains.egg"].tier == "label_stated"


def test_contains_and_may_contain_separate():
    e = mk(["Sugar", "Wheat flour"], contains="Contains: Wheat", may="May contain traces of milk and nuts")
    a = analyze(e, today=TODAY)
    assert a.facts.allergens_contains == ["wheat_gluten"]
    assert a.facts.allergens_may_contain == ["tree_nut", "milk"]
    ids = {f.id for f in a.findings}
    assert "allergen.may_contain.milk" in ids and "allergen.contains.milk" not in ids


def test_contains_statement_only_adds_contains():
    a = analyze(mk(["Sugar"], contains="Contains: Sesame"), today=TODAY)
    assert a.facts.allergens_contains == ["sesame"]
    assert a.facts.allergens_may_contain == []


def test_may_contain_inside_list_stays_may():
    a = analyze(mk(["Sugar", "May contain traces of peanut"]), today=TODAY)
    assert a.facts.allergens_may_contain == ["peanut"]
    assert a.facts.allergens_contains == []


def test_verbatim_fallback_splits_statements():
    e = mk(None, verbatim="Sugar, Wheat Flour (gluten), Salt. Contains: Soy. May contain egg")
    e = e.model_copy(update={"ingredients": e.ingredients.model_copy(update={"value": None})})
    a = analyze(e, today=TODAY)
    assert a.facts.ingredients_known
    assert "wheat_gluten" in a.facts.allergens_contains and "soy" in a.facts.allergens_contains
    assert a.facts.allergens_may_contain == ["egg"]


def test_none_found_finding():
    a = analyze(mk(["Water", "Salt"]), today=TODAY)
    assert any(f.id == "allergen.none_found" for f in a.findings)
    assert "None found" in a.cards[0].headline


def test_unknown_ingredients():
    a = analyze(mk(None, ing_conf=0.3), today=TODAY)
    assert not a.facts.ingredients_known
    assert a.cards[0].headline == "Ingredients unreadable — check the pack"
    assert a.cards[0].status == "check"
    assert "retake:ingredients" in a.banners


def test_resolved_terms_applied():
    e = mk(["Sugar", "Gajar halwa mix", "Rare kernel"])
    first = analyze(e, today=TODAY)
    assert set(first.unresolved_terms) == {"Gajar halwa mix", "Rare kernel"}
    second = analyze(e, resolved={"rare kernel": "tree_nut", "Gajar halwa mix": "carrot_dessert"}, today=TODAY)
    assert second.unresolved_terms == []
    assert "tree_nut" in second.facts.allergens_contains
    assert "carrot_dessert" in second.facts.canonical_ingredient_ids
    f = next(x for x in second.findings if x.id == "allergen.contains.tree_nut")
    assert f.tier == "inferred"


def test_allergen_next_step_professional():
    a = analyze(mk(["Egg"]), today=TODAY)
    f = next(x for x in a.findings if x.id == "allergen.contains.egg")
    assert f.next_step and f.next_step.endswith("Check with a professional.")
