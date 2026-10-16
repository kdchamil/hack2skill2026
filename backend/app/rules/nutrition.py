"""Nutrition: per-100g normalisation, salt/sodium conversion, UK FSA levels, %RI vs Codex NRV."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models import Extraction, Finding

from .taxonomy import PRO, make_finding

RI_REFERENCE = (
    "Codex NRV (adult): energy 2000 kcal, sodium 2000 mg, sugars 50 g (reference value), "
    "saturated fat 20 g, protein 50 g, fibre 25 g"
)
NRV = {"energy_kcal": 2000.0, "sodium_mg": 2000.0, "sugars_total": 50.0, "fat_saturated": 20.0,
       "protein": 50.0, "fibre": 25.0}
# (low upper bound inclusive, high lower bound exclusive) per 100 g, UK FSA solids
THRESHOLDS = {"sugars_total": (5.0, 22.5), "fat_saturated": (1.5, 5.0), "sodium_mg": (120.0, 600.0)}
LEVEL_KEY = {"sugars_total": "sugars", "fat_saturated": "fat_saturated", "sodium_mg": "sodium"}
NICE = {"sugars_total": "sugars", "fat_saturated": "saturated fat", "sodium_mg": "sodium"}


def salt_g_from_sodium_mg(mg: float) -> float:
    return mg * 2.5 / 1000.0


def sodium_mg_from_salt_g(g: float) -> float:
    return g * 1000.0 / 2.5


def level(nutrient: str, per100: float | None) -> str:
    if per100 is None:
        return "unknown"
    low, high = THRESHOLDS[nutrient]
    if per100 > high:
        return "high"
    if per100 <= low:
        return "low"
    return "medium"


@dataclass
class NutritionResult:
    per100: dict[str, float] = field(default_factory=dict)
    per_serving: dict[str, float] = field(default_factory=dict)
    derived: set[str] = field(default_factory=set)
    levels: dict[str, str] = field(default_factory=dict)  # sodium, sugars, fat_saturated
    pct_ri: dict[str, float] = field(default_factory=dict)
    ri_basis: str = "per 100 g"
    commentary: str = ""

    @property
    def has_data(self) -> bool:
        return bool(self.per100 or self.per_serving)


def compute(ext: Extraction) -> NutritionResult:
    r = NutritionResult(levels={"sodium": "unknown", "sugars": "unknown", "fat_saturated": "unknown"})
    rows = ext.nutrition.value or []
    serving = ext.serving_size_g.value
    if serving is not None and serving <= 0:
        serving = None
    for row in rows:
        v100, vs = row.per_100g, row.per_serving
        if v100 is None and vs is not None and serving:
            v100 = vs * 100.0 / serving
            r.derived.add(row.nutrient)
        if vs is None and v100 is not None and serving:
            vs = v100 * serving / 100.0
        if v100 is not None and row.nutrient not in r.per100:
            r.per100[row.nutrient] = v100
        if vs is not None and row.nutrient not in r.per_serving:
            r.per_serving[row.nutrient] = vs
    if "sodium_mg" not in r.per100 and "salt_g" in r.per100:
        r.per100["sodium_mg"] = sodium_mg_from_salt_g(r.per100["salt_g"])
        r.derived.add("sodium_mg")
        if "salt_g" in r.per_serving:
            r.per_serving["sodium_mg"] = sodium_mg_from_salt_g(r.per_serving["salt_g"])
    if "sodium_mg" in r.per100 and "salt_g" not in r.per100:
        r.per100["salt_g"] = salt_g_from_sodium_mg(r.per100["sodium_mg"])
        r.derived.add("salt_g")
    for nut, key in LEVEL_KEY.items():
        r.levels[key] = level(nut, r.per100.get(nut))
    basis = r.per_serving if (r.per_serving and serving) else r.per100
    r.ri_basis = f"per serving ({serving:g} g)" if (basis is r.per_serving and serving) else "per 100 g"
    for nut, ref in NRV.items():
        if nut in basis:
            r.pct_ri[nut] = round(basis[nut] / ref * 100.0, 1)
    r.commentary = _sentence(r)
    return r


def _sentence(r: NutritionResult) -> str:
    if not r.per100:
        return "Nutrition values could not be read from this label."
    bits = []
    if "energy_kcal" in r.per100:
        bits.append(f"{r.per100['energy_kcal']:g} kcal")
    for nut, key in LEVEL_KEY.items():
        if nut in r.per100:
            unit = "mg" if nut == "sodium_mg" else "g"
            fmt = f"{r.per100[nut]:.0f}" if unit == "mg" else f"{r.per100[nut]:.1f}"
            bits.append(f"{NICE[nut]} {fmt} {unit} ({r.levels[key]})")
    return "Per 100 g: " + ", ".join(bits) + "."


def findings(r: NutritionResult, ext: Extraction) -> list[Finding]:
    out: list[Finding] = []
    if not r.has_data:
        out.append(make_finding(
            "nutrition.unknown", "nutrition", "nutrient_level", "info", "no_known_concern", "unknown",
            "Nutrition values could not be read", "No readable nutrition table was found on this label.",
            "Turn to the nutrition table and retake the photo.", {}, label_read=False))
        return out
    for nut, key in LEVEL_KEY.items():
        lv = r.levels[key]
        if lv == "unknown":
            continue
        sev = {"high": "check", "medium": "info", "low": "good"}[lv]
        tier = "inferred" if nut in r.derived else "label_stated"
        unit = "mg" if nut == "sodium_mg" else "g"
        val = r.per100[nut]
        extra = ""
        if nut == "sodium_mg":
            extra = f" (about {salt_g_from_sodium_mg(val):.2f} g salt)"
        low, high = THRESHOLDS[nut]
        out.append(make_finding(
            f"nutrition.{key}", "nutrition", "nutrient_level", sev, "no_known_concern", tier,
            f"{NICE[nut].capitalize()} level: {lv}",
            f"{val:.1f} {unit} per 100 g{extra}; UK FSA front-of-pack: low up to {low:g}, high above {high:g} {unit}.",
            ("Consider how this fits your daily intake." + PRO) if lv == "high" else None,
            {"nutrient": nut, "per_100g": round(val, 2), "level": lv, "unit": unit,
             "pct_ri": r.pct_ri.get(nut)},
        ))
    out.append(make_finding(
        "nutrition.summary", "nutrition", "nutrition_summary", "info", "no_known_concern",
        "inferred" if r.derived else "label_stated",
        "Nutrition summary", r.commentary, None,
        {"per_100g": {k: round(v, 2) for k, v in r.per100.items()},
         "per_serving": {k: round(v, 2) for k, v in r.per_serving.items()},
         "pct_ri": r.pct_ri, "ri_basis": r.ri_basis, "ri_reference": RI_REFERENCE,
         "serving_size_g": ext.serving_size_g.value},
    ))
    return out
