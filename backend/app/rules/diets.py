"""Diet suitability from ingredients and certification marks."""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

from app.models import Extraction, Finding, Source

from .allergens import AllergenResult
from .ingredients import IngredientInfo
from .taxonomy import DIETS, load_json, make_finding, normalize


@dataclass
class DietResult:
    value: str  # yes | no | unknown
    tier: str
    reason: str


@lru_cache(maxsize=1)
def _registry() -> dict[str, dict[str, str]]:
    reg = load_json("halal_registry.json")["registry"]
    out: dict[str, dict[str, str]] = {}
    for kind in ("halal", "kosher"):
        m: dict[str, str] = {}
        for body in reg[kind]:
            for n in [body["name"], *body.get("aliases", [])]:
                m[normalize(n)] = body["name"]
        out[kind] = m
    return out


def parse_marks(ext: Extraction) -> dict[str, list[str]]:
    """certification marks like 'halal:HAC Sri Lanka' -> {'halal': ['HAC Sri Lanka'], ...}"""
    out: dict[str, list[str]] = {}
    for mark in ext.certification_marks.value or []:
        kind, _, body = mark.partition(":")
        kind = normalize(kind).replace(" ", "_").replace("-", "_")
        out.setdefault(kind, []).append(body.strip())
    return out


def registry_match(kind: str, body: str) -> str | None:
    return _registry()[kind].get(normalize(body))


def _flag_hits(info: IngredientInfo, flag: str) -> dict[str, str]:
    gd = load_json("diets.json")["groups"]
    out: dict[str, str] = {}
    for g, meta in gd.items():
        if meta.get(flag):
            hits = info.group_hits(g)
            if hits:
                out[g] = hits[0]
    return out


def _fmt(hits: dict[str, str]) -> str:
    return ", ".join(sorted({f"{v}" for v in hits.values()}))


def _religious(kind: str, marks: dict[str, list[str]], info: IngredientInfo) -> DietResult:
    flag = f"{kind}_no"
    hits = _flag_hits(info, flag) if info.known else {}
    if kind == "kosher" and info.known:
        meaty = info.group_hits("meat") or info.group_hits("pork")
        if meaty and info.group_hits("dairy"):
            hits = {**hits, "meat+dairy": f"{meaty[0]} with {info.group_hits('dairy')[0]}"}
    mark_bodies = marks.get(kind, [])
    if mark_bodies:
        matched = [registry_match(kind, b) for b in mark_bodies if b]
        matched = [m for m in matched if m]
        if hits:
            return DietResult("unknown", "inferred",
                              f"A {kind} mark was read but the ingredients include {_fmt(hits)}; please check the pack.")
        if matched:
            return DietResult("yes", "verified",
                              f"Certification mark read ({matched[0]}) and found in the bundled registry.")
        return DietResult("yes", "label_stated", "Certification mark read but not registry-checked.")
    if hits:
        return DietResult("no", "inferred", f"No certification mark; ingredients include {_fmt(hits)}.")
    if not info.known:
        return DietResult("unknown", "unknown", "Ingredients could not be read and no certification mark was found.")
    return DietResult("unknown", "inferred",
                      f"No certification mark; ingredients alone cannot confirm {kind}.")


