import { describe, expect, it } from 'vitest'
import { analyzeFrame } from './quality'

const mk = (w: number, h: number, f: (x: number, y: number) => number) => {
  const a = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = f(x, y), i = (y * w + x) * 4
    a[i] = a[i + 1] = a[i + 2] = v; a[i + 3] = 255
  }
  return a
}
describe('analyzeFrame', () => {
  it('accepts sharp text-like pattern', () => {
    const q = analyzeFrame(mk(80, 60, (x, y) => ((x >> 1) + (y >> 1)) % 2 ? 40 : 200), 80, 60)
    expect(q.ok).toBe(true)
  })
  it('flags flat frame as blurry', () => {
    expect(analyzeFrame(mk(80, 60, () => 120), 80, 60).issue).toBe('blur')
  })
  it('flags glare', () => {
    expect(analyzeFrame(mk(80, 60, () => 255), 80, 60).issue).toBe('glare')
  })
  it('flags soft gradient as blur', () => {
    expect(analyzeFrame(mk(80, 60, (x) => x * 3), 80, 60).issue).toBe('blur')
  })
})
