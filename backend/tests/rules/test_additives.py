import pytest

from app.rules import analyze
from app.rules.additives import add_data, summarise
from app.rules.ingredients import additive_lookup, build_info
from tests.rules.helpers import TODAY, mk


def codes(ext):
    return summarise(build_info(ext)).codes


def test_dictionary_has_required_entries():
    ad = add_data()
    assert len(ad) >= 60
    for c in ["E330", "E322", "E471", "E621", "E627", "E631", "E950", "E951", "E955", "E965", "E420", "E211",
              "E250", "E102", "E110", "E129"]:
        assert c in ad
        for k in ("name", "function", "status", "context", "risk"):
            assert ad[c][k]
    assert ad["E621"]["risk"] == ad["E951"]["risk"] == ad["E102"]["risk"] == "debated"
    assert ad["E330"]["risk"] == "no_known_concern"
    assert "Codex GSFA" in ad["E330"]["status"]


def test_code_and_name_detection():
    assert codes(mk(["Acidity regulator (E330)"])) == ["E330"]
    assert codes(mk(["Citric acid", "INS 211", "e-471"])) == ["E330", "E211", "E471"]
    assert "E621" in codes(mk(["Monosodium glutamate"]))
    assert "E322" in codes(mk(["Emulsifier (Soy Lecithin)"]))


def test_subletter_fallback():
    assert additive_lookup("e150d") == "E150D".replace("D", "d")
    assert additive_lookup("e160") == "E160a"
    assert additive_lookup("e9999") is None


def test_unknown_e_code_is_unresolved():
    a = analyze(mk(["Water", "Colour (E999)"]), today=TODAY)
    assert "Colour (E999)" in a.unresolved_terms


def test_processing_levels():
    assert summarise(build_info(mk(["Peanuts", "Salt"]))).level == "minimally processed"
    assert summarise(build_info(mk(["a", "b", "c", "d", "e", "f", "g"]))).level == "processed"
    assert summarise(build_info(mk(["Sugar", "Emulsifier (E471)"]))).level == "processed"
    s = summarise(build_info(mk(["Sugar", "Maltodextrin", "Flavour enhancer (E621)", "Colour (E102)"])))
    assert s.level == "ultra-processed (estimate)" and s.ingredient_count == 4


def test_additive_findings_label_stated_with_sources():
    a = analyze(mk(["Flavour enhancer (E621)"]), today=TODAY)
    f = next(x for x in a.findings if x.id == "additive.e621")
    assert f.tier == "label_stated" and f.risk == "debated" and f.card == "ingredients"
    labels = [s.label for s in f.sources]
    assert "Rule pack 2026.10.17-1" in labels and "Pack label" in labels and "Codex GSFA" in labels


def test_ingredients_unreadable_finding():
    a = analyze(mk(None, ing_conf=0.1), today=TODAY)
    assert any(f.id == "ingredients.unreadable" and f.severity == "check" for f in a.findings)
