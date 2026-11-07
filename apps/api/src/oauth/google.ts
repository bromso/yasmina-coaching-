import * as arctic from "arctic"
import type { Provider } from "./provider"
import { idTokenClaims, mapArcticError } from "./provider"

export function googleProvider(clientId: string, clientSecret: string, redirect: string): Provider {
  const google = new arctic.Google(clientId, clientSecret, redirect)
  return {
    id: "google",
    pkce: true,
    start: (state, codeVerifier) =>
      google.createAuthorizationURL(state, codeVerifier ?? "", ["openid", "email", "profile"]),
    async exchange({ code, codeVerifier }) {
      let tokens: arctic.OAuth2Tokens
      try {
        tokens = await google.validateAuthorizationCode(code, codeVerifier ?? "")
      } catch (error) {
        throw mapArcticError("google", error)
      }
      const claims = idTokenClaims<{
        sub: string
        email?: string
        email_verified?: boolean
        name?: string
      }>("google", tokens)
      return {
        providerUserId: claims.sub,
        email: claims.email ?? null,
        emailVerified: claims.email_verified === true,
        name: claims.name ?? null,
      }
    },
  }
}
