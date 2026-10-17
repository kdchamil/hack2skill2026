from app.rules import analyze, load_fixture
from app.rules.areas import clarity
from app.rules.ranges import match_range, ranges
from tests.rules.helpers import TODAY, area, mk


def f(a, fid):
    return next(x for x in a.findings if x.id == fid)


def test_five_areas_in_order_with_cards():
    a = analyze(mk(["Rice"]), today=TODAY)
    assert [x.id for x in a.areas] == ["body", "planet", "people", "truth", "choice"]
    assert area(a, "body").card_ids == ["nutrition", "processing", "additives"]
    assert area(a, "planet").card_ids == ["carbon", "water_land", "packaging"]
    assert area(a, "choice").finding_ids == [] and area(a, "choice").card_ids == []
    assert all(len(x.headline.split()) <= 12 for x in a.areas)


def test_honest_unknowns():
    a = analyze(mk(["Rice"]), today=TODAY)
    assert f(a, "recalls.unknown").title == "No recall data for your market" and f(a, "recalls.unknown").area == "body"
    for fid in ("labour.unknown", "sourcing.unknown", "animal_welfare.unknown", "water_land.unknown", "authenticity.unknown"):
        assert f(a, fid).tier == "unknown"
    assert "A barcode cannot prove a product is genuine" in f(a, "authenticity.unknown").reason
    assert area(a, "people").tier == "unknown" and area(a, "people").headline == "No labour, sourcing or welfare data"


def test_people_label_stated_only_with_certification_mark():
    a = analyze(mk(["Tea"], marks=["fairtrade:Fairtrade", "rspo:RSPO"]), today=TODAY)
    assert f(a, "labour.label_stated").tier == "label_stated" and f(a, "sourcing.label_stated").tier == "label_stated"
    assert f(a, "animal_welfare.unknown").tier == "unknown"
    assert area(a, "people").tier == "label_stated"
    assert area(a, "people").headline == "Labour, sourcing mark read; animal welfare: no data"


def test_label_clarity_checklist():
    a = analyze(mk(["Rice"]), today=TODAY)
    c = f(a, "label_clarity.checklist")
    assert c.data["checklist"] == {"ingredients": True, "nutrition": False, "manufacturer": False, "expiry": False,
                                   "warnings": False}
    assert c.data["disclosed"] == 1 and c.area == "truth" and c.topic == "label_clarity"
    full = clarity(load_fixture("kokis_sesame_si_en"))
    assert set(full) == {"ingredients", "nutrition", "manufacturer", "expiry", "warnings"}
    assert f(analyze(load_fixture("kokis_sesame_si_en"), today=TODAY), "label_clarity.checklist").severity == "good"


def test_ranges_data_shape():
    rs = ranges()
    assert len(rs) >= 40 and len({r["id"] for r in rs}) == len(rs)
    for r in rs:
        assert set(r["keywords"]) == {"en", "si", "ta"} and r["keywords"]["en"] and r["name"]
    for rid in ("milk_powder", "biscuits", "instant_noodles", "tea", "rice", "cooking_oil", "snacks", "soup",
                "peanut_butter", "plant_milk"):
        assert rid in {r["id"] for r in rs}


def test_match_range_multilingual_and_longest_wins():
    assert match_range("Anchor Full Cream Milk Powder") == "milk_powder"
    assert match_range("Peanut Butter Crunchy") == "peanut_butter"
    assert match_range("Maggi Instant Noodles") == "instant_noodles"
    assert match_range("කිරි පිටි 400g") == "milk_powder"
    assert match_range("தேநீர்") == "tea"
    assert match_range("Hot Pot Chicken Soup") == "soup"
    assert match_range("zzz qqq") is None and match_range(None) is None


def test_product_range_on_analysis():
    assert analyze(load_fixture("vegan_oat_drink"), today=TODAY).product_range == "plant_milk"
    assert analyze(load_fixture("blurred_label"), today=TODAY).product_range is None
