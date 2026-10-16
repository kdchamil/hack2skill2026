import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createVault, enablePasskey, passkeySupported, resetPinWithRecovery, unlockWithPasskey, unlockWithPin, unlockWithRecovery, type VaultMeta,
} from './crypto'
import * as store from './store'
import type { Analysis } from './types'
import type { Member } from './verdict'

export type VaultStatus = 'loading' | 'none' | 'locked' | 'unlocked'
export const IDLE_MS = 5 * 60 * 1000

export function useVault() {
  const [status, setStatus] = useState<VaultStatus>('loading')
  const [meta, setMeta] = useState<VaultMeta | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const keyRef = useRef<CryptoKey | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    void store.getMeta().then((m) => {
      setMeta(m ?? null)
      setStatus(m ? 'locked' : 'none')
    }).catch(() => setStatus('none'))
  }, [])

  const lock = useCallback(() => {
    keyRef.current = null
    setMembers([])
    setStatus((s) => (s === 'unlocked' ? 'locked' : s))
  }, [])

  // auto-lock after 5 min idle
  useEffect(() => {
    if (status !== 'unlocked') return
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(lock, IDLE_MS) }
    const evs = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    bump()
    return () => { evs.forEach((e) => window.removeEventListener(e, bump)); window.clearTimeout(timer.current) }
  }, [status, lock])

  const open = useCallback(async (key: CryptoKey) => {
    keyRef.current = key
    setMembers(await store.loadProfiles(key))
    setStatus('unlocked')
  }, [])

  return {
    status, meta, members, recoveryCode, passkeySupported: passkeySupported(),
    hasPasskey: !!meta?.passkey,
    async create(pin: string, withPasskey: boolean): Promise<{ passkeyOk: boolean }> {
      const r = await createVault(pin)
      let m = r.meta
      let passkeyOk = false
      if (withPasskey) {
        try { m = await enablePasskey(m, pin); passkeyOk = true } catch { /* PIN only */ }
      }
      await store.saveMeta(m)
      await store.requestPersist()
      setMeta(m)
      setRecoveryCode(r.recoveryCode)
      await open(r.key)
      return { passkeyOk }
    },
    ackRecovery: () => setRecoveryCode(null),
    async unlockPin(pin: string): Promise<boolean> {
      if (!meta) return false
      try { await open(await unlockWithPin(meta, pin)); return true } catch { return false }
    },
    async unlockPasskey(): Promise<boolean> {
      if (!meta) return false
      try { await open(await unlockWithPasskey(meta)); return true } catch { return false }
    },
    async recover(code: string, newPin: string): Promise<boolean> {
      if (!meta) return false
      try {
        await unlockWithRecovery(meta, code)
        const r = await resetPinWithRecovery(meta, code, newPin)
        await store.saveMeta(r.meta)
        setMeta(r.meta)
        await open(r.key)
        return true
      } catch { return false }
    },
    lock,
    async saveMembers(next: Member[]) {
      if (!keyRef.current) return
      await store.saveProfiles(keyRef.current, next)
      setMembers(next)
    },
    async remember(entry: { scan_id: string; name: string | null; analysis: Analysis }) {
      if (keyRef.current) await store.addHistory(keyRef.current, { ...entry, ts: Date.now() })
    },
    async wipe() {
      keyRef.current = null
      setMembers([]); setMeta(null); setRecoveryCode(null)
      await store.wipeAll()
      setStatus('none')
    },
    async importBackup(text: string): Promise<boolean> {
      try {
        const m = await store.importBackup(text)
        keyRef.current = null
        setMembers([]); setMeta(m); setStatus('locked')
        return true
      } catch { return false }
    },
    exportBackup: store.exportBackup,
  }
}
export type Vault = ReturnType<typeof useVault>
