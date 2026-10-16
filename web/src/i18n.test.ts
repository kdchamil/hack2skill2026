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
