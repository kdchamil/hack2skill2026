import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createVault, decryptJson, encryptJson, resetPinWithRecovery, unbase32, base32, unlockWithPin, unlockWithRecovery, pinIsValid } from './crypto'
import { exportBackup, getMeta, importBackup, loadProfiles, saveMeta, saveProfiles, wipeAll, addHistory, loadHistory, MAX_HISTORY } from './store'
import type { Analysis } from './types'
import { demoMembers } from './verdict'

beforeEach(async () => { await wipeAll() })

describe('crypto', () => {
  it('round-trips and uses fresh IVs', async () => {
    const { key } = await createVault('123456')
    const a = await encryptJson(key, { x: 1 })
    expect(a).not.toEqual(await encryptJson(key, { x: 1 }))
    expect(await decryptJson(key, a)).toEqual({ x: 1 })
  })
  it('rejects short or non-numeric PINs', async () => {
    expect(pinIsValid('12345')).toBe(false)
    expect(pinIsValid('12345a')).toBe(false)
    await expect(createVault('123')).rejects.toThrow()
  })
  it('wrong PIN fails, right PIN works', async () => {
    const { key, meta } = await createVault('123456')
    const blob = await encryptJson(key, 'secret')
    await expect(unlockWithPin(meta, '654321')).rejects.toThrow()
    const k2 = await unlockWithPin(meta, '123456')
    expect(await decryptJson(k2, blob)).toBe('secret')
  })
  it('recovery code restores and can reset the PIN', async () => {
    const { key, meta, recoveryCode } = await createVault('123456')
    expect(recoveryCode).toMatch(/^([A-Z2-7]{4}-){6}[A-Z2-7]{2}$/)
    const blob = await encryptJson(key, 'secret')
    const k2 = await unlockWithRecovery(meta, recoveryCode.toLowerCase().replace(/-/g, ' '))
    expect(await decryptJson(k2, blob)).toBe('secret')
    await expect(unlockWithRecovery(meta, 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA')).rejects.toThrow()
    const r = await resetPinWithRecovery(meta, recoveryCode, '987654')
    expect(await decryptJson(await unlockWithPin(r.meta, '987654'), blob)).toBe('secret')
    await expect(unlockWithPin(r.meta, '123456')).rejects.toThrow()
  })
  it('key is non-extractable after create and unlock', async () => {
    const { key, meta } = await createVault('123456')
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
    await expect(crypto.subtle.exportKey('raw', await unlockWithPin(meta, '123456'))).rejects.toThrow()
    expect(key.extractable).toBe(false)
  })
  it('base32 round trips', () => {
    const b = new Uint8Array(16).map((_, i) => i * 13)
    expect([...unbase32(base32(b)).slice(0, 16)]).toEqual([...b])
  })
})

describe('store', () => {
  it('stores profiles encrypted and backup restores them', async () => {
    const { key, meta, recoveryCode } = await createVault('123456')
    await saveMeta(meta)
    await saveProfiles(key, demoMembers())
    const raw = await exportBackup()
    expect(raw).not.toContain('Amaya')
    expect(raw).not.toContain('sesame')
    await wipeAll()
    expect(await getMeta()).toBeUndefined()
    const m2 = await importBackup(raw)
    expect(await loadProfiles(await unlockWithRecovery(m2, recoveryCode))).toEqual(demoMembers())
    expect(await loadProfiles(await unlockWithPin(m2, '123456'))).toHaveLength(3)
  })
  it('keeps only the last 50 analyses; wipe removes everything', async () => {
    const { key, meta } = await createVault('123456')
    await saveMeta(meta)
    for (let i = 0; i < MAX_HISTORY + 5; i++) {
      await addHistory(key, { scan_id: `s${i}`, ts: i, name: null, analysis: {} as Analysis })
    }
    const h = await loadHistory(key)
    expect(h).toHaveLength(MAX_HISTORY)
    expect(h[0].scan_id).toBe(`s${MAX_HISTORY + 4}`)
    await wipeAll()
    expect(await getMeta()).toBeUndefined()
    expect(await loadHistory(key)).toEqual([])
  })
  it('rejects a foreign backup', async () => {
    await expect(importBackup('{"x":1}')).rejects.toThrow()
  })
})
