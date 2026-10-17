// Mirrors docs/CONTRACT.md "Shared schemas" (backend/app/models.py). Keep in sync.

export type Tier = 'verified' | 'label_stated' | 'inferred' | 'unknown'
export type Severity = 'avoid' | 'check' | 'info' | 'good'
export type RiskCategory = 'prohibited' | 'restricted' | 'allergen' | 'debated' | 'no_known_concern'
export type Lang = 'en' | 'si' | 'ta'
export type GradeCardId = 'nutrition' | 'processing' | 'additives' | 'carbon' | 'water_land' | 'packaging'
export type AreaId = 'body' | 'planet' | 'people' | 'truth' | 'choice'
export type Topic =
  | 'allergens' | 'diet' | 'nutrition' | 'processing' | 'additives' | 'dates' | 'recalls' | 'carbon'
  | 'water_land' | 'packaging' | 'labour' | 'sourcing' | 'animal_welfare' | 'claims' | 'label_clarity' | 'authenticity'
export type GradeLetter = 'A' | 'B' | 'C' | 'D' | 'E'

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
  area: AreaId
  topic: Topic
  card: GradeCardId | null // only findings that feed a graded card
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
  id: GradeCardId
  grade: GradeLetter | null // null = not enough data / no reliable data
  status: Severity
  tier: Tier
  headline: string
  finding_ids: string[]
}

export interface Area {
  id: AreaId
  status: Severity
  tier: Tier
  headline: string // <= 12 words
  finding_ids: string[]
  card_ids: GradeCardId[]
}

export interface Grade {
  letter: GradeLetter | null
  reason: 'thin_data' | null
  planet_partial: boolean
  drivers: GradeCardId[] // at most 2
  rule_version: string
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
  cards: Card[] // exactly six, GradeCardId order
  grade: Grade
  areas: Area[] // exactly five, AreaId order
  product_range: string | null
  facts: HouseholdFacts
  banners: string[]
  rule_pack_version: string
  ri_reference: string
  unresolved_terms: string[]
}

export interface Commentary {
  lang: Lang
  summary: string
  cards: Partial<Record<GradeCardId, Record<string, string>>> // {headline, reason}
  areas: Partial<Record<AreaId, Record<string, string>>> // {headline, reason}
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

export interface Range {
  id: string
  name: string
  keywords: { en: string[]; si: string[]; ta: string[] }
}

// GET /api/ranges
export interface RangesResponse {
  ranges: Range[]
}

// POST /api/list/parse
export interface ListParseRequest {
  text: string // <= 2000 chars
  lang: Lang
}

export interface ParsedItem {
  name: string
  quantity: number | null
  unit: string | null
  brand: string | null
  range_id: string | null
}

export interface ListParseResponse {
  items: ParsedItem[]
}
