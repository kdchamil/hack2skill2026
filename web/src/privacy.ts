// Delete-all (US-36, FR-33): wipes everything this app keeps on the phone, at once.
import * as store from './store'

export const APP_PREFIX = 'fivesec'

/** Hook point: sharing ships at the finale. It will revoke every outgoing share and ask the server to delete
 *  consent records (FR-33: within 24 h) before local data is erased. A no-op for the submission build. */
export async function withdrawShares(): Promise<void> {
  // intentionally empty
}

function clearWebStorage(s: Storage | undefined) {
  try {
    if (!s) return
    const keys: string[] = []
    for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(APP_PREFIX)) keys.push(k) }
    keys.forEach((k) => s.removeItem(k))
  } catch { /* storage blocked */ }
}

/** Erases IndexedDB (profiles, scan history, wrapped keys, recovery copy, any other key), local/session storage
 *  app keys and Cache Storage entries the app created. The caller drops the in-memory key and scan state. */
export async function deleteAll(): Promise<void> {
  try { await withdrawShares() } catch { /* never block the wipe */ }
  await store.destroyDb()
  clearWebStorage(typeof localStorage === 'undefined' ? undefined : localStorage)
  clearWebStorage(typeof sessionStorage === 'undefined' ? undefined : sessionStorage)
  try {
    if (typeof caches !== 'undefined') {
      for (const k of await caches.keys()) if (k.startsWith(APP_PREFIX)) await caches.delete(k)
    }
  } catch { /* ignore */ }
}
