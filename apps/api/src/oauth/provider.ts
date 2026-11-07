import * as arctic from "arctic"
import type { ProviderId } from "../queries/identities"

/** What a provider tells us about the person who just consented. */
export type Profile = {
  providerUserId: string
  email: string | null
  emailVerified: boolean
  name: string | null
}

/** Apple posts the user's name in the callback body, once, on first consent only. */
export type AppleUser = { name?: { firstName?: string; lastName?: string } }

export type Provider = {
  id: ProviderId
  /** Whether `start` and `exchange` need a code verifier. */
  pkce: boolean
  start(state: string, codeVerifier?: string): URL
  exchange(input: { code: string; codeVerifier?: string; appleUser?: AppleUser }): Promise<Profile>
}

/**
 * The provider rejected the code (`invalid_code`), or could not be reached or answered oddly.
 * `providerCode` is the OAuth error name the provider sent (`invalid_grant`,
 * `redirect_uri_mismatch`, ...), for operators; it is never a secret.
 */
export class ProviderExchangeError extends Error {
  constructor(
    public kind: "invalid_code" | "unreachable",
    provider: ProviderId,
    public providerCode?: string
  ) {
    super(`${provider} exchange failed: ${kind}${providerCode ? ` (${providerCode})` : ""}`)
    this.name = "ProviderExchangeError"
  }
}

const PEM_LABEL = /-----(BEGIN|END) PRIVATE KEY-----/g
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

/** PEM (PKCS#8) → DER bytes, as Arctic's Apple client wants it. Accepts `\n`-escaped single-line PEM. */
export function pemToPkcs8(pem: string): Uint8Array {
  const text = pem.replace(/\\n/g, "\n")
  // A SEC1 "EC PRIVATE KEY" or any other label is not PKCS#8, even though its body is base64.
  if (!/-----BEGIN PRIVATE KEY-----/.test(text)) throw new Error("not a PKCS#8 PEM")
  const body = text.replace(PEM_LABEL, "").replace(/\s+/g, "")
  if (!body || !BASE64.test(body)) throw new Error("not a PKCS#8 PEM")
  return new Uint8Array(Buffer.from(body, "base64"))
}

/** Arctic's OAuth2RequestError is the provider refusing the code; anything else is transport. */
export const mapArcticError = (provider: ProviderId, error: unknown): ProviderExchangeError =>
  error instanceof arctic.OAuth2RequestError
    ? new ProviderExchangeError("invalid_code", provider, error.code)
    : new ProviderExchangeError("unreachable", provider)

/**
 * The id token's claims, with a non-empty `sub`. A token response without an id token, an
 * undecodable one, or one without a subject is an odd answer: `unreachable`, never a plain Error,
 * and never an identity keyed on `undefined`.
 */
export function idTokenClaims<T extends { sub: string }>(
  provider: ProviderId,
  tokens: arctic.OAuth2Tokens
): T {
  let claims: Partial<T>
  try {
    claims = arctic.decodeIdToken(tokens.idToken()) as Partial<T>
  } catch {
    throw new ProviderExchangeError("unreachable", provider)
  }
  if (typeof claims?.sub !== "string" || claims.sub.length === 0) {
    throw new ProviderExchangeError("unreachable", provider)
  }
  return claims as T
}
