import { describe, expect, it } from 'vitest'
import { DICTS, t } from './i18n'

describe('i18n', () => {
  it('si and ta cover every en key ', () => {
    for (const l of ['si', 'ta'] as const) {
      const missing = Object.keys(DICTS.en).filter((k) => !(k in DICTS[l]))
      expect(missing, l).toEqual([])
    }
  })
  it('keeps placeholders', () => {
    for (const l of ['si', 'ta'] as const) {
      for (const [k, v] of Object.entries(DICTS.en)) {
        const ph = v.match(/\{\w+\}/g) ?? []
        for (const p of ph) expect(DICTS[l][k] ?? p, `${l}:${k}`).toContain(p)
      }
    }
  })
  it('interpolates', () => expect(t('en', 'v.avoid', { name: 'A', reasons: 'x' })).toBe('Avoid for A: x'))
})

describe('i18n translations are real', () => {
  const ALLOW = new Set<string>([
    'nav.scan', 'grade.and', 'hh2.summary', 'bsk.alertLine', 'detail.member', 'ring.aria', 'ring.ariaBare', 'bsk.spreadAria',
    'scan.torch',
  ])
  it('every en key has si and ta values that are non-empty and differ from en', () => {
    for (const l of ['si', 'ta'] as const) {
      const bad = Object.entries(DICTS.en).filter(([k, v]) => {
        const x = DICTS[l][k]
        return !x || !x.trim() || (x === v && !ALLOW.has(k))
      }).map(([k]) => k)
      expect(bad, l).toEqual([])
    }
  })
})