def evaluate(ext: Extraction, info: IngredientInfo, al: AllergenResult) -> dict[str, DietResult]:
    marks = parse_marks(ext)
    claims = " ".join(normalize(c) for c in (ext.claims.value or []))
    res: dict[str, DietResult] = {}
    unresolved = bool(info.unresolved)

    def animal(flag: str) -> dict[str, str]:
        return _flag_hits(info, flag) if info.known else {}

    # vegan
    hits = animal("vegan_no")
    if not info.known:
        res["vegan"] = DietResult("unknown", "unknown", "Ingredients could not be read.")
    elif hits:
        res["vegan"] = DietResult("no", "inferred", f"Ingredients include {_fmt(hits)}.")
    elif unresolved:
        res["vegan"] = DietResult("unknown", "inferred", "Some ingredient terms were not recognised.")
    elif "vegan" in marks:
        res["vegan"] = DietResult("yes", "label_stated", "A vegan certification mark was read and no animal ingredients were found.")
    else:
        res["vegan"] = DietResult("yes", "inferred", "No animal-derived ingredients found in the list.")
    # vegetarian
    hits = animal("vegetarian_no")
    if not info.known:
        res["vegetarian"] = DietResult("unknown", "unknown", "Ingredients could not be read.")
    elif hits:
        res["vegetarian"] = DietResult("no", "inferred", f"Ingredients include {_fmt(hits)}.")
    elif unresolved:
        res["vegetarian"] = DietResult("unknown", "inferred", "Some ingredient terms were not recognised.")
    elif "vegan" in marks or "vegetarian" in marks:
        res["vegetarian"] = DietResult("yes", "label_stated", "A vegan/vegetarian mark was read and no meat or fish ingredients were found.")
    else:
        res["vegetarian"] = DietResult("yes", "inferred", "No meat, fish or gelatin ingredients found in the list.")
    # gluten free
    if "wheat_gluten" in al.contains:
        res["gluten_free"] = DietResult("no", al.contains["wheat_gluten"]["tier"], "Gluten-containing cereal found in the ingredients.")
    elif not info.known:
        res["gluten_free"] = DietResult("unknown", "unknown", "Ingredients could not be read.")
    elif "wheat_gluten" in al.may_contain:
        res["gluten_free"] = DietResult("unknown", "label_stated", "The pack says it may contain gluten-containing cereals.")
    elif "gluten_free" not in marks and info.tag_hits("oats"):
        res["gluten_free"] = DietResult("unknown", "inferred", "Oats may contain gluten unless certified gluten-free")
    elif unresolved:
        res["gluten_free"] = DietResult("unknown", "inferred", "Some ingredient terms were not recognised.")
    elif "gluten_free" in marks:
        res["gluten_free"] = DietResult("yes", "label_stated", "A gluten-free mark was read.")
    else:
        res["gluten_free"] = DietResult("yes", "inferred", "No gluten-containing cereals found in the list.")
    # lactose free
    if re.search(r"lactose[\s-]?free|no lactose", claims) and "milk" in al.contains:
        res["lactose_free"] = DietResult("yes", "label_stated", "The pack states lactose free.")
    elif "milk" in al.contains:
        res["lactose_free"] = DietResult("no", al.contains["milk"]["tier"], "Milk ingredients found.")
    elif not info.known:
        res["lactose_free"] = DietResult("unknown", "unknown", "Ingredients could not be read.")
    elif "milk" in al.may_contain:
        res["lactose_free"] = DietResult("unknown", "label_stated", "The pack says it may contain milk.")
    elif unresolved:
        res["lactose_free"] = DietResult("unknown", "inferred", "Some ingredient terms were not recognised.")
    else:
        res["lactose_free"] = DietResult("yes", "inferred", "No milk ingredients found in the list.")
    res["halal"] = _religious("halal", marks, info)
    res["kosher"] = _religious("kosher", marks, info)
    return res


DIET_TITLES = {
    "vegan": "Vegan", "vegetarian": "Vegetarian", "gluten_free": "Gluten free",
    "lactose_free": "Lactose free", "halal": "Halal", "kosher": "Kosher",
}


def findings(results: dict[str, DietResult]) -> list[Finding]:
    out: list[Finding] = []
    for d in DIETS:
        r = results[d]
        sev = "good" if (r.value == "yes" and r.tier in ("verified", "label_stated")) else "info"
        extra = [Source(label="Certification registry (bundled)")] if r.tier == "verified" else []
        nxt = None
        if r.value != "yes":
            nxt = "Consider checking the pack or the maker if this matters to you."
        out.append(make_finding(
            f"diet.{d}", "diet", "diet", sev, "no_known_concern", r.tier,
            f"{DIET_TITLES[d]}: {r.value}", r.reason, nxt,
            {"diet": d, "value": r.value}, label_read=r.tier in ("verified", "label_stated"),
            extra_sources=extra,
        ))
    return out

