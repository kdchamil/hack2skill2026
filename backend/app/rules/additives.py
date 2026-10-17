"""Additive lookup, processing-level estimate, ingredient count."""

from __future__ import annotations

from dataclasses import dataclass

from app.models import Finding, Source

from .ingredients import IngredientInfo, _matchers
from .taxonomy import make_finding


@dataclass
class AdditiveSummary:
    codes: list[str]
    industrial_ingredients: list[str]
    marker_count: int
    level: str
    ingredient_count: int


def add_data() -> dict:
    return _matchers()["add_data"]  # type: ignore[return-value]


def summarise(info: IngredientInfo) -> AdditiveSummary:
    ad = add_data()
    cd = _matchers()["common_data"]
    codes = info.additive_codes()
    industrial: list[str] = []
    for t in info.tokens:
        for cid, matched in t.common.items():
            if cd[cid]["industrial"] and matched not in industrial:  # type: ignore[index]
                industrial.append(matched)
    markers = [c for c in codes if ad[c]["marker"]]
    score = len(markers) + len(industrial)
    n = len(info.tokens)
    if score >= 3:
        level = "ultra-processed (estimate)"
    elif score >= 1 or n > 5:
        level = "processed"
    else:
        level = "minimally processed"
    return AdditiveSummary(codes, industrial, score, level, n)


def findings(info: IngredientInfo) -> list[Finding]:
    ad = add_data()
    out: list[Finding] = []
    if not info.known:
        out.append(make_finding(
            "ingredients.unreadable", "ingredients", "ingredients_unknown", "check", "no_known_concern", "unknown",
            "Ingredients could not be read",
            "The ingredient list was not legible, so additives and processing level cannot be estimated.",
            "Turn to the ingredient side and retake the photo.", {"retake": "ingredients"}, label_read=False))
        return out
    s = summarise(info)
    for code in s.codes:
        a = ad[code]
        risk = a["risk"]
        out.append(make_finding(
            f"additive.{code.lower()}", "ingredients", "additive", "info", risk, "label_stated",
            f"{code} {a['name']} ({a['function']})",
            a["context"],
            "Consider reading more about this additive if it matters to you." if risk != "no_known_concern" else None,
            {"code": code, "name": a["name"], "function": a["function"], "status": a["status"], "risk": risk},
            extra_sources=[Source(label="Codex GSFA", url="https://www.fao.org/gsfaonline/")],
        ))
    if not s.codes:
        out.append(make_finding(
            "additives.none", "ingredients", "additives_none", "good", "no_known_concern", "inferred",
            "No additives found", "No E-number or additive name was found in the ingredient list we could read."))
    out.append(make_finding(
        "ingredients.processing", "ingredients", "processing", "info", "no_known_concern", "inferred",
        f"Processing level: {s.level}",
        f"Estimated from {len(s.codes)} additive(s) and {len(s.industrial_ingredients)} industrial ingredient(s); this is a rough guide, not a classification.",
        None,
        {"level": s.level, "additives": s.codes, "industrial_ingredients": s.industrial_ingredients, "score": s.marker_count},
        label_read=False))
    out.append(make_finding(
        "ingredients.count", "ingredients", "ingredient_count", "info", "no_known_concern", "label_stated",
        f"{s.ingredient_count} ingredients listed", f"The ingredient list has {s.ingredient_count} entries.", None,
        {"count": s.ingredient_count}))
    if info.unresolved:
        out.append(make_finding(
            "ingredients.unresolved", "ingredients", "unresolved", "info", "no_known_concern", "unknown",
            f"{len(info.unresolved)} term(s) not recognised",
            "Some ingredient terms are not in the bundled dictionaries, so they were not classified.",
            None, {"count": len(info.unresolved)}, label_read=False))
    return out
