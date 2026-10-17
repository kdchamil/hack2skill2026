from datetime import date

from app.models import Extraction

TODAY = date(2026, 10, 17)


def L(v, c=0.95):
    return {"value": v, "confidence": c}


def mk(ingredients=None, contains="", may="", claims=None, nutrition=None, serving=None, dates=None,
       marks=None, codes=None, verbatim=None, missing=None, ing_conf=0.95, **extra) -> Extraction:
    ing_val = ingredients
    d = {
        "name": L("Test"), "brand": L("Brand"), "category": L("food"), "label_languages": ["en"],
        "ingredients_verbatim": L(verbatim if verbatim is not None else (", ".join(ing_val) if ing_val else None), ing_conf),
        "ingredients": L(ing_val, ing_conf),
        "allergen_contains_statement": L(contains or None), "allergen_may_contain_statement": L(may or None),
        "nutrition": L(nutrition if nutrition is not None else []), "serving_size_g": L(serving),
        "claims": L(claims or []), "dates": L(dates or []),
        "batch_lot": L(None, 0.0), "manufacturer": L(None, 0.0), "origin": L(None, 0.0),
        "certification_marks": L(marks or []), "packaging_codes": L(codes or []),
        "barcode": None, "missing_sides": missing or [], "retake_tip": None,
    }
    d.update(extra)
    return Extraction.model_validate(d)


def nut(**kw):
    """nut(sodium_mg=800, sugars_total=3) -> list of NutrientRow dicts (per 100 g)."""
    units = {"energy_kcal": "kcal", "sodium_mg": "mg"}
    return [{"nutrient": k, "per_100g": v, "per_serving": None, "unit": units.get(k, "g")} for k, v in kw.items()]


def card(a, cid):
    return next(c for c in a.cards if c.id == cid)


def area(a, aid):
    return next(x for x in a.areas if x.id == aid)
