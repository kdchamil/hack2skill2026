import pytest

from app.rules import analyze
from app.rules.claims import classify_kind
from tests.rules.helpers import TODAY, area, mk, nut


def claim(ext):
    a = analyze(ext, today=TODAY)
    fs = [f for f in a.findings if f.topic == "claims" and f.area == "truth" and f.card is None]
    return fs[0], a


def test_sugar_free_contradicted_by_dextrose():
    f, a = claim(mk(["Wheat flour", "Maltitol (E965)", "Dextrose"], claims=["Sugar free"]))
    assert f.data["verdict"] == "contradicted" and f.severity == "check" and "dextrose" in f.reason
    assert "laxative" in f.reason and "not sugars" in f.reason
    assert area(a, "truth").status == "check" and "contradicted" in area(a, "truth").headline


def test_sugar_free_contradicted_by_nutrition():
    f, _ = claim(mk(["Water", "Flavour"], claims=["Sugar-free"], nutrition=nut(sugars_total=3.0)))
    assert f.data["verdict"] == "contradicted" and "3 g" in f.reason


def test_sugar_free_supported():
    f, _ = claim(mk(["Water", "Sucralose (E955)"], claims=["Zero sugar"], nutrition=nut(sugars_total=0.1)))
    assert f.data["verdict"] == "supported"


def test_sugar_free_unknown_ingredients_unverifiable():
    f, _ = claim(mk(None, claims=["Sugar free"], ing_conf=0.2))
    assert f.data["verdict"] == "unverifiable"


def test_no_added_sugar():
    f, _ = claim(mk(["Water", "Glucose syrup"], claims=["No added sugar"]))
    assert f.data["verdict"] == "contradicted"
    f, _ = claim(mk(["Water", "Oats"], claims=["No added sugars"]))
    assert f.data["verdict"] == "supported"
    f, _ = claim(mk(["Water", "Zorblax"], claims=["Unsweetened"]))
    assert f.data["verdict"] == "unverifiable"


@pytest.mark.parametrize("ings,verdict", [
    (["Salt", "Flavour enhancer (E621)"], "contradicted"),
    (["Salt", "Monosodium glutamate"], "contradicted"),
    (["Salt", "Yeast extract"], "unsupported"),
    (["Salt", "Sugar"], "supported"),
])
def test_msg(ings, verdict):
    f, _ = claim(mk(ings, claims=["No added MSG"]))
    assert f.data["verdict"] == verdict


def test_msg_unknown_ingredients():
    f, _ = claim(mk(None, claims=["No MSG"], ing_conf=0.1))
    assert f.data["verdict"] == "unverifiable"


def test_diet_based_claims():
    assert claim(mk(["Milk"], claims=["Vegan"]))[0].data["verdict"] == "contradicted"
    assert claim(mk(["Rice"], claims=["Vegan"]))[0].data["verdict"] == "supported"
    assert claim(mk(["Rice", "Zorb"], claims=["Vegetarian"]))[0].data["verdict"] == "unverifiable"
    assert claim(mk(["Wheat"], claims=["Gluten free"]))[0].data["verdict"] == "contradicted"
    assert claim(mk(["Milk"], claims=["Lactose free"]))[0].data["verdict"] == "supported"
    f, _ = claim(mk(["Wheat"], claims=["Gluten-free"]))
    assert f.next_step.endswith("Check with a professional.")


def test_dairy_free():
    assert claim(mk(["Milk"], claims=["Dairy free"]))[0].data["verdict"] == "contradicted"
    assert claim(mk(["Rice"], claims=["Dairy free"]))[0].data["verdict"] == "supported"
    assert claim(mk(["Rice"], may="may contain milk", claims=["Dairy free"]))[0].data["verdict"] == "unsupported"
    assert claim(mk(None, claims=["Dairy free"], ing_conf=0))[0].data["verdict"] == "unverifiable"


def test_no_preservatives_and_natural():
    assert claim(mk(["Water", "Sodium benzoate (E211)"], claims=["No preservatives"]))[0].data["verdict"] == "contradicted"
    assert claim(mk(["Water"], claims=["Preservative free"]))[0].data["verdict"] == "supported"
    assert claim(mk(["Water", "Tartrazine"], claims=["100% Natural"]))[0].data["verdict"] == "unsupported"
    assert claim(mk(["Water", "Salt"], claims=["All natural"]))[0].data["verdict"] == "unverifiable"
    assert claim(mk(None, claims=["No preservatives"], ing_conf=0))[0].data["verdict"] == "unverifiable"


def test_unknown_claim_unverifiable_inferred():
    f, _ = claim(mk(["Water"], claims=["Hand-crafted by monks"]))
    assert f.data["verdict"] == "unverifiable" and f.tier == "inferred" and f.severity == "info"
    assert classify_kind("වීගන්")[0] == "other"


def test_no_claims_headline():
    a = analyze(mk(["Water"]), today=TODAY)
    assert area(a, "truth").headline.startswith("No claims read")
    assert not [f for f in a.findings if f.topic == "claims"]


def test_unsupported_and_checked_headlines():
    a = analyze(mk(["Water", "Tartrazine"], claims=["Natural"]), today=TODAY)
    assert area(a, "truth").headline.startswith("1 claim not fully supported")
    b = analyze(mk(["Rice"], claims=["Vegan"]), today=TODAY)
    assert area(b, "truth").headline.startswith("1 claim checked")
