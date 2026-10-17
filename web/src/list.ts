// Shopping list state (on the phone), matching scans to list items in code (FR-51), compare prompt (FR-52).
// Persistence: AES-GCM with the profile data key via crypto.ts, in the same IndexedDB store as scans. No key = memory only.
import { useSyncExternalStore } from 'react'
import { getRanges } from './api-list'
import { decryptJson, encryptJson } from './crypto'
import type { Analysis, GradeLetter, ParsedItem, Range, ScanResponse } from './types'

export const BASKET_TTL_MS = 30 * 24 * 3600 * 1000
const MAX_SCANS = 40

export interface ScanLite { scan_id: string; name: string; grade: GradeLetter | null; range: string | null; analysis: Analysis; ts: number }
export interface ListItem {
  id: string; name: string; quantity: number | null; unit: string | null; brand: string | null; range_id: string | null
  found: { scanId: string } | null
}
export interface ComparePair { itemId: string; firstScanId: string; secondScanId: string }
export type Match = { kind: 'tick'; itemId: string } | { kind: 'ask'; candidates: string[] } | { kind: 'none' }
export interface BasketState { startedAt: number; chosen: string[]; setAside: string[] }
export interface ListState {
  items: ListItem[]
  scans: Record<string, ScanLite>
  basket: BasketState | null
  promptedPairs: string[]
  /** transient, not persisted */
  ask: { scanId: string; candidates: string[] } | null
  compare: ComparePair | null
  comparing: ComparePair | null
}

const empty = (): ListState => ({ items: [], scans: {}, basket: null, promptedPairs: [], ask: null, compare: null, comparing: null })
let state: ListState = empty()
let key: CryptoKey | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const set = (p: Partial<ListState>, persist = true) => { state = { ...state, ...p }; emit(); if (persist) void save() }
export const getListState = () => state
export const subscribeList = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const useListState = () => useSyncExternalStore(subscribeList, getListState)
export const resetListState = () => { state = empty(); key = null; emit() }

// ---- encrypted persistence ----
const DB = 'fivesec', STORE = 'kv', KEY = 'list'
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function kv<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((res, rej) => {
      const t = db.transaction(STORE, mode)
      const req = f(t.objectStore(STORE))
      t.oncomplete = () => res(req.result)
      t.onerror = () => rej(t.error)
    })
  } finally { db.close() }
}
type Saved = Pick<ListState, 'items' | 'scans' | 'basket' | 'promptedPairs'>
async function save() {
  if (!key) return
  const { items, scans, basket, promptedPairs } = state
  try { const blob = await encryptJson(key, { items, scans, basket, promptedPairs } satisfies Saved); await kv('readwrite', (s) => s.put(blob, KEY)) } catch { /* memory copy stays */ }
}
/** Call when the vault unlocks (key) or locks (null). Loads the saved list; applies basket expiry. */
export async function setListKey(k: CryptoKey | null, now = Date.now()) {
  key = k
  if (!k) { state = empty(); emit(); return }
  try {
    const blob = await kv<string | undefined>('readonly', (s) => s.get(KEY))
    if (blob) state = { ...empty(), ...(await decryptJson<Saved>(k, blob)) }
  } catch { /* keep memory */ }
  expireBasket(now)
  emit()
}

