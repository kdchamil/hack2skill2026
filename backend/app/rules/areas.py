"""Findings for topics we cannot compute yet (honest Unknown) or only read from the label, plus the five areas (FR-57)."""

from __future__ import annotations

from app.models import Area, Extraction, Finding

from .taxonomy import AREA_CARDS, AREA_ORDER, make_finding, weakest, worst

# certification marks (casefolded substrings) that let a people topic say "Label-stated"
PEOPLE_MARKS: dict[str, tuple[str, ...]] = {
    "labour": ("fairtrade", "fair trade", "rainforest alliance", "utz"),
    "sourcing": ("fairtrade", "fair trade", "rspo", "rainforest alliance", "utz", "msc", "fsc"),
    "animal_welfare": ("rspca", "certified humane", "free range", "free-range", "cage free", "cage-free"),
}
PEOPLE_LABEL = {"labour": "labour", "sourcing": "sourcing", "animal_welfare": "animal welfare"}
CLARITY_ITEMS = ["ingredients", "nutrition", "manufacturer", "expiry", "warnings"]


def _unknown(fid: str, topic: str, title: str, reason: str) -> Finding:
    return make_finding(fid, "extra", topic, "info", "no_known_concern", "unknown", title, reason, None,
                        {"placeholder": True}, label_read=False)


def people_marks(ext: Extraction, topic: str) -> list[str]:
    marks = ext.certification_marks.value or []
    return [m for m in marks if any(k in m.casefold() for k in PEOPLE_MARKS[topic])]


def clarity(ext: Extraction) -> dict[str, bool]:
    return {
        "ingredients": bool(ext.ingredients_verbatim.value or ext.ingredients.value),
        "nutrition": bool(ext.nutrition.value),
        "manufacturer": bool(ext.manufacturer.value),
        "expiry": any(d.kind in ("best_before", "use_by", "expiry") for d in ext.dates.value or []),
        "warnings": bool(ext.allergen_contains_statement.value or ext.allergen_may_contain_statement.value),
    }


def extra_findings(ext: Extraction) -> list[Finding]:
    out = [
        _unknown("recalls.unknown", "recalls", "No recall data for your market",
                 "We have no recall feed for your market, so a recall cannot be ruled out."),
        _unknown("water_land.unknown", "water_land", "Water and land use: no reliable data",
                 "No reliable water or land-use data exists for this product in our sources."),
    ]
    for topic, label in PEOPLE_LABEL.items():
        marks = people_marks(ext, topic)
        if marks:
            out.append(make_finding(
                f"{topic}.label_stated", "extra", topic, "info", "no_known_concern", "label_stated",
                f"{label.capitalize()}: certification mark read", f"The pack shows {', '.join(marks)}; we did not check it against the issuer.",
                "Consider checking the issuer's site if it matters to you.", {"marks": marks}))
        else:
            out.append(_unknown(f"{topic}.unknown", topic, f"{label.capitalize()}: no data",
                                f"No {label} information was read from the pack and we have no independent source."))
    c = clarity(ext)
    n = sum(c.values())
    out.append(make_finding(
        "label_clarity.checklist", "extra", "label_clarity", "good" if n == len(c) else "info", "no_known_concern",
        "label_stated", f"Label shows {n} of {len(c)} key items",
        "Checked: " + ", ".join(f"{k} {'shown' if v else 'not read'}" for k, v in c.items()) + ".",
        None, {"checklist": c, "disclosed": n, "total": len(c)}))
    out.append(_unknown("authenticity.unknown", "authenticity", "Authenticity: cannot be checked",
                        "A barcode cannot prove a product is genuine."))
    return out


def build_areas(findings: list[Finding], headlines: dict[str, str]) -> list[Area]:
    areas: list[Area] = []
    for aid in AREA_ORDER:
        fs = [f for f in findings if f.area == aid]
        key = [f for f in fs if not f.data.get("placeholder")] or fs
        areas.append(Area(
            id=aid, status=worst([f.severity for f in fs]),  # type: ignore[arg-type]
            tier=weakest([f.tier for f in key]), headline=headlines[aid], finding_ids=[f.id for f in fs],
            card_ids=AREA_CARDS[aid]))  # type: ignore[arg-type]
    return areas
