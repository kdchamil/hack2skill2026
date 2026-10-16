"""Shared schemas. Mirrors docs/CONTRACT.md "Shared schemas". Change only via the lead."""

from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, field_validator, model_validator

T = TypeVar("T")

Tier = Literal["verified", "label_stated", "inferred", "unknown"]
Severity = Literal["avoid", "check", "info", "good"]  # rules decide; never the model
RiskCategory = Literal["prohibited", "restricted", "allergen", "debated", "no_known_concern"]
Lang = Literal["en", "si", "ta"]
CardId = Literal["allergens", "nutrition", "diet", "ingredients", "claims", "packaging"]


class Legible(BaseModel, Generic[T]):  # legibility wrapper (FR-05); name avoids pydantic.Field
    value: T | None
    confidence: float  # 0..1 ; < 0.6 => value forced to None and treated as Unknown

    @model_validator(mode="after")
    def _null_low_confidence(self) -> "Legible[T]":
        if self.confidence < 0.6:
            self.value = None
        return self


class NutrientRow(BaseModel):
    nutrient: Literal[
        "energy_kcal", "sugars_total", "sugars_added", "fat_saturated", "fat_trans",
        "sodium_mg", "salt_g", "protein", "fibre", "carbohydrate", "fat_total",
    ]
    per_100g: float | None
    per_serving: float | None
    unit: str  # "g", "mg", "kcal"


class DateField(BaseModel):
    kind: Literal["mfg", "best_before", "use_by", "expiry"]
    raw: str  # verbatim as printed
    iso: str | None  # parsed by rules code, NOT by the model


class Extraction(BaseModel):  # Gemini structured output (FR-04); also fixture format
    name: Legible[str]
    brand: Legible[str]
    category: Legible[Literal["food", "beverage", "cosmetic", "personal_care", "other"]]
    label_languages: list[str]  # ISO 639-1, e.g. ["si","en"]
    ingredients_verbatim: Legible[str]
    ingredients: Legible[list[str]]  # split list, verbatim tokens
    allergen_contains_statement: Legible[str]  # "Contains: ..."
    allergen_may_contain_statement: Legible[str]  # "May contain ..."
    nutrition: Legible[list[NutrientRow]]
    serving_size_g: Legible[float]
    claims: Legible[list[str]]  # verbatim marketing claims, e.g. "Sugar free"
    dates: Legible[list[DateField]]
    batch_lot: Legible[str]
    manufacturer: Legible[str]
    origin: Legible[str]
    certification_marks: Legible[list[str]]  # e.g. ["halal:HAC Sri Lanka", "vegan:V-Label"]
    packaging_codes: Legible[list[str]]  # e.g. ["PET 1", "PP 5", "♻ 05 PP"]
    barcode: str | None  # from device decode, not model
    missing_sides: list[Literal["ingredients", "nutrition", "front"]]  # drives "Turn to the ingredient side"
    retake_tip: str | None  # blur/glare guidance when legibility is low


class Source(BaseModel):
    label: str  # "Pack label", "Open Food Facts", "Codex GSFA", "Rule pack v1"
    url: str | None = None


class Finding(BaseModel):  # FR-17. A finding without a tier is a server error.
    id: str  # stable, e.g. "allergen.contains.sesame"
    card: CardId
    category: str  # e.g. "allergen_contains","allergen_may_contain","nutrient_level","diet","additive","date","packaging","carbon","claim"
    severity: Severity
    risk: RiskCategory
    tier: Tier
    title: str  # English canonical text from rules (template)
    reason: str  # one sentence, English canonical
    next_step: str | None
    sources: list[Source]
    data: dict[str, Any] = {}  # machine data

    @field_validator("tier", mode="before")
    @classmethod
    def _tier_required(cls, v: Any) -> Any:
        if v is None:
            raise ValueError("finding tier is required")
        return v


class Card(BaseModel):  # FR-24 max 6
    id: CardId
    status: Severity  # worst severity among its findings
    tier: Tier  # weakest tier among its key findings
    headline: str  # <= 12 words; template from rules, replaced by commentary
    finding_ids: list[str]


class HouseholdFacts(BaseModel):  # what the PHONE needs to compute member verdicts (FR-22)
    allergens_contains: list[str]  # canonical allergen IDs
    allergens_may_contain: list[str]
    ingredients_known: bool  # False if ingredients Unknown -> forces "check"
    diets: dict[str, Literal["yes", "no", "unknown"]]  # keys: vegan vegetarian gluten_free lactose_free halal kosher
    nutrient_levels: dict[str, Literal["low", "medium", "high", "unknown"]]  # keys: sodium sugars fat_saturated
    canonical_ingredient_ids: list[str]


class Analysis(BaseModel):  # rules.analyze() output
    product: Extraction
    findings: list[Finding]
    cards: list[Card]  # exactly the six CardIds, ordered as above
    facts: HouseholdFacts
    banners: list[str]  # e.g. "expired:2026-09-01", "near_expiry:2026-10-20", "retake:ingredients"
    rule_pack_version: str
    ri_reference: str  # e.g. "Codex NRV (adult)"
    unresolved_terms: list[str]  # ingredient tokens the dictionary could not map (sent to resolve step)


class Commentary(BaseModel):
    lang: Lang
    summary: str  # 1-2 sentences for Listen
    cards: dict[CardId, dict[str, str]]  # {"allergens": {"headline": "...", "reason": "..."}}
    source: Literal["gemini", "template"]


class ScanResponse(BaseModel):
    scan_id: str
    analysis: Analysis
    commentary: Commentary
    trace: list[dict[str, Any]]  # [{"tool":"extract_label","ms":1234,"model_calls":1}, ...]
    model_calls: int  # NFR-15: <=2 first scan, 0 repeat (cache by barcode+image hash)
    cached: bool
