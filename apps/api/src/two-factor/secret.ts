/**
 * AES-256-GCM encryption for the TOTP secret at rest, via Web Crypto. A random 12-byte IV per
 * call means two encryptions of the same secret never produce the same stored value. The `v1:`
 * prefix leaves room for key rotation later.
 */

const ALGORITHM = "AES-GCM"
const IV_BYTES = 12
const KEY_BYTES = 32
const VERSION = "v1"

/**
 * Standard base64 encoding of exactly 32 bytes: 43 base64-alphabet characters plus one trailing
 * `=` pad. `Buffer.from(…, "base64")` silently drops characters outside the base64 alphabet
 * instead of rejecting them, so a length check alone can pass a string with trailing junk —
 * this is checked before any decoding happens.
 */
export const ENCRYPTION_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/

// A fresh, plain ArrayBuffer-backed copy: crypto.subtle's types reject Buffer / Uint8Array
// instances whose backing could be a SharedArrayBuffer, which Node's typings allow in general.
function toArrayBufferView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes)
}

/**
 * One imported key per key string, for both usages: importing on every encrypt/decrypt is wasted
 * work on the sign-in path. A rejected import is not cached, so a bad key keeps throwing.
 */
const keyCache = new Map<string, Promise<CryptoKey>>()

function importKey(keyB64: string): Promise<CryptoKey> {
  const cached = keyCache.get(keyB64)
  if (cached) return cached
  if (!ENCRYPTION_KEY_PATTERN.test(keyB64)) {
    return Promise.reject(new Error(`Encryption key must decode to ${KEY_BYTES} bytes`))
  }
  const raw = toArrayBufferView(Buffer.from(keyB64, "base64"))
  const key = crypto.subtle.importKey("raw", raw, ALGORITHM, false, ["encrypt", "decrypt"])
  keyCache.set(keyB64, key)
  key.catch(() => keyCache.delete(keyB64))
  return key
}

/** Encrypts a TOTP secret for storage as `"v1:<iv b64>:<ciphertext b64>"`. */
export async function encryptSecret(secret: Uint8Array, keyB64: string): Promise<string> {
  const key = await importKey(keyB64)
  const iv = new Uint8Array(IV_BYTES)
  crypto.getRandomValues(iv)
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    toArrayBufferView(secret)
  )
  const ivB64 = Buffer.from(iv).toString("base64")
  const ctB64 = Buffer.from(ciphertext).toString("base64")
  return `${VERSION}:${ivB64}:${ctB64}`
}

/** Reverses `encryptSecret`. Throws when the key is wrong or `stored` is malformed. */
export async function decryptSecret(stored: string, keyB64: string): Promise<Uint8Array> {
  const parts = stored.split(":")
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted secret")
  }
  const [version, ivB64, ctB64] = parts
  if (version !== VERSION || !ivB64 || !ctB64) {
    throw new Error("Malformed encrypted secret")
  }
  const iv = toArrayBufferView(Buffer.from(ivB64, "base64"))
  if (iv.length !== IV_BYTES) {
    throw new Error("Malformed encrypted secret")
  }
  const key = await importKey(keyB64)
  const ciphertext = toArrayBufferView(Buffer.from(ctB64, "base64"))
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext)
  return new Uint8Array(plaintext)
}
