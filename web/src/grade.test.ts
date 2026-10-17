import { describe, expect, it } from 'vitest'
import { gradeSentence, areaStatus, claimVerdict, nextArea, relevantTo, sortFor, topNutrient } from './grade'
import { t as tr } from './i18n'
import type { Area, Finding } from './types'
import type { Member } from './verdict'

const f = (id: string, topic: Finding['topic'], data: Record<string, unknown>): Finding => ({ id, area: 'body', topic, card: null, category: '', severity: 'info', risk: 'no_known_concern', tier: 'label_stated', title: id, reason: '', next_step: null, sources: [], data })
const dad: Member = { id: 'd', alias: 'Dad', life_stage: 'adult', allergens: ['sesame'], diets: [], goals: ['low_sodium'] }

describe('grade helpers', () => {
  it('walks areas in order and ends', () => { expect(nextArea('body')).toBe('planet'); expect(nextArea('choice')).toBeNull() })
  it('member relevance sorts first', () => {
    const fs = [f('a', 'nutrition', { nutrient: 'sugars_total' }), f('b', 'nutrition', { nutrient: 'sodium_mg' }), f('c', 'allergens', { allergen: 'sesame' })]
    expect(relevantTo(fs[1], dad)).toBe(true)
    expect(sortFor(fs, dad).map((x) => x.id)).toEqual(['b', 'c', 'a'])
    expect(sortFor(fs, undefined)).toBe(fs)
  })
  it('top nutrient by pct_ri', () => { expect(topNutrient([f('a', 'nutrition', { pct_ri: 5 }), f('b', 'nutrition', { pct_ri: 12 })])?.pct).toBe(12); expect(topNutrient([])).toBeNull() })
  it('claim verdict falls back to unverifiable', () => { expect(claimVerdict(f('x', 'claims', { verdict: 'contradicted' }))).toBe('contradicted'); expect(claimVerdict(f('x', 'claims', {}))).toBe('unverifiable') })
  it('area status from tier', () => { expect(areaStatus({ tier: 'unknown' } as Area)).toBe('unknown'); expect(areaStatus({ tier: 'verified' } as Area)).toBe('known') })
})

describe('gradeSentence', () => {
  const T = (k: string, v?: Record<string, string | number>) => tr('en', k, v)
  const card = (id: string, grade: 'A' | 'B' | 'C' | 'D' | 'E' | null) => ({ id, grade })
  it('says which cards pulled down and which helped', () => {
    expect(gradeSentence(T, [card('nutrition', 'E'), card('additives', 'A'), card('processing', 'C'), card('allergens', null)], 'D'))
      .toBe('Grade D. Pulled down by Nutrition (E). Helped by Additives (A).')
  })
  it('lists several cards worst first and omits empty directions', () => {
    expect(gradeSentence(T, [card('nutrition', 'D'), card('additives', 'E')], 'D')).toBe('Grade D. Pulled down by Additives (E) and Nutrition (D).')
  })
  it('is empty when nothing moved the grade', () => { expect(gradeSentence(T, [card('nutrition', 'C')], 'C')).toBe('') })
})
