import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createVault, unlockWithPin } from './crypto'
import { deleteAll } from './privacy'
import { addHistory, getMeta, loadHistory, loadProfiles, saveMeta, saveProfiles } from './store'
import type { Analysis } from './types'
import { demoMembers } from './verdict'

async function rawKeys(): Promise<IDBValidKey[]> {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('fivesec', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  const keys = await new Promise<IDBValidKey[]>((res) => {
    const q = db.transaction('kv').objectStore('kv').getAllKeys()
    q.onsuccess = () => res(q.result)
  })
  db.close()
  return keys
}

class MemStorage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
}

describe('delete all', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', new MemStorage()); vi.stubGlobal('sessionStorage', new MemStorage()) })

  it('empties every store, clears app storage and makes the old PIN useless', async () => {
    const { key, meta } = await createVault('123456')
    await saveMeta(meta)
    await saveProfiles(key, demoMembers())
    await addHistory(key, { scan_id: 's1', ts: 1, name: 'Kokis', analysis: {} as Analysis })
    // an unknown extra key must go too
    await new Promise<void>((res) => {
      const r = indexedDB.open('fivesec', 1)
      r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put('x', 'other'); t.oncomplete = () => { r.result.close(); res() } }
    })
    localStorage.setItem('fivesec.lang', 'si'); localStorage.setItem('unrelated', 'keep')
    sessionStorage.setItem('fivesec.tmp', '1')
    expect((await rawKeys()).sort()).toEqual(['history', 'meta', 'other', 'profiles'])

    const caches = { keys: vi.fn(async () => ['fivesec-shell-v1', 'other-app']), delete: vi.fn(async () => true) }
    vi.stubGlobal('caches', caches)
    await deleteAll()

    expect(await rawKeys()).toEqual([])
    expect(await getMeta()).toBeUndefined()
    expect(await loadProfiles(key)).toEqual([])
    expect(await loadHistory(key)).toEqual([])
    expect(localStorage.getItem('fivesec.lang')).toBeNull()
    expect(sessionStorage.getItem('fivesec.tmp')).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('keep')
    expect(caches.delete).toHaveBeenCalledTimes(1)
    expect(caches.delete).toHaveBeenCalledWith('fivesec-shell-v1')
    // the stored wrapped keys are gone, so the old PIN has nothing to unlock
    expect(await getMeta()).toBeUndefined()
    await expect(unlockWithPin((await getMeta()) as never, '123456')).rejects.toThrow()
  })
})
