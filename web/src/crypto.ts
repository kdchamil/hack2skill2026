// Client-side encryption. A random AES-256-GCM data key encrypts everything stored on the phone.
// The data key is stored only wrapped (AES-KW) by: a passkey PRF secret, a PIN (PBKDF2), and a recovery code.
// After unlock the key is re-imported NON-extractable and held in memory only.

export const PBKDF2_ITERATIONS = 600_000
export const MIN_PIN_LENGTH = 6

export interface VaultMeta {
  v: 1
  pin?: { salt: string; iters: number; wrapped: string }
  recovery: { wrapped: string }
  passkey?: { credId: string; salt: string; wrapped: string }
}

const subtle = (): SubtleCrypto => globalThis.crypto.subtle
const rand = (n: number): Uint8Array<ArrayBuffer> => globalThis.crypto.getRandomValues(new Uint8Array(n))

export function b64e(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of u) s += String.fromCharCode(b)
  return btoa(s)
}
export function b64d(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}

const enc = new TextEncoder()
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function pinIsValid(pin: string): boolean {
  return /^\d+$/.test(pin) && pin.length >= MIN_PIN_LENGTH
}

export function base32(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}
export function unbase32(s: string): Uint8Array<ArrayBuffer> {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch)
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return new Uint8Array(out)
}

export function newRecoveryCode(): string {
  return (base32(rand(16)).match(/.{1,4}/g) ?? []).join('-')
}

async function pinKek(pin: string, salt: Uint8Array<ArrayBuffer>, iters: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters },
    base, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey'],
  )
}

async function hkdfKek(secret: Uint8Array<ArrayBuffer>, info: string): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', secret, 'HKDF', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode(info) },
    base, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey'],
  )
}
const recoveryKek = (code: string) => hkdfKek(unbase32(code).slice(0, 16), 'fivesec-recovery-v1')

const wrap = async (data: CryptoKey, kek: CryptoKey) => b64e(await subtle().wrapKey('raw', data, kek, 'AES-KW'))
const unwrap = (wrapped: string, kek: CryptoKey, extractable: boolean) =>
  subtle().unwrapKey('raw', b64d(wrapped), kek, 'AES-KW', { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt'])

export async function createVault(pin: string): Promise<{ meta: VaultMeta; key: CryptoKey; recoveryCode: string }> {
  if (!pinIsValid(pin)) throw new Error('PIN must be at least 6 digits')
  const dataKey = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const salt = rand(16)
  const recoveryCode = newRecoveryCode()
  const meta: VaultMeta = {
    v: 1,
    pin: { salt: b64e(salt), iters: PBKDF2_ITERATIONS, wrapped: await wrap(dataKey, await pinKek(pin, salt, PBKDF2_ITERATIONS)) },
    recovery: { wrapped: await wrap(dataKey, await recoveryKek(recoveryCode)) },
  }
  // drop the extractable copy; use a non-extractable one from here on
  const key = await unwrap(meta.pin!.wrapped, await pinKek(pin, salt, PBKDF2_ITERATIONS), false)
  return { meta, key, recoveryCode }
}

export async function unlockWithPin(meta: VaultMeta, pin: string): Promise<CryptoKey> {
  if (!meta.pin) throw new Error('No PIN set')
  const kek = await pinKek(pin, b64d(meta.pin.salt), meta.pin.iters)
  return unwrap(meta.pin.wrapped, kek, false) // rejects on wrong PIN
}

export async function unlockWithRecovery(meta: VaultMeta, code: string): Promise<CryptoKey> {
  return unwrap(meta.recovery.wrapped, await recoveryKek(code), false)
}

/** Recovery code restores access and sets a new PIN. */
export async function resetPinWithRecovery(meta: VaultMeta, code: string, newPin: string): Promise<{ meta: VaultMeta; key: CryptoKey }> {
  if (!pinIsValid(newPin)) throw new Error('PIN must be at least 6 digits')
  const extractable = await unwrap(meta.recovery.wrapped, await recoveryKek(code), true)
  const salt = rand(16)
  const kek = await pinKek(newPin, salt, PBKDF2_ITERATIONS)
  const next: VaultMeta = { ...meta, pin: { salt: b64e(salt), iters: PBKDF2_ITERATIONS, wrapped: await wrap(extractable, kek) } }
  return { meta: next, key: await unwrap(next.pin!.wrapped, kek, false) }
}

// ---- encrypted records -------------------------------------------------------------------------

export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  const iv = rand(12)
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)))
  return `${b64e(iv)}.${b64e(ct)}`
}
export async function decryptJson<T>(key: CryptoKey, blob: string): Promise<T> {
  const [iv, ct] = blob.split('.')
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: b64d(iv) }, key, b64d(ct))
  return JSON.parse(new TextDecoder().decode(pt)) as T
}

// ---- passkey PRF (P1, feature-detected) -----------------------------------------------------------

export function passkeySupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && !!navigator.credentials?.create
}

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } }

async function prfSecret(credId: Uint8Array<ArrayBuffer> | null, salt: Uint8Array<ArrayBuffer>): Promise<{ secret: Uint8Array<ArrayBuffer>; credId: Uint8Array<ArrayBuffer> }> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: rand(32),
      userVerification: 'required',
      allowCredentials: credId ? [{ type: 'public-key', id: credId }] : [],
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  const res = cred?.getClientExtensionResults() as PrfResults | undefined
  const first = res?.prf?.results?.first
  if (!cred || !first) throw new Error('Passkey PRF not available')
  return { secret: new Uint8Array(first), credId: new Uint8Array(cred.rawId) }
}

/** Adds passkey unlock. Needs the PIN once so the data key can be re-wrapped. */
export async function enablePasskey(meta: VaultMeta, pin: string): Promise<VaultMeta> {
  if (!meta.pin) throw new Error('No PIN set')
  const extractable = await unwrap(meta.pin.wrapped, await pinKek(pin, b64d(meta.pin.salt), meta.pin.iters), true)
  const created = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'FiveSeconds' },
      user: { id: rand(16), name: 'household', displayName: 'FiveSeconds household' },
      challenge: rand(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
      extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!created || !(created.getClientExtensionResults() as PrfResults).prf?.enabled) throw new Error('Passkey PRF not supported')
  const salt = rand(32)
  const { secret } = await prfSecret(new Uint8Array(created.rawId), salt)
  const wrapped = await wrap(extractable, await hkdfKek(secret, 'fivesec-passkey-v1'))
  return { ...meta, passkey: { credId: b64e(created.rawId), salt: b64e(salt), wrapped } }
}

export async function unlockWithPasskey(meta: VaultMeta): Promise<CryptoKey> {
  if (!meta.passkey) throw new Error('No passkey')
  const { secret } = await prfSecret(b64d(meta.passkey.credId), b64d(meta.passkey.salt))
  return unwrap(meta.passkey.wrapped, await hkdfKek(secret, 'fivesec-passkey-v1'), false)
}
