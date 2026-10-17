// Library (US-52, FR-55, FR-56): encrypted on-device scan entries with a household snapshot of verdicts only.
// Entries hold no image and no profile contents: the snapshot is {member id, profile version hash, verdict, reason codes}.
import { getSessionKey, loadLibraryBlob, saveLibraryBlob } from './store'
import type { Finding, GradeCardId, GradeLetter, HouseholdFacts, ScanResponse, Tier } from './types'
import { computeVerdict, type Member, type Reason, type VerdictLevel } from './verdict'

export const MAX_ENTRIES = 100
const SAVING_KEY = 'fivesec.librarySaving'

export interface SnapshotItem { m: string; pv: string; v: VerdictLevel; r: Reason[] }
export interface LibraryEntry {
  id: string
  ts: number
  name: string | null
  brand: string | null
  barcode: string | null
  label_hash: string
  grade: GradeLetter | null
  cards: { id: GradeCardId; grade: GradeLetter | null; tier: Tier; headline: string }[]
  findings: Finding[]
  facts: HouseholdFacts
  list_item_id: string | null
  snapshot: SnapshotItem[]
  /** the snapshot as first saved; kept when a re-check replaces `snapshot` */
  original: SnapshotItem[] | null
}
export interface LibraryQuery {
  text?: string
  /** inclusive epoch ms bounds */
  from?: number
  to?: number
  grades?: GradeLetter[]
  verdict?: VerdictLevel
  memberId?: string
}

/** Short hash of the profile's decision fields. Changes when allergies, diets, goals or life stage change; reveals nothing. */
export function profileVersion(m: Member): string {
  const s = JSON.stringify([m.life_stage, [...m.allergens].sort(), [...m.diets].sort(), [...m.goals].sort()])
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(36)
}

export function snapshotFor(facts: HouseholdFacts, members: Member[]): SnapshotItem[] {
  return members.map((m) => {
    const v = computeVerdict(m, facts)
    return { m: m.id, pv: profileVersion(m), v: v.level, r: v.reasons }
  })
}

export const librarySaving = (): boolean => {
  try { return localStorage.getItem(SAVING_KEY) !== 'off' } catch { return true }
}
export const setLibrarySaving = (on: boolean) => {
  try { if (on) localStorage.removeItem(SAVING_KEY); else localStorage.setItem(SAVING_KEY, 'off') } catch { /* ignore */ }
}

// serialise read-modify-write
let chain: Promise<unknown> = Promise.resolve()
function mutate<T>(f: (cur: LibraryEntry[], key: CryptoKey) => Promise<{ next?: LibraryEntry[]; out: T }>): Promise<T | undefined> {
  const run = async () => {
    const key = getSessionKey()
    if (!key) return undefined
    const cur = await loadLibraryBlob<LibraryEntry>(key)
    const { next, out } = await f(cur, key)
    if (next) await saveLibraryBlob(key, next)
    return out
  }
  const p = chain.then(run, run)
  chain = p.catch(() => {})
  return p
}

/** Saves one scan; no-op (returns null) when saving is paused or the vault is locked. */
export async function saveScan(result: ScanResponse, members: Member[], listItemId?: string | null): Promise<LibraryEntry | null> {
  if (!librarySaving()) return null
  const a = result.analysis
  const entry: LibraryEntry = {
    id: crypto.randomUUID(), ts: Date.now(),
    name: a.product.name.value, brand: a.product.brand.value, barcode: a.product.barcode,
    label_hash: result.scan_id, grade: a.grade.letter,
    cards: a.cards.map((c) => ({ id: c.id, grade: c.grade, tier: c.tier, headline: c.headline })),
    findings: a.findings, facts: a.facts, list_item_id: listItemId ?? null,
    snapshot: snapshotFor(a.facts, members), original: null,
  }
  const r = await mutate(async (cur) => ({ next: [entry, ...cur.filter((e) => !(e.label_hash === entry.label_hash && entry.ts - e.ts < 60_000))].slice(0, MAX_ENTRIES), out: entry }))
  return r ?? null
}

export function filterEntries(all: LibraryEntry[], q: LibraryQuery = {}): LibraryEntry[] {
  const text = q.text?.trim().toLocaleLowerCase()
  return all.filter((e) => {
    if (text && !`${e.name ?? ''} ${e.brand ?? ''}`.toLocaleLowerCase().includes(text)) return false
    if (q.from !== undefined && e.ts < q.from) return false
    if (q.to !== undefined && e.ts > q.to) return false
    if (q.grades?.length && !(e.grade && q.grades.includes(e.grade))) return false
    if (q.verdict) {
      const s = q.memberId ? e.snapshot.filter((x) => x.m === q.memberId) : e.snapshot
      if (!s.some((x) => x.v === q.verdict)) return false
    }
    return true
  }).sort((a, b) => b.ts - a.ts)
}

export async function listEntries(q: LibraryQuery = {}): Promise<LibraryEntry[]> {
  return filterEntries((await mutate(async (cur) => ({ out: cur }))) ?? [], q)
}
export async function deleteEntry(id: string): Promise<void> {
  await mutate(async (cur) => ({ next: cur.filter((e) => e.id !== id), out: 0 }))
}
export async function deleteAll(): Promise<void> {
  await mutate(async () => ({ next: [], out: 0 }))
}
/** Removes the given members' verdicts from every entry. */
export async function purgeMember(ids: string[]): Promise<void> {
  await mutate(async (cur) => ({
    next: cur.map((e) => ({
      ...e, snapshot: e.snapshot.filter((x) => !ids.includes(x.m)), original: e.original && e.original.filter((x) => !ids.includes(x.m)),
    })), out: 0,
  }))
}

/** True when any current member has no verdict in the entry or a different profile version ("Profile changed since"). */
export function isStale(entry: LibraryEntry, members: Member[]): boolean {
  return members.some((m) => {
    const s = entry.snapshot.find((x) => x.m === m.id)
    return !s || s.pv !== profileVersion(m)
  })
}
/** Names of members whose profile changed since the scan (for the notice). */
export function staleMembers(entry: LibraryEntry, members: Member[]): Member[] {
  return members.filter((m) => { const s = entry.snapshot.find((x) => x.m === m.id); return !s || s.pv !== profileVersion(m) })
}

/** Recomputes verdicts in code from the stored facts; the first snapshot is kept in `original`. Persists and returns the entry. */
export async function recheck(entry: LibraryEntry, members: Member[]): Promise<LibraryEntry> {
  const next: LibraryEntry = { ...entry, snapshot: snapshotFor(entry.facts, members), original: entry.original ?? entry.snapshot }
  await mutate(async (cur) => ({ next: cur.map((e) => (e.id === entry.id ? next : e)), out: 0 }))
  return next
}
