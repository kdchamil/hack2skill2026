"""A-E grading rules (SRS 1.8 FR-47). Versioned; deterministic; the model never sets a grade.

GRADE_RULE_VERSION grade-1.0

Mini grades (a card is None = "not enough data" / "No reliable data"):
- nutrition: Nutri-Score-style negative points from per-100 g values, no positive points in v1.
    energy 1 pt per 80 kcal, sugars 1 pt per 4.5 g, saturated fat 1 pt per 1 g, sodium 1 pt per 90 mg (each capped at 10).
    Total <=2 A, <=6 B, <=12 C, <=20 D, else E. At least 3 of the 4 values must be known, else None.
    Solid-food scale; drinks are not re-scaled in v1.
- processing: ingredient count sets the base (<=5 A, <=10 B, <=15 C, <=25 D, more E); markers (marker additives +
    industrial ingredients) raise it: >=1 -> at least C, >=3 -> at least D (ultra-processed estimate), >=5 -> E.
    Ingredients Unknown -> None.
- additives: worst of count (0 A, 1-2 B, 3-5 C, 6+ D), debated (0 A, 1 C, 2+ D), restricted (1+ D), prohibited (1+ E).
    Ingredients Unknown -> None.
- packaging: recyclability class of the worst recycling code read: GL/ALU/FE/PAP A, PET/HDPE B, PP/LDPE C,
    PS/C-PAP/OTHER D, PVC E. No readable code -> None. This is recyclability, not carbon.
- carbon, water_land: None ("No reliable data") until a published source is wired in.

Overall (FR-47): every health card (nutrition, processing, additives) must have a grade, else letter None with
reason "thin_data". Planet cards that are None are left out and planet_partial is True. The rest are averaged with
equal weight (A=1..E=5), rounded half toward the worse letter. A health card at E caps the grade at D or worse.
drivers: up to two cards furthest from the neutral C (ties: worse letter, then card order).
"""

from __future__ import annotations

from app.models import Grade

from .taxonomy import HEALTH_CARDS, PLANET_CARDS

GRADE_RULE_VERSION = "grade-1.0"
LETTERS = "ABCDE"

NUTRITION_STEPS = {"energy_kcal": 80.0, "sugars_total": 4.5, "fat_saturated": 1.0, "sodium_mg": 90.0}
NUTRITION_BANDS = [(2, "A"), (6, "B"), (12, "C"), (20, "D")]
PROCESSING_BANDS = [(5, "A"), (10, "B"), (15, "C"), (25, "D")]
PACKAGING_CLASS = {"GL": "A", "ALU": "A", "FE": "A", "PAP": "A", "PET": "B", "HDPE": "B", "PP": "C", "LDPE": "C",
                   "PS": "D", "C/PAP": "D", "OTHER": "D", "PVC": "E"}


def _worst(letters: list[str]) -> str:
    return max(letters, key=LETTERS.index)


def _band(value: float, bands: list[tuple[int, str]]) -> str:
    return next((letter for limit, letter in bands if value <= limit), "E")


def nutrition_points(per100: dict[str, float]) -> int | None:
    known = [k for k in NUTRITION_STEPS if k in per100]
    if len(known) < 3:
        return None
    return sum(min(10, int(per100[k] / NUTRITION_STEPS[k])) for k in known)


def grade_nutrition(per100: dict[str, float]) -> str | None:
    pts = nutrition_points(per100)
    return None if pts is None else _band(pts, NUTRITION_BANDS)


def grade_processing(known: bool, ingredient_count: int, markers: int) -> str | None:
    if not known or ingredient_count <= 0:
        return None
    letter = _band(ingredient_count, PROCESSING_BANDS)
    floor = "E" if markers >= 5 else "D" if markers >= 3 else "C" if markers >= 1 else "A"
    return _worst([letter, floor])


def grade_additives(known: bool, risks: list[str]) -> str | None:
    if not known:
        return None
    n = len(risks)
    debated, restricted, prohibited = risks.count("debated"), risks.count("restricted"), risks.count("prohibited")
    letters = ["A" if n == 0 else "B" if n <= 2 else "C" if n <= 5 else "D",
               "A" if debated == 0 else "C" if debated == 1 else "D"]
    if restricted:
        letters.append("D")
    if prohibited:
        letters.append("E")
    return _worst(letters)


def grade_packaging(abbrs: list[str]) -> str | None:
    classes = [PACKAGING_CLASS[a] for a in abbrs if a in PACKAGING_CLASS]
    return _worst(classes) if classes else None


def overall(letters: dict[str, str | None]) -> Grade:
    planet_partial = any(letters.get(c) is None for c in PLANET_CARDS)
    if any(letters.get(c) is None for c in HEALTH_CARDS):
        return Grade(letter=None, reason="thin_data", planet_partial=planet_partial, drivers=[],
                     rule_version=GRADE_RULE_VERSION)
    used = [c for c in HEALTH_CARDS + PLANET_CARDS if letters.get(c) is not None]
    vals = {c: LETTERS.index(letters[c]) + 1 for c in used}  # type: ignore[arg-type]
    idx = int(sum(vals.values()) / len(vals) + 0.5)
    if any(letters[c] == "E" for c in HEALTH_CARDS):
        idx = max(idx, 4)
    order = HEALTH_CARDS + PLANET_CARDS
    drivers = sorted((c for c in used if vals[c] != 3), key=lambda c: (-abs(vals[c] - 3), -vals[c], order.index(c)))[:2]
    return Grade(letter=LETTERS[idx - 1], reason=None, planet_partial=planet_partial,  # type: ignore[arg-type]
                 drivers=drivers, rule_version=GRADE_RULE_VERSION)  # type: ignore[arg-type]
