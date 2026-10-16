"""Allergen detection. Contains (ingredients + contains statement) and May-contain (its own
statement only) are kept strictly separate."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models import Finding

from .ingredients import IngredientInfo, is_allergen_id, scan_allergens
from .taxonomy import ALLERGEN_IDS, ALLERGEN_LABELS, PRO, make_finding, strongest


@dataclass
class AllergenResult:
    contains: dict[str, dict] = field(default_factory=dict)  # id -> {"matched","tier","where"}
    may_contain: dict[str, dict] = field(default_factory=dict)


def _add(store: dict[str, dict], aid: str, matched: str, tier: str, where: str) -> None:
    cur = store.get(aid)
    if cur is None:
        store[aid] = {"matched": matched, "tier": tier, "where": where}
    else:  # several evidence lines: keep the strongest tier, never upgrade beyond what was read
        best = strongest([cur["tier"], tier])
        if best != cur["tier"]:
            cur.update(matched=matched, tier=best, where=where)


def detect(info: IngredientInfo) -> AllergenResult:
    res = AllergenResult()
    for tok in info.tokens:
        for aid, (matched, direct) in tok.allergens.items():
            _add(res.contains, aid, matched, "label_stated" if direct else "inferred", "ingredients")
        if tok.resolved_to and is_allergen_id(tok.resolved_to):
            _add(res.contains, tok.resolved_to, tok.raw, "inferred", "ingredients (resolved)")
    for aid, (matched, direct) in scan_allergens(info.contains_statement).items():
        _add(res.contains, aid, matched, "label_stated" if direct else "inferred", "contains statement")
    for aid, (matched, _direct) in scan_allergens(info.may_statement).items():
        _add(res.may_contain, aid, matched, "label_stated", "may-contain statement")
    return res


def ordered(ids: dict[str, dict]) -> list[str]:
    return [a for a in ALLERGEN_IDS if a in ids]


def findings(res: AllergenResult, info: IngredientInfo) -> list[Finding]:
    out: list[Finding] = []
    for aid in ordered(res.contains):
        d = res.contains[aid]
        label = ALLERGEN_LABELS[aid]
        out.append(make_finding(
            f"allergen.contains.{aid}", "allergens", "allergen_contains", "check", "allergen", d["tier"],
            f"Contains {label}",
            f"Matched \"{d['matched']}\" in the {d['where']}.",
            f"Consider avoiding this product if you react to {label}." + PRO,
            {"allergen": aid, "matched": d["matched"], "where": d["where"]},
        ))
    for aid in ordered(res.may_contain):
        d = res.may_contain[aid]
        label = ALLERGEN_LABELS[aid]
        out.append(make_finding(
            f"allergen.may_contain.{aid}", "allergens", "allergen_may_contain", "info", "allergen", d["tier"],
            f"May contain {label}",
            f"The pack's may-contain statement mentions \"{d['matched']}\".",
            f"Consider this if you react to traces of {label}." + PRO,
            {"allergen": aid, "matched": d["matched"], "where": d["where"]},
        ))
    if not info.known:
        out.append(make_finding(
            "allergen.ingredients_unknown", "allergens", "allergen_contains", "check", "allergen", "unknown",
            "Ingredients could not be read",
            "The ingredient list was not legible, so allergens may be missing from this result.",
            "Turn to the ingredient side and retake the photo." + PRO,
            {"retake": "ingredients"}, label_read=False,
        ))
    elif not res.contains and not res.may_contain:
        out.append(make_finding(
            "allergen.none_found", "allergens", "allergen_contains", "info", "no_known_concern", "inferred",
            "None found in what we could read",
            "No listed allergens were matched in the ingredients or statements we could read.",
            "Consider checking the pack yourself if you have an allergy." + PRO,
            {},
        ))
    return out
