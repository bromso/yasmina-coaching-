import type { ProviderId } from "../queries/identities"
import { appleProvider } from "./apple"
import { githubProvider } from "./github"
import { googleProvider } from "./google"
import type { Provider } from "./provider"

export type OAuthEnv = {
  OAUTH_GOOGLE_CLIENT_ID?: string
  OAUTH_GOOGLE_CLIENT_SECRET?: string
  OAUTH_GITHUB_CLIENT_ID?: string
  OAUTH_GITHUB_CLIENT_SECRET?: string
  OAUTH_APPLE_CLIENT_ID?: string
  OAUTH_APPLE_TEAM_ID?: string
  OAUTH_APPLE_KEY_ID?: string
  OAUTH_APPLE_PRIVATE_KEY?: string
}

/**
 * The providers whose env is fully present, in a fixed order (google, github, apple). Each one's
 * redirect URI is `${redirectBase}/oauth/<id>/callback`. `fetchImpl` serves GitHub's profile calls;
 * Arctic's own token requests go through the global fetch.
 */
export function createProviders(
  env: OAuthEnv,
  redirectBase: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Map<ProviderId, Provider> {
  const base = redirectBase.replace(/\/+$/, "")
  const redirect = (id: ProviderId) => `${base}/oauth/${id}/callback`
  const providers = new Map<ProviderId, Provider>()
  if (env.OAUTH_GOOGLE_CLIENT_ID && env.OAUTH_GOOGLE_CLIENT_SECRET) {
    providers.set(
      "google",
      googleProvider(env.OAUTH_GOOGLE_CLIENT_ID, env.OAUTH_GOOGLE_CLIENT_SECRET, redirect("google"))
    )
  }
  if (env.OAUTH_GITHUB_CLIENT_ID && env.OAUTH_GITHUB_CLIENT_SECRET) {
    providers.set(
      "github",
      githubProvider(
        env.OAUTH_GITHUB_CLIENT_ID,
        env.OAUTH_GITHUB_CLIENT_SECRET,
        redirect("github"),
        fetchImpl
      )
    )
  }
  if (
    env.OAUTH_APPLE_CLIENT_ID &&
    env.OAUTH_APPLE_TEAM_ID &&
    env.OAUTH_APPLE_KEY_ID &&
    env.OAUTH_APPLE_PRIVATE_KEY
  ) {
    providers.set(
      "apple",
      appleProvider(
        env.OAUTH_APPLE_CLIENT_ID,
        env.OAUTH_APPLE_TEAM_ID,
        env.OAUTH_APPLE_KEY_ID,
        env.OAUTH_APPLE_PRIVATE_KEY,
        redirect("apple")
      )
    )
  }
  return providers
}
