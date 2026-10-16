// Household verdicts: computed in the browser only. Profiles never leave the phone.
// Rules mirror docs/CONTRACT.md "Household verdicts". Pure functions.
import type { HouseholdFacts } from './types'

export const ALLERGENS = [
  'peanut', 'tree_nut', 'milk', 'egg', 'fish', 'crustacean', 'soy', 'wheat_gluten',
  'sesame', 'mustard', 'buckwheat', 'celery', 'lupin', 'mollusc', 'sulphite',
] as const
export const DIETS = ['vegan', 'vegetarian', 'gluten_free', 'lactose_free', 'halal', 'kosher'] as const
export const GOALS = ['low_sodium', 'low_sugar', 'low_sat_fat'] as const
export const LIFE_STAGES = ['infant', 'child', 'teen', 'adult', 'pregnant', 'senior'] as const
export const MAX_MEMBERS = 8
export const MAX_ALIAS = 20

export type AllergenId = (typeof ALLERGENS)[number]
export type DietId = (typeof DIETS)[number]
export type GoalId = (typeof GOALS)[number]
export type LifeStage = (typeof LIFE_STAGES)[number]

export interface Member {
  id: string
  alias: string
  life_stage: LifeStage
  allergens: AllergenId[]
  diets: DietId[]
  goals: GoalId[]
  skin_type?: string
}

export type VerdictLevel = 'avoid' | 'check' | 'none'

export type ReasonCode =
  | 'contains' // arg = allergen
  | 'diet_no' // arg = diet
  | 'ingredients_unknown'
  | 'may_contain' // arg = allergen
  | 'diet_unknown' // arg = diet
  | 'nutrient_high' // arg = nutrient key
  | 'nutrient_unknown' // arg = nutrient key

export interface Reason {
  code: ReasonCode
  arg?: string
}

export interface Verdict {
  memberId: string
  alias: string
  level: VerdictLevel
  reasons: Reason[]
  /** English canonical one-liner, e.g. "Avoid for Amaya: contains sesame". */
  text: string
}

export const GOAL_NUTRIENT: Record<GoalId, 'sodium' | 'sugars' | 'fat_saturated'> = {
  low_sodium: 'sodium',
  low_sugar: 'sugars',
  low_sat_fat: 'fat_saturated',
}

const humanize = (s: string) => s.replace(/_/g, ' ')

export function reasonEnglish(r: Reason): string {
  const a = humanize(r.arg ?? '')
  switch (r.code) {
    case 'contains': return `contains ${a}`
    case 'diet_no': return `not ${a}`
    case 'ingredients_unknown': return 'ingredients not readable'
    case 'may_contain': return `may contain ${a}`
    case 'diet_unknown': return `${a} status unknown`
    case 'nutrient_high': return `high ${a}`
    case 'nutrient_unknown': return `${a} level unknown`
  }
}

export function computeVerdict(member: Member, facts: HouseholdFacts): Verdict {
  const avoid: Reason[] = []
  const check: Reason[] = []

  for (const a of member.allergens) {
    if (facts.allergens_contains.includes(a)) avoid.push({ code: 'contains', arg: a })
  }
  for (const d of member.diets) {
    if (facts.diets[d] === 'no') avoid.push({ code: 'diet_no', arg: d })
  }

  if (!facts.ingredients_known) check.push({ code: 'ingredients_unknown' })
  for (const a of member.allergens) {
    if (facts.allergens_may_contain.includes(a) && !facts.allergens_contains.includes(a)) {
      check.push({ code: 'may_contain', arg: a })
    }
  }
  for (const d of member.diets) {
    const v = facts.diets[d]
    if (v === undefined || v === 'unknown') check.push({ code: 'diet_unknown', arg: d })
  }
  for (const g of member.goals) {
    const n = GOAL_NUTRIENT[g]
    const level = facts.nutrient_levels[n]
    if (level === 'high') check.push({ code: 'nutrient_high', arg: n })
    else if (level === undefined || level === 'unknown') check.push({ code: 'nutrient_unknown', arg: n })
  }

  const level: VerdictLevel = avoid.length ? 'avoid' : check.length ? 'check' : 'none'
  const reasons = level === 'avoid' ? avoid : level === 'check' ? check : []
  let text: string
  if (level === 'none') text = `None found for ${member.alias} in what we could read`
  else {
    const word = level === 'avoid' ? 'Avoid' : 'Check'
    text = `${word} for ${member.alias}: ${reasons.map(reasonEnglish).join(', ')}`
  }
  return { memberId: member.id, alias: member.alias, level, reasons, text }
}

export function computeVerdicts(members: Member[], facts: HouseholdFacts): Verdict[] {
  return members.map((m) => computeVerdict(m, facts))
}

export function demoMembers(): Member[] {
  return [
    { id: 'demo-amaya', alias: 'Amaya', life_stage: 'child', allergens: ['sesame', 'peanut'], diets: [], goals: [] },
    { id: 'demo-dad', alias: 'Dad', life_stage: 'adult', allergens: [], diets: [], goals: ['low_sodium'] },
    { id: 'demo-ravi', alias: 'Ravi', life_stage: 'adult', allergens: [], diets: [], goals: [] },
  ]
}
