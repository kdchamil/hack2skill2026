"""Recycling-code parsing. Carbon is always unknown."""

from __future__ import annotations

import re

from app.models import Finding

from .taxonomy import make_finding

NUM_MATERIAL = {
    1: ("PET", "PET (polyethylene terephthalate)"), 2: ("HDPE", "HDPE (high-density polyethylene)"),
    3: ("PVC", "PVC (polyvinyl chloride)"), 4: ("LDPE", "LDPE (low-density polyethylene)"),
    5: ("PP", "PP (polypropylene)"), 6: ("PS", "PS (polystyrene)"), 7: ("OTHER", "Other plastics"),
    20: ("PAP", "Corrugated cardboard"), 21: ("PAP", "Non-corrugated cardboard"), 22: ("PAP", "Paper"),
    40: ("FE", "Steel"), 41: ("ALU", "Aluminium"),
    70: ("GL", "Glass (colourless)"), 71: ("GL", "Glass (green)"), 72: ("GL", "Glass (brown)"),
    81: ("C/PAP", "Composite: paper/cardboard with plastic"), 82: ("C/PAP", "Composite: paper/cardboard with aluminium"),
    83: ("C/PAP", "Composite: paper/cardboard with tinplate"), 84: ("C/PAP", "Composite: paper/cardboard with plastic and aluminium"),
}
ABBR_DEFAULT = {"PET": 1, "PETE": 1, "HDPE": 2, "PE-HD": 2, "PVC": 3, "LDPE": 4, "PE-LD": 4, "PP": 5, "PS": 6,
                "OTHER": 7, "PAP": 22, "FE": 40, "ALU": 41, "GL": 70, "C/PAP": 81}
_ABBR = re.compile(r"(?<![A-Z0-9])(C/PAP|PETE|PET|HDPE|PE-HD|LDPE|PE-LD|PVC|PP|PS|PAP|ALU|FE|GL|OTHER)(?![A-Z])", re.I)
_NUM = re.compile(r"(?<!\d)(\d{1,2})(?!\d)")
_CANON = {"PETE": "PET", "PE-HD": "HDPE", "PE-LD": "LDPE"}


def parse_code(raw: str) -> dict | None:
    t = (raw or "").upper().replace("♻", " ").replace("♳", " 1 ").replace("♴", " 2 ").replace("♵", " 3 ") \
        .replace("♶", " 4 ").replace("♷", " 5 ").replace("♸", " 6 ").replace("♹", " 7 ")
    am = _ABBR.search(t)
    nums = [int(n) for n in _NUM.findall(t)]
    abbr = _CANON.get(am.group(1).upper(), am.group(1).upper()) if am else None
    if abbr:
        num = next((n for n in nums if n in NUM_MATERIAL and NUM_MATERIAL[n][0] == abbr), ABBR_DEFAULT[abbr])
    else:
        num = next((n for n in nums if n in NUM_MATERIAL), None)
        if num is None:
            return None
        abbr = NUM_MATERIAL[num][0]
    return {"abbr": abbr, "number": num, "material": NUM_MATERIAL[num][1], "code": f"{abbr} {num}"}


def findings(codes: list[str] | None, read: bool) -> list[Finding]:
    out: list[Finding] = []
    seen: set[str] = set()
    parsed_any = False
    for raw in codes or []:
        p = parse_code(raw)
        if p is None or p["code"] in seen:
            continue
        seen.add(p["code"])
        parsed_any = True
        out.append(make_finding(
            f"packaging.code.{p['abbr'].lower().replace('/', '')}{p['number']}", "packaging", "packaging", "info",
            "no_known_concern", "label_stated", f"Recycling code {p['code']}: {p['material']}",
            "Material read from the recycling mark on the pack; local collection rules vary.",
            "Consider checking local recycling rules.", {**p, "raw": raw}))
    if not parsed_any:
        out.append(make_finding(
            "packaging.code.none", "packaging", "packaging", "info", "no_known_concern", "unknown",
            "No recycling code read", "No recognisable recycling mark was read from the pack.", None, {},
            label_read=False))
    out.append(make_finding(
        "packaging.carbon", "packaging", "carbon", "info", "no_known_concern", "unknown",
        "Carbon footprint: no reliable data",
        "No reliable carbon data exists for this product in our sources.", None,
        {"carbon": None, "placeholder": True}, label_read=False))
    return out
