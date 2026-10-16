// On-phone storage in IndexedDB. Everything except the wrapped keys is AES-GCM encrypted.
import { decryptJson, encryptJson, type VaultMeta } from './crypto'
import type { Analysis } from './types'
import type { Member } from './verdict'

const DB = 'fivesec'
const STORE = 'kv'
export const MAX_HISTORY = 50

export interface HistoryEntry {
  scan_id: string
  ts: number
  name: string | null
  analysis: Analysis
}

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((res, rej) => {
      const t = db.transaction(STORE, mode)
      const req = f(t.objectStore(STORE))
      t.oncomplete = () => res(req.result)
      t.onerror = () => rej(t.error)
      t.onabort = () => rej(t.error)
    })
  } finally {
    db.close()
  }
}
const get = <T>(k: string) => tx<T | undefined>('readonly', (s) => s.get(k))
const set = (k: string, v: unknown) => tx('readwrite', (s) => s.put(v, k))

export const getMeta = () => get<VaultMeta>('meta')
export const saveMeta = (m: VaultMeta) => set('meta', m)

export async function loadProfiles(key: CryptoKey): Promise<Member[]> {
  const blob = await get<string>('profiles')
  return blob ? decryptJson<Member[]>(key, blob) : []
}
export async function saveProfiles(key: CryptoKey, members: Member[]): Promise<void> {
  await set('profiles', await encryptJson(key, members))
}
export async function loadHistory(key: CryptoKey): Promise<HistoryEntry[]> {
  const blob = await get<string>('history')
  return blob ? decryptJson<HistoryEntry[]>(key, blob) : []
}
export async function addHistory(key: CryptoKey, entry: HistoryEntry): Promise<void> {
  const cur = await loadHistory(key)
  const next = [entry, ...cur.filter((e) => e.scan_id !== entry.scan_id)].slice(0, MAX_HISTORY)
  await set('history', await encryptJson(key, next))
}

/** Wipes IndexedDB (profiles, history, wrapped keys). The in-memory key must be dropped by the caller. */
export async function wipeAll(): Promise<void> {
  await tx('readwrite', (s) => s.clear())
  try { localStorage.removeItem('fivesec.lang') } catch { /* ignore */ }
}

/** Clears every record, then deletes the whole database. Used by delete-all. */
export async function destroyDb(): Promise<void> {
  try { await tx('readwrite', (s) => s.clear()) } catch { /* nothing to clear */ }
  await new Promise<void>((res) => {
    const r = indexedDB.deleteDatabase(DB)
    r.onsuccess = () => res()
    r.onerror = () => res()
    r.onblocked = () => res()
  })
}

/** Encrypted backup: the wrapped keys and the ciphertext records. Restorable with PIN or recovery code. */
export async function exportBackup(): Promise<string> {
  return JSON.stringify({
    app: 'five-seconds', v: 1,
    meta: await getMeta(),
    profiles: (await get<string>('profiles')) ?? null,
    history: (await get<string>('history')) ?? null,
  })
}
export async function importBackup(json: string): Promise<VaultMeta> {
  const o = JSON.parse(json) as { app?: string; v?: number; meta?: VaultMeta; profiles?: string | null; history?: string | null }
  if (o.app !== 'five-seconds' || !o.meta?.recovery?.wrapped) throw new Error('Not a Five Seconds backup')
  await wipeAll()
  await saveMeta(o.meta)
  if (o.profiles) await set('profiles', o.profiles)
  if (o.history) await set('history', o.history)
  return o.meta
}

export async function requestPersist(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false } catch { return false }
}
