// A webhook endpoint's signing secret at rest: AES-256-GCM (`v1:<iv>:<ciphertext>`) under
// TWO_FACTOR_ENCRYPTION_KEY, exactly like TOTP secrets — it must be readable to sign, so it cannot
// be hashed. Only `create` and `rotateSecret` ever return the plain `whsec_…`; the delivery job
// decrypts it for each attempt and drops it.
import { decryptSecret, encryptSecret } from "../two-factor/secret"

/** Encrypts a `whsec_…` secret for `webhook_endpoints.secret`. */
export const encryptWebhookSecret = async (secret: string, keyB64: string): Promise<string> =>
  encryptSecret(new TextEncoder().encode(secret), keyB64)

/** Reverses `encryptWebhookSecret`. Throws when the key is wrong or `stored` is malformed. */
export const decryptWebhookSecret = async (stored: string, keyB64: string): Promise<string> =>
  new TextDecoder().decode(await decryptSecret(stored, keyB64))
