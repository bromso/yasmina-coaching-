// The api's one seam over `@simplewebauthn/server`: options for the two ceremonies and their
// verification. Every verify answers null for anything that is the client's fault — a wrong
// origin or RP ID, a challenge that is not the one we minted, a missing user-verification flag, a
// malformed response — rather than throwing, so the procedures map all of it to one generic
// refusal and never a 500. No raw challenge is ever stored: the caller passes the hash of the one
// it minted, and the library's challenge check compares hashes.
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers"
import { tokenHash } from "./credentials"
import type { PasskeyRow } from "./queries/passkeys"

/** The relying party: the parent domain passkeys are scoped to, and the origins that may use them. */
export type RelyingParty = {
  /** PASSKEY_RP_ID: the registrable domain shared by the auth and account apps. */
  id: string
  /** PASSKEY_RP_NAME: what the browser's prompt shows. */
  name: string
  /** The auth and account apps' origins (from AUTH_URL and ACCOUNT_URL) — and nothing else. */
  origins: string[]
}

export function relyingParty(input: {
  id: string
  name: string
  authUrl: string
  accountUrl: string
}): RelyingParty {
  const origins = [...new Set([input.authUrl, input.accountUrl].map((url) => new URL(url).origin))]
  return { id: input.id, name: input.name, origins }
}

/** Every transport the WebAuthn spec (and the library's type) names; anything else is dropped. */
const TRANSPORTS: ReadonlySet<string> = new Set<AuthenticatorTransportFuture>([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
])

/** Keeps only known transport strings, deduplicated; undefined when none survive. */
export function cleanTransports(value: unknown): AuthenticatorTransportFuture[] | undefined {
  if (!Array.isArray(value)) return undefined
  const kept = [
    ...new Set(value.filter((t): t is string => typeof t === "string" && TRANSPORTS.has(t))),
  ] as AuthenticatorTransportFuture[]
  return kept.length > 0 ? kept : undefined
}

/** `passkeys.transports` is stored as JSON text; a malformed value reads as "none reported". */
export function parseTransports(raw: string | null): AuthenticatorTransportFuture[] | undefined {
  if (raw === null) return undefined
  try {
    return cleanTransports(JSON.parse(raw))
  } catch {
    return undefined
  }
}

/** The WebAuthn user handle for a user: their id's decimal string, as UTF-8, base64url. */
export const userHandleFor = (userId: number): string =>
  isoBase64URL.fromBuffer(isoUint8Array.fromUTF8String(String(userId)))

/** Creation options for `user`, excluding the credentials they already hold. */
export function registrationOptions(
  rp: RelyingParty,
  user: { id: number; email: string; name: string | null },
  existing: readonly Pick<PasskeyRow, "credential_id" | "transports">[]
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: user.email,
    userDisplayName: user.name || user.email,
    userID: isoUint8Array.fromUTF8String(String(user.id)),
    attestationType: "none",
    excludeCredentials: existing.map((row) => ({
      id: row.credential_id,
      transports: parseTransports(row.transports),
    })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  })
}

/** Request options for a discoverable sign-in: no `allowCredentials`, the credential names the user. */
export function authenticationOptions(
  rp: RelyingParty
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({ rpID: rp.id, userVerification: "required" })
}

/** The library's challenge check against a stored hash: the raw challenge is never kept. */
const matchesHash = (challengeHash: string) => (challenge: string) =>
  tokenHash(challenge) === challengeHash

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export type VerifiedRegistration = {
  credentialId: string
  /** Base64url COSE public key. */
  publicKey: string
  counter: number
  transports: AuthenticatorTransportFuture[] | undefined
}

/** A verified new credential, or null for any response that does not verify. */
export async function verifyRegistration(
  rp: RelyingParty,
  response: unknown,
  challengeHash: string
): Promise<VerifiedRegistration | null> {
  if (!isRecord(response) || !isRecord(response.response)) return null
  try {
    const result = await verifyRegistrationResponse({
      response: response as unknown as RegistrationResponseJSON,
      expectedChallenge: matchesHash(challengeHash),
      expectedOrigin: rp.origins,
      expectedRPID: rp.id,
      requireUserVerification: true,
    })
    if (!result.verified) return null
    const { credential } = result.registrationInfo
    return {
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: cleanTransports(response.response.transports),
    }
  } catch {
    return null
  }
}

/** The fields sign-in reads before verifying: which credential, and which user it claims. */
export function assertionIds(
  response: unknown
): { credentialId: string; userHandle: string | null } | null {
  if (!isRecord(response) || !isRecord(response.response)) return null
  const { id } = response
  const { userHandle } = response.response
  if (typeof id !== "string" || id.length === 0 || id.length > 1024) return null
  if (userHandle !== undefined && userHandle !== null && typeof userHandle !== "string") return null
  return { credentialId: id, userHandle: userHandle ?? null }
}

/**
 * The authenticator's new counter when `response` is a genuine assertion by `row`'s credential,
 * else null. The stored counter is passed to the library as 0, which turns its own counter check
 * off: that check runs before the signature is verified, so a forged response could trip it.
 * `counterAdvances` applies the rule once the signature is known to be genuine.
 */
export async function verifyAuthentication(
  rp: RelyingParty,
  response: unknown,
  challengeHash: string,
  row: PasskeyRow
): Promise<{ newCounter: number } | null> {
  if (!isRecord(response) || !isRecord(response.response)) return null
  try {
    const result = await verifyAuthenticationResponse({
      response: response as unknown as AuthenticationResponseJSON,
      expectedChallenge: matchesHash(challengeHash),
      expectedOrigin: rp.origins,
      expectedRPID: rp.id,
      credential: {
        id: row.credential_id,
        publicKey: isoBase64URL.toBuffer(row.public_key),
        counter: 0,
        transports: parseTransports(row.transports),
      },
      requireUserVerification: true,
    })
    return result.verified ? { newCounter: result.authenticationInfo.newCounter } : null
  } catch {
    return null
  }
}

/**
 * The signature-counter rule for a genuine assertion: an authenticator that keeps a counter (the
 * stored or the new one non-zero) must report a greater one than last time — anything else means
 * a cloned authenticator. Both zero is a passkey that keeps none, accepted.
 */
export const counterAdvances = (stored: number, next: number): boolean =>
  (stored === 0 && next === 0) || next > stored
