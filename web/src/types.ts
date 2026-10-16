// Mirrors docs/CONTRACT.md "Shared schemas" (backend/app/models.py). Keep in sync.

export type Tier = 'verified' | 'label_stated' | 'inferred' | 'unknown'
export type Severity = 'avoid' | 'check' | 'info' | 'good'
export type RiskCategory = 'prohibited' | 'restricted' | 'allergen' | 'debated' | 'no_known_concern'
export type Lang = 'en' | 'si' | 'ta'
export type CardId = 'allergens' | 'nutrition' | 'diet' | 'ingredients' | 'claims' | 'packaging'

export interface Legible<T> {
  value: T | null
  confidence: number // 0..1 ; < 0.6 => value forced to null
}

export type NutrientKey =
  | 'energy_kcal' | 'sugars_total' | 'sugars_added' | 'fat_saturated' | 'fat_trans'
  | 'sodium_mg' | 'salt_g' | 'protein' | 'fibre' | 'carbohydrate' | 'fat_total'

export interface NutrientRow {
  nutrient: NutrientKey
  per_100g: number | null
  per_serving: number | null
  unit: string
}

export interface DateField {
  kind: 'mfg' | 'best_before' | 'use_by' | 'expiry'
  raw: string
  iso: string | null
}

export interface Extraction {
  name: Legible<string>
  brand: Legible<string>
  category: Legible<'food' | 'beverage' | 'cosmetic' | 'personal_care' | 'other'>
  label_languages: string[]
  ingredients_verbatim: Legible<string>
  ingredients: Legible<string[]>
  allergen_contains_statement: Legible<string>
  allergen_may_contain_statement: Legible<string>
  nutrition: Legible<NutrientRow[]>
  serving_size_g: Legible<number>
  claims: Legible<string[]>
  dates: Legible<DateField[]>
  batch_lot: Legible<string>
  manufacturer: Legible<string>
  origin: Legible<string>
  certification_marks: Legible<string[]>
  packaging_codes: Legible<string[]>
  barcode: string | null
  missing_sides: ('ingredients' | 'nutrition' | 'front')[]
  retake_tip: string | null
}

export interface Source {
  label: string
  url?: string | null
}

export interface Finding {
  id: string
  card: CardId
  category: string
  severity: Severity
  risk: RiskCategory
  tier: Tier
  title: string
  reason: string
  next_step: string | null
  sources: Source[]
  data: Record<string, unknown>
}

export interface Card {
  id: CardId
  status: Severity
  tier: Tier
  headline: string
  finding_ids: string[]
}

export interface HouseholdFacts {
  allergens_contains: string[]
  allergens_may_contain: string[]
  ingredients_known: boolean
  diets: Record<string, 'yes' | 'no' | 'unknown'>
  nutrient_levels: Record<string, 'low' | 'medium' | 'high' | 'unknown'>
  canonical_ingredient_ids: string[]
}

export interface Analysis {
  product: Extraction
  findings: Finding[]
  cards: Card[]
  facts: HouseholdFacts
  banners: string[]
  rule_pack_version: string
  ri_reference: string
  unresolved_terms: string[]
}

export interface Commentary {
  lang: Lang
  summary: string
  cards: Partial<Record<CardId, Record<string, string>>>
  source: 'gemini' | 'template'
}

export interface ScanResponse {
  scan_id: string
  analysis: Analysis
  commentary: Commentary
  trace: Record<string, unknown>[]
  model_calls: number
  cached: boolean
}

export interface ApiError {
  code: string
  message: string
}
