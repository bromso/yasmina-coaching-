import * as arctic from "arctic"
import type { Provider } from "./provider"
import { mapArcticError, ProviderExchangeError } from "./provider"

type GitHubUser = { id: number; name: string | null; login: string | null }
type GitHubEmail = { email: string; primary: boolean; verified: boolean }

export function githubProvider(
  clientId: string,
  clientSecret: string,
  redirect: string,
  fetchImpl: typeof fetch
): Provider {
  const github = new arctic.GitHub(clientId, clientSecret, redirect)

  async function api<T>(path: string, accessToken: string): Promise<T> {
    let response: Response
    try {
      response = await fetchImpl(`https://api.github.com${path}`, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/vnd.github+json",
          "user-agent": "boilerplate-bun",
        },
        // A hanging GitHub would otherwise hold the api request until Bun's idle timeout.
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new ProviderExchangeError("unreachable", "github")
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new ProviderExchangeError("unreachable", "github")
    }
    try {
      return (await response.json()) as T
    } catch {
      throw new ProviderExchangeError("unreachable", "github")
    }
  }

  return {
    id: "github",
    pkce: false,
    start: (state) => github.createAuthorizationURL(state, ["read:user", "user:email"]),
    async exchange({ code }) {
      let tokens: arctic.OAuth2Tokens
      try {
        tokens = await github.validateAuthorizationCode(code)
      } catch (error) {
        throw mapArcticError("github", error)
      }
      let accessToken: string
      try {
        accessToken = tokens.accessToken()
      } catch {
        throw new ProviderExchangeError("unreachable", "github")
      }
      const user = await api<Partial<GitHubUser> | null>("/user", accessToken)
      // The id is the identity key: anything but a number would store "undefined" for everyone.
      if (typeof user?.id !== "number") throw new ProviderExchangeError("unreachable", "github")
      const emails = await api<(GitHubEmail | null)[]>("/user/emails", accessToken)
      // Only the primary address, and only once GitHub has verified it, may match an account.
      const primary = Array.isArray(emails)
        ? emails.find(
            (e) => e?.primary === true && e.verified === true && typeof e.email === "string"
          )
        : undefined
      const name = [user.name, user.login].find((n) => typeof n === "string" && n.length > 0)
      return {
        providerUserId: String(user.id),
        email: primary?.email ?? null,
        emailVerified: primary !== undefined,
        name: name ?? null,
      }
    },
  }
}
