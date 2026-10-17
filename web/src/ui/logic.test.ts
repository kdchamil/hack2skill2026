import { describe, expect, it } from 'vitest'
import { t as tr } from '../i18n'
import { clampWords, moreAria, ringAria, splitRings, type RingMember } from './logic'

const t = (k: string, v?: Record<string, string | number>) => tr('en', k, v)
const m = (id: string, level: RingMember['level']): RingMember => ({ id, name: id, level })

describe('splitRings', () => {
  it('shows up to 4 with no +N', () => {
    const r = splitRings([m('a', 'none'), m('b', 'none'), m('c', 'none'), m('d', 'avoid')])
    expect(r.shown).toHaveLength(4); expect(r.hidden).toHaveLength(0); expect(r.hiddenLevel).toBeNull()
  })
  it('hides the rest behind +N and surfaces Avoid', () => {
    const r = splitRings(['a', 'b', 'c', 'd'].map((x) => m(x, 'none')).concat([m('e', 'check'), m('f', 'avoid')]))
    expect(r.hidden.map((x) => x.id)).toEqual(['e', 'f']); expect(r.hiddenAvoid).toBe(1); expect(r.hiddenLevel).toBe('avoid')
  })
  it('hidden Check without Avoid shows check, else none', () => {
    const base = ['a', 'b', 'c', 'd'].map((x) => m(x, 'avoid'))
    expect(splitRings([...base, m('e', 'check')]).hiddenLevel).toBe('check')
    expect(splitRings([...base, m('e', 'none')]).hiddenLevel).toBe('none')
  })
})

describe('aria text', () => {
  it('one line per member', () => {
    expect(ringAria(t, { id: 'a', name: 'Amaya', level: 'avoid', reason: 'Contains sesame' })).toBe('Amaya: Avoid. Contains sesame.')
    expect(ringAria(t, { id: 'a', name: 'Amaya', level: 'none' })).toBe('Amaya: None found.')
  })
  it('+N announces avoid count', () => expect(moreAria(t, 2, 1)).toBe('2 more members. 1 to avoid.'))
  it('clamps headlines to 12 words', () => {
    expect(clampWords('one two three four five six seven eight nine ten eleven twelve thirteen')).toBe('one two three four five six seven eight nine ten eleven twelve…')
  })
})