// ---- list editing ----
let seq = 0
const uid = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`
export const toItems = (p: ParsedItem[]): ListItem[] => p.filter((x) => x.name.trim()).map((x) => ({ ...x, name: x.name.trim(), id: uid(), found: null }))
export const saveItems = (items: ListItem[]) => set({ items })
export const removeItem = (id: string) => set({ items: state.items.filter((i) => i.id !== id) })
export const clearList = () => set({ items: [] })
export const progress = (items: ListItem[]) => ({ found: items.filter((i) => i.found).length, open: items.filter((i) => !i.found).length })

// ---- matching (FR-51) ----
const norm = (s: string) => s.toLocaleLowerCase().normalize('NFC')
const kws = (r: Range) => [...r.keywords.en, ...r.keywords.si, ...r.keywords.ta].map(norm).filter(Boolean)
function itemRange(i: ListItem, ranges: Range[]): string | null {
  if (i.range_id) return i.range_id
  const n = norm(i.name)
  return ranges.find((r) => kws(r).some((k) => n.includes(k)))?.id ?? null
}

/** Open items first; tick when exactly one open item shares the product range, ask when several or only the name hints at it. */
export function matchScan(a: Analysis, items: ListItem[], ranges: Range[] = []): Match {
  const open = items.filter((i) => !i.found)
  const pr = a.product_range
  if (pr) {
    const hit = open.filter((i) => itemRange(i, ranges) === pr)
    if (hit.length === 1) return { kind: 'tick', itemId: hit[0].id }
    if (hit.length > 1) return { kind: 'ask', candidates: hit.map((i) => i.id) }
  }
  const pn = norm(`${a.product.name.value ?? ''} ${a.product.category.value ?? ''}`)
  const loose = open.filter((i) => { const n = norm(i.name); return n.length > 2 && pn.includes(n) })
  return loose.length ? { kind: 'ask', candidates: loose.map((i) => i.id) } : { kind: 'none' }
}

export const toLite = (r: ScanResponse): ScanLite => ({
  scan_id: r.scan_id, name: r.analysis.product.name.value ?? '', grade: r.analysis.grade.letter, range: r.analysis.product_range, analysis: r.analysis, ts: Date.now(),
})
const pairKey = (a: string, b: string) => [a, b].sort().join('|')

function rememberScan(l: ScanLite) {
  const scans = { ...state.scans, [l.scan_id]: l }
  const ids = Object.keys(scans)
  if (ids.length > MAX_SCANS) {
    const used = new Set([...state.items.map((i) => i.found?.scanId), ...(state.basket?.chosen ?? []), ...(state.basket?.setAside ?? [])])
    ids.filter((id) => !used.has(id)).sort((a, b) => scans[a].ts - scans[b].ts).slice(0, ids.length - MAX_SCANS).forEach((id) => delete scans[id])
  }
  return scans
}

export function tickItem(itemId: string, scanId: string) {
  set({ items: state.items.map((i) => (i.id === itemId ? { ...i, found: { scanId } } : i)), ask: null })
}

/** Apply a finished scan: tick a clear match, queue an "Is this for...?" question for an unclear one, return a compare prompt when a second product shares a range with a ticked or pending item (FR-52). */
export async function onScanCompleted(r: ScanResponse): Promise<{ comparePrompt: ComparePair } | null> {
  const lite = toLite(r)
  if (!state.items.length) { set({ scans: rememberScan(lite) }); return null }
  const ranges = await getRanges().catch(() => [] as Range[])
  set({ scans: rememberScan(lite) })
  // second product in the same range as an item already ticked, or another scan still pending on it?
  const other = state.items.find((i) => i.found && i.found.scanId !== r.scan_id && itemRange(i, ranges) !== null && itemRange(i, ranges) === lite.range)
  const m = matchScan(r.analysis, state.items, ranges)
  let first: string | null = null, itemId = ''
  if (other?.found) { first = other.found.scanId; itemId = other.id }
  else if (m.kind === 'tick') tickItem(m.itemId, r.scan_id)
  else if (m.kind === 'ask') {
    const prior = state.ask
    if (prior && prior.scanId !== r.scan_id && state.scans[prior.scanId]?.range && state.scans[prior.scanId].range === lite.range) { first = prior.scanId; itemId = m.candidates[0] }
    set({ ask: { scanId: r.scan_id, candidates: m.candidates } }, false)
  }
  if (!first) return null
  const k = pairKey(first, r.scan_id)
  if (state.promptedPairs.includes(k)) return null
  const comparePrompt = { itemId, firstScanId: first, secondScanId: r.scan_id }
  set({ promptedPairs: [...state.promptedPairs, k], compare: comparePrompt }, true)
  return { comparePrompt }
}

export const answerAsk = (itemId: string | null) => { const a = state.ask; if (a && itemId) tickItem(itemId, a.scanId); else set({ ask: null }, false) }
export const dismissCompare = () => set({ compare: null }, false)
export const openCompare = (p: ComparePair) => set({ comparing: p, compare: null }, false)

// ---- compare choice -> basket ----
export function chooseProduct(chosen: string, other: string, itemId?: string) {
  const b = state.basket ?? { startedAt: Date.now(), chosen: [], setAside: [] }
  set({
    basket: { ...b, chosen: [...b.chosen.filter((x) => x !== chosen && x !== other), chosen], setAside: [...b.setAside.filter((x) => x !== other && x !== chosen), other] },
    items: itemId ? state.items.map((i) => (i.id === itemId ? { ...i, found: { scanId: chosen } } : i)) : state.items,
    comparing: null,
  })
}
export function expireBasket(now = Date.now()) {
  if (state.basket && now - state.basket.startedAt > BASKET_TTL_MS) set({ basket: null })
}
export const endTrip = () => set({ basket: null, items: state.items.map((i) => ({ ...i, found: null })) })

// Automated browsers only (Playwright sets navigator.webdriver): lets e2e seed scans without a camera.
if (typeof navigator !== 'undefined' && navigator.webdriver) (window as unknown as { __fsList: unknown }).__fsList = { onScanCompleted, openCompare, chooseProduct, saveItems, toItems }
