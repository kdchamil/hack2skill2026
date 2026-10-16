"""Marketing-claim classification: supported / unsupported / contradicted / unverifiable."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.models import Extraction, Finding

from .additives import add_data
from .allergens import AllergenResult
from .diets import DietResult
from .ingredients import IngredientInfo
from .nutrition import NutritionResult
from .taxonomy import PRO, make_finding, normalize

POLYOLS = {"E420", "E421", "E953", "E965", "E966", "E967", "E968"}
POLYOL_NOTE = ("Polyols such as maltitol are sweeteners, not sugars, and may have a laxative effect "
               "if eaten in large amounts.")

# (kind, regex, title label); order matters
CLAIM_PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    ("no_added_sugar", re.compile(r"no added sugars?|no sugars? added|without added sugars?|unsweeteni?ed|added sugars? free"), "No added sugar"),
    ("sugar_free", re.compile(r"sugar[\s-]?free|sugarless|zero sugars?|0 ?g? sugars?|no sugars?|sugars? free"), "Sugar free"),
    ("no_msg", re.compile(r"no added msg|no msg|msg[\s-]?free|without msg|no monosodium glutamate|no added monosodium glutamate"), "No added MSG"),
    ("gluten_free", re.compile(r"gluten[\s-]?free|no gluten|without gluten"), "Gluten free"),
    ("lactose_free", re.compile(r"lactose[\s-]?free|no lactose"), "Lactose free"),
    ("dairy_free", re.compile(r"dairy[\s-]?free|no dairy|milk[\s-]?free|non[\s-]?dairy"), "Dairy free"),
    ("vegetarian", re.compile(r"vegetarian"), "Vegetarian"),
    ("vegan", re.compile(r"(?<!non[\s-])vegan|plant[\s-]?based"), "Vegan"),
    ("no_preservatives", re.compile(r"no preservatives?|preservatives?[\s-]?free|without preservatives?"), "No preservatives"),
    ("natural", re.compile(r"natural|no artificial|nature"), "Natural"),
]


@dataclass
class ClaimContext:
    ext: Extraction
    info: IngredientInfo
    al: AllergenResult
    diets: dict[str, DietResult]
    nutrition: NutritionResult


def classify_kind(claim: str) -> tuple[str, str]:
    n = normalize(claim)
    for kind, rx, label in CLAIM_PATTERNS:
        if rx.search(n):
            return kind, label
    return "other", "Claim"


def _verdict(kind: str, c: ClaimContext) -> tuple[str, str, list[str]]:
    info, ad = c.info, add_data()
    codes = info.additive_codes()
    if kind in ("no_added_sugar", "sugar_free"):
        sugars = info.tag_hits("sugar")
        polyols = [ad[x]["name"] for x in codes if x in POLYOLS]
        note = f" {POLYOL_NOTE}" if polyols else ""
        s100 = c.nutrition.per100.get("sugars_total")
        if sugars:
            what = "added sugar" if kind == "no_added_sugar" else "sugar"
            return ("contradicted",
                    f"The ingredients list {', '.join(sorted(set(sugars)))}, a {what} source, which conflicts with the claim.{note}",
                    sorted(set(sugars)))
        if kind == "sugar_free" and s100 is not None and s100 > 0.5:
            return ("contradicted", f"The nutrition table shows {s100:g} g sugars per 100 g, above the 0.5 g used for a sugar-free claim.{note}", [])
        if not info.known:
            return "unverifiable", "Ingredients could not be read, so the claim cannot be checked.", []
        if info.unresolved:
            return "unverifiable", "Some ingredient terms were not recognised, so the claim cannot be fully checked.", []
        return "supported", f"No sugar ingredients were found in the list.{note}", []
    if kind == "no_msg":
        msg = [m for t in info.tokens for k, m in t.additives.items() if k == "E621"]
        if msg:
            return "contradicted", "The ingredients list monosodium glutamate (E621), which conflicts with a no-added-MSG claim.", msg
        if info.tag_hits("glutamate_source"):
            return ("unsupported", "Yeast extract or hydrolysed protein is listed; these naturally contain glutamate, "
                    "so the claim is not fully supported.", info.tag_hits("glutamate_source"))
        if not info.known:
            return "unverifiable", "Ingredients could not be read, so the claim cannot be checked.", []
        return "supported", "No MSG or glutamate-rich ingredients were found in the list.", []
    if kind in ("vegan", "vegetarian", "gluten_free", "lactose_free"):
        r = c.diets[kind]
        return {"no": "contradicted", "yes": "supported", "unknown": "unverifiable"}[r.value], r.reason, []
    if kind == "dairy_free":
        if "milk" in c.al.contains:
            return "contradicted", f"Milk ingredient found (\"{c.al.contains['milk']['matched']}\").", [c.al.contains["milk"]["matched"]]
        if not info.known:
            return "unverifiable", "Ingredients could not be read, so the claim cannot be checked.", []
        if "milk" in c.al.may_contain:
            return "unsupported", "The pack says it may contain milk.", []
        return "supported", "No milk ingredients found in the list.", []
    if kind == "no_preservatives":
        pres = [ad[x]["name"] for x in codes if "preservative" in ad[x]["function"]]
        if pres:
            return "contradicted", f"Preservative additives are listed: {', '.join(pres)}.", pres
        if not info.known:
            return "unverifiable", "Ingredients could not be read, so the claim cannot be checked.", []
        return "supported", "No preservative additives found in the list.", []
    if kind == "natural":
        syn = [ad[x]["name"] for x in codes if ad[x]["synthetic"]]
        if syn:
            return "unsupported", f"Synthetic additives are listed ({', '.join(syn)}), so a 'natural' claim is not fully supported.", syn
        return "unverifiable", "'Natural' has no fixed meaning, so it cannot be verified from the label.", []
    return "unverifiable", "This kind of claim cannot be checked against the label data.", []


def evaluate(c: ClaimContext) -> list[Finding]:
    out: list[Finding] = []
    for i, claim in enumerate(c.ext.claims.value or []):
        kind, label = classify_kind(claim)
        verdict, reason, evidence = _verdict(kind, c)
        sev = "check" if verdict == "contradicted" else "info"
        title = f"{label} claim: {verdict}" if kind != "other" else f"Claim cannot be checked: {verdict}"
        medical = kind in ("sugar_free", "no_added_sugar", "gluten_free", "lactose_free", "dairy_free")
        nxt = None
        if verdict in ("contradicted", "unsupported"):
            nxt = "Consider reading the ingredient list rather than relying on the front-of-pack claim."
            if medical:
                nxt += PRO
        out.append(make_finding(
            f"claim.{i}.{kind}", "claims", "claim", sev, "no_known_concern", "inferred",
            title, reason, nxt, {"verdict": verdict, "kind": kind, "claim": claim, "evidence": evidence}))
    return out
