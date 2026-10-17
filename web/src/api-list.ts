// List parsing and ranges. parseList sends only the pasted text and language; nothing about the household.
import { ApiFailure } from './api'
import type { Lang, ListParseResponse, ParsedItem, Range, RangesResponse } from './types'

export async function parseList(text: string, lang: Lang): Promise<ParsedItem[]> {
  const r = await fetch('/api/list/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 2000), lang }) })
  if (!r.ok) throw new ApiFailure(String(r.status), r.status === 429 ? 'Too many requests' : 'List parsing unavailable')
  return ((await r.json()) as ListParseResponse).items
}

let cache: Promise<Range[]> | null = null
export function getRanges(): Promise<Range[]> {
  cache ??= fetch('/api/ranges').then(async (r) => {
    if (!r.ok) throw new ApiFailure(String(r.status), 'Ranges unavailable')
    return ((await r.json()) as RangesResponse).ranges
  }).catch((e) => { cache = null; throw e })
  return cache
}
export const resetRangesCache = () => { cache = null }
