// On-device frame quality check (never leaves the phone). Runs on a downscaled canvas.
export interface FrameQuality {
  blur: number // Laplacian variance (higher = sharper)
  glare: number // fraction of blown-out pixels
  edges: number // edge density, proxy for text on the pack
  ok: boolean
  issue: 'blur' | 'glare' | 'no_text' | null
}

export const THRESH = { blur: 45, glare: 0.1, edges: 0.03 }

export function analyzeFrame(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): FrameQuality {
  const g = new Float32Array(w * h)
  let blown = 0
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    const y = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
    g[i] = y
    if (y >= 250) blown++
  }
  let sum = 0, sum2 = 0, n = 0, edge = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const lap = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i]
      sum += lap; sum2 += lap * lap; n++
      if (Math.abs(g[i + 1] - g[i - 1]) + Math.abs(g[i + w] - g[i - w]) > 60) edge++
    }
  }
  const mean = n ? sum / n : 0
  const blur = n ? sum2 / n - mean * mean : 0
  const glare = blown / g.length
  const edges = n ? edge / n : 0
  const issue = glare > THRESH.glare ? 'glare' : blur < THRESH.blur ? 'blur' : edges < THRESH.edges ? 'no_text' : null
  return { blur, glare, edges, ok: issue === null, issue }
}
