import { beforeEach, describe, expect, it, vi } from 'vitest'
import { summarizeBasket } from './basket'
import * as L from './list'
import type { Analysis, Range, ScanResponse } from './types'
import { demoMembers } from './verdict'

vi.mock('./api-list', () => ({ getRanges: async () => RANGES, parseList: async () => [] }))
const RANGES: Range[] = [
  { id: 'milk_powder', name: 'Milk powder', keywords: { en: ['milk powder'], si: [], ta: [] } },
  { id: 'biscuits', name: 'Biscuits', keywords: { en: ['biscuit'], si: [], ta: [] } },
]
const an = (name: string, range: string | null, letter: 'A' | 'C' | null = 'B' as never, over: Partial<Analysis['facts']> = {}, abbr?: string): Analysis => ({
  product: { name: { value: name, confidence: 1 }, category: { value: 'food', confidence: 1 } },
  findings: abbr ? [{ topic: 'packaging', data: { abbr } }] : [], cards: [], grade: { letter, reason: null, planet_partial: false, drivers: [], rule_version: 'x' },
  product_range: range, facts: { allergens_contains: [], allergens_may_contain: [], ingredients_known: true, diets: {}, nutrient_levels: {}, canonical_ingredient_ids: [], ...over },
} as unknown as Analysis)
const scan = (id: string, a: Analysis) => ({ scan_id: id, analysis: a }) as ScanResponse
const item = (name: string, range: string | null = null): L.ListItem => ({ id: name, name, quantity: null, unit: null, brand: null, range_id: range, found: null })

beforeEach(() => L.resetListState())

describe('matchScan', () => {
  const items = [item('milk powder'), item('rice')]
  it('ticks on range via keyword', () => expect(L.matchScan(an('Anchor', 'milk_powder'), items, RANGES)).toEqual({ kind: 'tick', itemId: 'milk powder' }))
  it('asks when several items share the range', () => {
    expect(L.matchScan(an('Anchor', 'milk_powder'), [item('a', 'milk_powder'), item('b', 'milk_powder')])).toEqual({ kind: 'ask', candidates: ['a', 'b'] })
  })
  it('asks when only the name hints', () => expect(L.matchScan(an('Rice flakes', null), items)).toEqual({ kind: 'ask', candidates: ['rice'] }))
  it('none otherwise', () => expect(L.matchScan(an('Soap', 'soap'), items, RANGES)).toEqual({ kind: 'none' }))
  it('ignores found items', () => expect(L.matchScan(an('A', 'milk_powder'), [{ ...item('m', 'milk_powder'), found: { scanId: 'x' } }])).toEqual({ kind: 'none' }))
})

describe('onScanCompleted', () => {
  it('ticks, then prompts compare once per pair', async () => {
    L.saveItems([item('milk powder', 'milk_powder')])
    expect(await L.onScanCompleted(scan('s1', an('Anchor', 'milk_powder')))).toBeNull()
    expect(L.getListState().items[0].found?.scanId).toBe('s1')
    const r = await L.onScanCompleted(scan('s2', an('Nespray', 'milk_powder')))
    expect(r?.comparePrompt).toEqual({ itemId: 'milk powder', firstScanId: 's1', secondScanId: 's2' })
    expect(await L.onScanCompleted(scan('s2', an('Nespray', 'milk_powder')))).toBeNull()
    L.dismissCompare()
    expect(L.getListState().items[0].found?.scanId).toBe('s1') // Not now keeps the first
  })
  it('queues an ask for unclear matches', async () => {
    L.saveItems([item('rice')])
    await L.onScanCompleted(scan('s1', an('Rice flakes', null)))
    expect(L.getListState().ask?.candidates).toEqual(['rice'])
    L.answerAsk('rice')
    expect(L.getListState().items[0].found?.scanId).toBe('s1')
  })
  it('parse review edits survive toItems', () => {
    const it2 = L.toItems([{ name: ' Milk ', quantity: 2, unit: 'kg', brand: null, range_id: null }, { name: ' ', quantity: null, unit: null, brand: null, range_id: null }])
    expect(it2).toHaveLength(1)
    expect(it2[0].name).toBe('Milk')
    L.saveItems(it2); L.removeItem(it2[0].id)
    expect(L.getListState().items).toHaveLength(0)
  })
})

describe('basket', () => {
  it('aggregates spread, alerts, packaging, expiry', async () => {
    await L.onScanCompleted(scan('s1', an('Kokis', 'biscuits', 'C', { allergens_contains: ['sesame'] }, 'PET')))
    await L.onScanCompleted(scan('s2', an('Other', 'biscuits', 'A')))
    L.chooseProduct('s1', 's2')
    const st = L.getListState()
    const b = summarizeBasket(st, demoMembers())
    expect(b.spread.C).toBe(1)
    expect(b.alerts.some((a) => a.alias === 'Amaya' && a.level === 'avoid')).toBe(true)
    expect(b.packaging).toEqual({ PET: 1 })
    expect(st.basket?.setAside).toEqual(['s2'])
    L.expireBasket(Date.now() + 29 * 864e5)
    expect(L.getListState().basket).not.toBeNull()
    L.expireBasket(Date.now() + 31 * 864e5)
    expect(L.getListState().basket).toBeNull()
  })
})
