"""Six cards, household facts and banners."""

from __future__ import annotations

from app.models import Card, Finding, HouseholdFacts

from .additives import AdditiveSummary
from .allergens import AllergenResult, ordered
from .diets import DietResult
from .ingredients import IngredientInfo
from .nutrition import NutritionResult
from .taxonomy import ALLERGEN_LABELS, CARD_ORDER, DIETS, weakest, worst

UNREADABLE = "Ingredients unreadable — check the pack"


def _cap(text: str, n: int = 12) -> str:
    words = text.split()
    return text if len(words) <= n else " ".join(words[:n])


def _allergen_headline(al: AllergenResult, info: IngredientInfo) -> str:
    if not info.known:
        return UNREADABLE
    c = [ALLERGEN_LABELS[a] for a in ordered(al.contains)]
    m = [ALLERGEN_LABELS[a] for a in ordered(al.may_contain)]
    parts = []
    if c:
        parts.append("Contains " + ", ".join(c[:4]) + (" and more" if len(c) > 4 else ""))
    if m:
        parts.append("may contain " + ", ".join(m[:3]) + (" and more" if len(m) > 3 else ""))
    if not parts:
        return "None found in what we could read"
    h = "; ".join(parts)
    return h[0].upper() + h[1:]


def _nutrition_headline(n: NutritionResult) -> str:
    if not n.has_data:
        return "Nutrition not read"
    highs = [k.replace("_", " ").replace("fat saturated", "saturated fat") for k, v in n.levels.items() if v == "high"]
    if highs:
        return "High in " + ", ".join(highs)
    if all(v == "unknown" for v in n.levels.values()):
        return "Nutrition read, levels unknown"
    return "No high nutrient levels found"


def _diet_headline(d: dict[str, DietResult]) -> str:
    known = [f"{k.replace('_', ' ')} {v.value}" for k, v in d.items() if v.value != "unknown"]
    if not known:
        return "Diet suitability unknown from this label"
    return "Diet: " + ", ".join(known[:3])


def _ingredients_headline(info: IngredientInfo, s: AdditiveSummary) -> str:
    if not info.known:
        return "Ingredients not read"
    return f"{s.ingredient_count} ingredients, {len(s.codes)} additives; {s.level}"


def _claims_headline(findings: list[Finding]) -> str:
    cl = [f for f in findings if f.card == "claims"]
    if not cl:
        return "No claims read"
    bad = [f for f in cl if f.data.get("verdict") == "contradicted"]
    if bad:
        return f"{len(bad)} claim{'s' if len(bad) > 1 else ''} contradicted by the label"
    weak = [f for f in cl if f.data.get("verdict") == "unsupported"]
    if weak:
        return f"{len(weak)} claim{'s' if len(weak) > 1 else ''} not fully supported"
    return f"{len(cl)} claim{'s' if len(cl) > 1 else ''} checked"


def _packaging_headline(findings: list[Finding]) -> str:
    dates = [f for f in findings if f.category == "date"]
    if any(f.severity == "avoid" for f in dates):
        return "Date on the pack has passed"
    if any(f.severity == "check" for f in dates):
        return "Date on the pack is close"
    codes = [f for f in findings if f.id.startswith("packaging.code.") and f.id != "packaging.code.none"]
    if codes:
        mat = codes[0].data["material"]
        mat = mat[mat.index("(") + 1:-1].lower() if "(" in mat else mat
        return f"{codes[0].data['code']} {mat}; carbon: no data"
    return "No recycling code read; carbon: no data"


def build_cards(findings: list[Finding], headlines: dict[str, str]) -> list[Card]:
    cards: list[Card] = []
    for cid in CARD_ORDER:
        fs = [f for f in findings if f.card == cid]
        key = [f for f in fs if f.category != "carbon"] or fs  # carbon is always unknown; not a key finding
        cards.append(Card(
            id=cid, status=worst([f.severity for f in fs]),  # type: ignore[arg-type]
            tier=weakest([f.tier for f in key]), headline=_cap(headlines[cid]),
            finding_ids=[f.id for f in fs]))
    return cards


def headlines_for(findings: list[Finding], al: AllergenResult, info: IngredientInfo, n: NutritionResult,
                  d: dict[str, DietResult], s: AdditiveSummary) -> dict[str, str]:
    return {
        "allergens": _allergen_headline(al, info), "nutrition": _nutrition_headline(n),
        "diet": _diet_headline(d), "ingredients": _ingredients_headline(info, s),
        "claims": _claims_headline(findings), "packaging": _packaging_headline(findings),
    }


def build_facts(al: AllergenResult, info: IngredientInfo, d: dict[str, DietResult],
                n: NutritionResult) -> HouseholdFacts:
    ids: set[str] = set(al.contains)
    for t in info.tokens:
        ids.update(t.allergens)
        ids.update(c.lower() for c in t.additives)
        ids.update(t.common)
        if t.resolved_to:
            ids.add(t.resolved_to)
    return HouseholdFacts(
        allergens_contains=ordered(al.contains), allergens_may_contain=ordered(al.may_contain),
        ingredients_known=info.known, diets={k: d[k].value for k in DIETS},  # type: ignore[misc]
        nutrient_levels=dict(n.levels),  # type: ignore[arg-type]
        canonical_ingredient_ids=sorted(ids),
    )

