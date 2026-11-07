import * as arctic from "arctic"
import type { Provider } from "./provider"
import { idTokenClaims, mapArcticError, pemToPkcs8 } from "./provider"

export function appleProvider(
  clientId: string,
  teamId: string,
  keyId: string,
  privateKey: string,
  redirect: string
): Provider {
  const apple = new arctic.Apple(clientId, teamId, keyId, pemToPkcs8(privateKey), redirect)
  return {
    id: "apple",
    pkce: false,
    start(state) {
      const url = apple.createAuthorizationURL(state, ["name", "email"])
      // Apple requires form_post whenever name or email is requested.
      url.searchParams.set("response_mode", "form_post")
      return url
    },
    async exchange({ code, appleUser }) {
      let tokens: arctic.OAuth2Tokens
      try {
        tokens = await apple.validateAuthorizationCode(code)
      } catch (error) {
        throw mapArcticError("apple", error)
      }
      const claims = idTokenClaims<{
        sub: string
        email?: string
        email_verified?: boolean | string
      }>("apple", tokens)
      return {
        providerUserId: claims.sub,
        email: claims.email ?? null,
        // Apple has sent this claim both as a boolean and as the string "true".
        emailVerified: claims.email_verified === true || claims.email_verified === "true",
        name:
          [appleUser?.name?.firstName, appleUser?.name?.lastName].filter(Boolean).join(" ") || null,
      }
    },
  }
}
