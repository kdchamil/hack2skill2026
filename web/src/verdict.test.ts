import { describe, expect, it } from 'vitest'
import type { HouseholdFacts } from './types'
import { computeVerdict, demoMembers, type Member } from './verdict'

const facts = (o: Partial<HouseholdFacts> = {}): HouseholdFacts => ({
  allergens_contains: [],
  allergens_may_contain: [],
  ingredients_known: true,
  diets: { vegan: 'yes', vegetarian: 'yes', gluten_free: 'yes', lactose_free: 'yes', halal: 'yes', kosher: 'yes' },
  nutrient_levels: { sodium: 'low', sugars: 'low', fat_saturated: 'low' },
  canonical_ingredient_ids: [],
  ...o,
})
const m = (o: Partial<Member> = {}): Member => ({
  id: 'x', alias: 'Amaya', life_stage: 'adult', allergens: [], diets: [], goals: [], ...o,
})

describe('verdict', () => {
  it('none found when nothing matches', () => {
    const v = computeVerdict(m({ allergens: ['sesame'], diets: ['vegan'], goals: ['low_sodium'] }), facts())
    expect(v.level).toBe('none')
    expect(v.text).toContain('in what we could read')
  })
  it('avoid on contains', () => {
    const v = computeVerdict(m({ allergens: ['sesame', 'peanut'] }), facts({ allergens_contains: ['sesame'] }))
    expect(v.level).toBe('avoid')
    expect(v.text).toBe('Avoid for Amaya: contains sesame')
  })
  it('avoid when required diet is no', () => {
    const v = computeVerdict(m({ diets: ['vegan'] }), facts({ diets: { vegan: 'no' } }))
    expect(v.level).toBe('avoid')
    expect(v.reasons[0]).toEqual({ code: 'diet_no', arg: 'vegan' })
  })
  it('check when ingredients unknown, even with no profile', () => {
    const v = computeVerdict(m(), facts({ ingredients_known: false }))
    expect(v.level).toBe('check')
    expect(v.reasons[0].code).toBe('ingredients_unknown')
  })
  it('check on may contain', () => {
    const v = computeVerdict(m({ allergens: ['egg'] }), facts({ allergens_may_contain: ['egg'] }))
    expect(v.level).toBe('check')
    expect(v.text).toBe('Check for Amaya: may contain egg')
  })
  it('may contain ignored for other allergens', () => {
    expect(computeVerdict(m({ allergens: ['milk'] }), facts({ allergens_may_contain: ['egg'] })).level).toBe('none')
  })
  it('check when diet unknown or missing', () => {
    expect(computeVerdict(m({ diets: ['halal'] }), facts({ diets: { halal: 'unknown' } })).level).toBe('check')
    expect(computeVerdict(m({ diets: ['halal'] }), facts({ diets: {} })).level).toBe('check')
  })
  it('check when goal nutrient high', () => {
    const v = computeVerdict(m({ alias: 'Dad', goals: ['low_sodium'] }), facts({ nutrient_levels: { sodium: 'high' } }))
    expect(v.level).toBe('check')
    expect(v.text).toBe('Check for Dad: high sodium')
  })
  it('check when goal nutrient unknown or missing; medium is fine', () => {
    expect(computeVerdict(m({ goals: ['low_sugar'] }), facts({ nutrient_levels: { sugars: 'unknown' } })).level).toBe('check')
    expect(computeVerdict(m({ goals: ['low_sat_fat'] }), facts({ nutrient_levels: {} })).level).toBe('check')
    expect(computeVerdict(m({ goals: ['low_sugar'] }), facts({ nutrient_levels: { sugars: 'medium' } })).level).toBe('none')
  })
  it('avoid wins over check and lists only avoid reasons', () => {
    const v = computeVerdict(
      m({ allergens: ['sesame', 'egg'] }),
      facts({ allergens_contains: ['sesame'], allergens_may_contain: ['egg'], ingredients_known: false }),
    )
    expect(v.level).toBe('avoid')
    expect(v.reasons.every((r) => r.code === 'contains')).toBe(true)
  })
  it('contains + may contain of same allergen is only avoid', () => {
    const v = computeVerdict(m({ allergens: ['sesame'] }), facts({ allergens_contains: ['sesame'], allergens_may_contain: ['sesame'] }))
    expect(v.reasons).toHaveLength(1)
  })
  it('demo household matches the demo story', () => {
    const f = facts({ allergens_contains: ['sesame'], nutrient_levels: { sodium: 'high' } })
    const [amaya, dad, ravi] = demoMembers().map((d) => computeVerdict(d, f))
    expect([amaya.level, dad.level, ravi.level]).toEqual(['avoid', 'check', 'none'])
  })
})
