import re

from hypothesis import HealthCheck, given, settings, strategies as st

from app.models import Extraction
from app.rules import analyze
from app.rules.taxonomy import ALLERGEN_IDS, TIER_ORDER
from tests.rules.helpers import TODAY, area, card, mk, nut

settings.register_profile("rules", max_examples=60, deadline=None, suppress_health_check=[HealthCheck.too_slow])
settings.load_profile("rules")

WORDS = ["sugar", "wheat flour", "milk", "egg", "තල", "எள்", "peanut", "E621", "E330", "gelatin", "lard", "water",
         "soy lecithin", "ghee", "salt", "dextrose", "E999", "prawn", "ごま", "Zorblax", "(", ")", "May contain milk"]
txt = st.text(max_size=60)
token = st.one_of(st.sampled_from(WORDS), txt)
conf = st.floats(0, 1, allow_nan=False)
CLAIMS = ["Sugar free", "No added MSG", "Vegan", "Natural", "Gluten free", "No added sugar", "Lactose free"]
DATES = ["12 OCT 2026", "05/09/2026", "10/2026", "2026-10-19", "garbage", "31/02/2026", "කල් ඉකුත් 01.01.2020"]
MARKS = ["halal:HAC Sri Lanka", "halal:Fake", "kosher:OU", "vegan:V-Label", "gluten_free:X", "weird", ""]


@st.composite
def extractions(draw):
    ings = draw(st.lists(token, max_size=10))
    return mk(
        ings, contains=draw(txt), may=draw(txt), claims=draw(st.lists(st.one_of(st.sampled_from(CLAIMS), txt), max_size=3)),
        nutrition=nut(**draw(st.dictionaries(st.sampled_from(["sodium_mg", "sugars_total", "fat_saturated", "protein", "salt_g"]),
                                              st.floats(0, 5000, allow_nan=False), max_size=4))),
        serving=draw(st.one_of(st.none(), st.floats(0, 500, allow_nan=False))),
        dates=[{"kind": "best_before", "raw": d, "iso": None} for d in draw(st.lists(st.sampled_from(DATES) | txt, max_size=2))],
        marks=draw(st.lists(st.sampled_from(MARKS), max_size=2)),
        codes=draw(st.lists(st.sampled_from(["PP 5", "PET 1", "C/PAP 84", "xx"]) | txt, max_size=2)),
        ing_conf=draw(conf),
    )


@given(extractions())
def test_analyze_never_raises_and_shape(e):
    a = analyze(e, today=TODAY)
    assert [c.id for c in a.cards] == ["nutrition", "processing", "additives", "carbon", "water_land", "packaging"]
    assert [x.id for x in a.areas] == ["body", "planet", "people", "truth", "choice"]
    assert all(len(c.headline.split()) <= 12 for c in [*a.cards, *a.areas])
    assert all(f.area and f.topic for f in a.findings)
    assert (a.grade.letter is None) == (a.grade.reason == "thin_data")
    if a.grade.letter:
        assert all(c.grade for c in a.cards if c.id in ("nutrition", "processing", "additives"))
    assert set(a.facts.allergens_contains) <= set(ALLERGEN_IDS)
    assert set(a.facts.diets) == {"vegan", "vegetarian", "gluten_free", "lactose_free", "halal", "kosher"}
    ids = [f.id for f in a.findings]
    assert len(ids) == len(set(ids))
    assert not re.search(r"\bsafe", " ".join(f.title + f.reason + (f.next_step or "") for f in a.findings).lower())
    Extraction.model_validate(a.product.model_dump())


@given(txt, txt)
def test_arbitrary_text_in_statements(contains, may):
    analyze(mk(["Water"], contains=contains, may=may), today=TODAY)


@given(extractions())
def test_unknown_ingredients_force_not_known(e):
    unknown = e.model_copy(update={
        "ingredients": e.ingredients.model_copy(update={"value": None, "confidence": 0.1}),
        "ingredients_verbatim": e.ingredients_verbatim.model_copy(update={"value": None, "confidence": 0.1})})
    a = analyze(unknown, today=TODAY)
    assert a.facts.ingredients_known is False
    assert "retake:ingredients" in a.banners
    assert area(a, "body").headline.startswith("Ingredients unreadable — check the pack") and area(a, "body").status in ("check", "avoid")
    assert a.grade.letter is None and a.grade.reason == "thin_data"
    assert all(v in ("unknown", "yes", "no") for v in a.facts.diets.values())


@given(st.lists(st.sampled_from(["milk", "egg", "Sesame", "peanut", "wheat", "Sugar"]), max_size=5),
       st.lists(st.sampled_from(["milk", "egg", "sesame", "peanut", "wheat", "soy"]), max_size=5))
def test_contains_never_merged_with_may_contain(ing, may):
    a = analyze(mk(ing or ["Water"], may="May contain " + ", ".join(may)), today=TODAY)
    # may-contain statement alone never creates a contains allergen
    from app.rules.ingredients import scan_allergens
    from_ing = set(scan_allergens(", ".join(ing or ["Water"])))
    assert set(a.facts.allergens_contains) == from_ing
    assert set(a.facts.allergens_may_contain) == set(scan_allergens(", ".join(may)))


@given(extractions())
def test_tiers_never_upgraded(e):
    a = analyze(e, today=TODAY)
    has_registry_mark = any(m.startswith(("halal:HAC", "kosher:OU")) for m in (e.certification_marks.value or []))
    for f in a.findings:
        if f.tier == "verified":
            assert f.category == "diet" and f.id in ("diet.halal", "diet.kosher") and has_registry_mark
        if f.category == "carbon":
            assert f.tier == "unknown"
        if f.category == "claim":
            assert f.tier == "inferred"
    for c in a.cards:
        fs = [f for f in a.findings if f.card == c.id and not f.data.get("placeholder")] or [f for f in a.findings if f.card == c.id]
        if fs:
            assert TIER_ORDER[c.tier] == min(TIER_ORDER[f.tier] for f in fs)


@given(extractions())
def test_resolved_only_adds_information(e):
    base = analyze(e, today=TODAY)
    r = analyze(e, resolved={t: "tree_nut" for t in base.unresolved_terms}, today=TODAY)
    assert r.unresolved_terms == []
    assert set(base.facts.allergens_contains) <= set(r.facts.allergens_contains)
