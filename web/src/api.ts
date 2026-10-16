// API client. The scan request carries ONLY images, barcode, lang, market, fixture. Never profile data.
import { parseSSE } from './sse'
import type { Analysis, ApiError, Commentary, Lang, ScanResponse } from './types'

export interface ScanInput {
  images: Blob[]
  barcode?: string | null
  lang: Lang
  market?: string
  fixture?: string
}
export interface ScanHandlers {
  onAnalysis: (a: Analysis, ms: number) => void
  onCommentary: (c: Commentary) => void
  onDone: (r: ScanResponse, ms: number) => void
}

// 1x1 transparent PNG used as a placeholder when a demo fixture is requested.
export const PLACEHOLDER_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

export class ApiFailure extends Error {
  code: string
  constructor(code: string, message: string) { super(message); this.code = code }
}

export async function scan(input: ScanInput, h: ScanHandlers, signal?: AbortSignal): Promise<void> {
  const fd = new FormData()
  input.images.forEach((b, i) => fd.append('images', b, `img${i}.${b.type.includes('png') ? 'png' : 'jpg'}`))
  if (input.barcode) fd.append('barcode', input.barcode)
  fd.append('lang', input.lang)
  fd.append('market', input.market ?? 'SG')
  if (input.fixture) fd.append('fixture', input.fixture)
  const t0 = performance.now()
  const res = await fetch('/api/scan', { method: 'POST', body: fd, signal, headers: { Accept: 'text/event-stream' } })
  if (!res.ok || !res.body) {
    let msg = `Scan failed (${res.status})`
    try { msg = ((await res.json()) as { detail?: string; message?: string }).message ?? msg } catch { /* ignore */ }
    throw new ApiFailure(String(res.status), msg)
  }
  for await (const ev of parseSSE(res.body)) {
    const ms = Math.round(performance.now() - t0)
    if (ev.event === 'analysis') h.onAnalysis(JSON.parse(ev.data) as Analysis, ms)
    else if (ev.event === 'commentary') h.onCommentary(JSON.parse(ev.data) as Commentary)
    else if (ev.event === 'done') h.onDone(JSON.parse(ev.data) as ScanResponse, ms)
    else if (ev.event === 'error') {
      const e = JSON.parse(ev.data) as ApiError
      throw new ApiFailure(e.code, e.message)
    }
  }
}

const json = (body: unknown): RequestInit => ({
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

export async function fetchCommentary(scan_id: string, lang: Lang): Promise<Commentary> {
  const r = await fetch('/api/commentary', json({ scan_id, lang }))
  if (!r.ok) throw new ApiFailure(String(r.status), 'Commentary unavailable')
  return (await r.json()) as Commentary
}

export async function fetchTts(text: string, lang: Lang): Promise<Blob> {
  const r = await fetch('/api/tts', json({ text, lang }))
  if (!r.ok) throw new ApiFailure(String(r.status), 'Audio unavailable')
  return await r.blob()
}

/** No profile data: only scan_id, finding_id, optional note. */
export async function reportFinding(scan_id: string, finding_id?: string, note?: string): Promise<void> {
  const r = await fetch('/api/report', json({ scan_id, finding_id, note }))
  if (!r.ok) throw new ApiFailure(String(r.status), 'Report failed')
}

export interface FixtureInfo { name: string; title: string }
export async function fetchFixtures(): Promise<FixtureInfo[]> {
  const r = await fetch('/api/fixtures')
  if (!r.ok) throw new ApiFailure(String(r.status), 'Fixtures unavailable')
  const j = (await r.json()) as unknown
  const list = Array.isArray(j) ? j : ((j as { fixtures?: unknown[] }).fixtures ?? [])
  return list.map((x) => (typeof x === 'string' ? { name: x, title: x } : (x as FixtureInfo)))
}
