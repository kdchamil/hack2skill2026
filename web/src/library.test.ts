import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createVault } from './crypto'
import { deleteAll as libDeleteAll, deleteEntry, isStale, listEntries, profileVersion, purgeMember, recheck, saveScan, setLibrarySaving } from './library'
import { deleteAll } from './privacy'
import { getSessionKey, loadLibraryBlob, setSessionKey, wipeAll } from './store'
import type { ScanResponse } from './types'
import { demoMembers, type Member } from './verdict'
import sample from '../tests/fixtures/sample-analysis.json'

const scan = (id = 's1', name = 'Kokis'): ScanResponse => {
  const a = structuredClone(sample.analysis) as unknown as ScanResponse['analysis']
  a.product.name.value = name
  return { scan_id: id, analysis: a, commentary: sample.commentary_en as never, trace: [], model_calls: 0, cached: false }
}
const mem = new Map<string, string>()
const ls = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size } }
Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
let members: Member[]
beforeEach(async () => {
  await wipeAll(); localStorage.clear()
  const { key } = await createVault('123456')
  setSessionKey(key)
  members = demoMembers()
})

describe('library', () => {
  it('encrypts entries at rest and round-trips', async () => {
    const e = await saveScan(scan(), members, 'li-1')
    expect(e?.list_item_id).toBe('li-1')
    const raw = await new Promise<string>((res) => { const r = indexedDB.open('fivesec'); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('library'); q.onsuccess = () => { res(q.result as string); r.result.close() } } })
    expect(raw).not.toContain('Kokis')
    expect((await listEntries())[0].name).toBe('Kokis')
    expect(await loadLibraryBlob(getSessionKey()!)).toHaveLength(1)
  })
  it('snapshot holds verdicts only, never profile fields', async () => {
    const e = (await saveScan(scan(), members))!
    const all = JSON.stringify(e), snap = JSON.stringify(e.snapshot)
    expect(['Amaya', 'Dad', 'alias', 'life_stage', 'skin_type'].filter((w) => all.includes(w))).toEqual([])
    expect(['allergens', 'diets', 'goals', 'low_sodium'].filter((w) => snap.includes(w))).toEqual([])
    expect(Object.keys(e.snapshot[0]).sort()).toEqual(['m', 'pv', 'r', 'v'])
    expect(e.snapshot).toHaveLength(3)
  })
  it('a repeat save of the same scan within a minute replaces the entry', async () => {
    await saveScan(scan('dup'), members); await saveScan(scan('dup'), members, 'li-2')
    const l = await listEntries()
    expect(l).toHaveLength(1); expect(l[0].list_item_id).toBe('li-2')
  })
  it('search, order, saving pause', async () => {
    await saveScan(scan('a', 'Oat Bites'), members)
    await saveScan(scan('b', 'Rice Crisps'), members)
    expect((await listEntries({ text: 'rice' })).map((x) => x.name)).toEqual(['Rice Crisps'])
    setLibrarySaving(false)
    expect(await saveScan(scan('c'), members)).toBeNull()
    expect(await listEntries()).toHaveLength(2)
  })
  it('stale after profile change; recheck keeps original', async () => {
    const e = (await saveScan(scan(), members))!
    expect(isStale(e, members)).toBe(false)
    const changed = members.map((m) => (m.id === members[1].id ? { ...m, allergens: ['sesame' as const] } : m))
    expect(profileVersion(changed[1])).not.toBe(profileVersion(members[1]))
    expect(isStale(e, changed)).toBe(true)
    const n = await recheck(e, changed)
    expect(n.original).toEqual(e.snapshot)
    expect(isStale(n, changed)).toBe(false)
    expect(n.snapshot.find((x) => x.m === changed[1].id)?.v).toBe('avoid')
    const n2 = await recheck(n, members)
    expect(n2.original).toEqual(e.snapshot)
  })
  it('deleting a member purges their verdicts everywhere', async () => {
    await saveScan(scan('a'), members); await saveScan(scan('b'), members)
    await purgeMember([members[0].id])
    for (const e of await listEntries()) expect(e.snapshot.some((x) => x.m === members[0].id)).toBe(false)
  })
  it('delete one, delete library, delete-all wipes everything', async () => {
    const e = (await saveScan(scan('a'), members))!
    await saveScan(scan('b'), members)
    await deleteEntry(e.id)
    expect(await listEntries()).toHaveLength(1)
    await libDeleteAll()
    expect(await listEntries()).toHaveLength(0)
    await saveScan(scan('c'), members)
    localStorage.setItem('fivesec.list', '[1]'); localStorage.setItem('fivesec.basket', '[1]')
    await deleteAll()
    expect(localStorage.getItem('fivesec.list')).toBeNull()
    expect(localStorage.getItem('fivesec.basket')).toBeNull()
    expect(getSessionKey()).toBeNull()
    const { key } = await createVault('123456'); setSessionKey(key)
    expect(await listEntries()).toHaveLength(0)
  })
})
