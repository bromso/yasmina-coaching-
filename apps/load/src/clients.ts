import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { type ApiClient, isTwoFactorChallenge } from "@repo/api-contract"
import { latestMail, linkIn } from "./mail"
import { DEFAULT_MAIL_DIR } from "./stack"
import { type Targets, targets } from "./target"

export type ApiTarget = Pick<Targets, "api" | "apiToken">

export type ClientOptions = {
  /**
   * Sent as `x-api-client-id`: the api's rate limiter keeps one bucket per id, so give each VU its
   * own. Default: one per session token (hashed), none for an anonymous client.
   */
  clientId?: string
  sessionToken?: string
  /** Sent as `x-request-id`, so a slow request can be found in the api's log. */
  requestId?: string
  /** Default `targets()` (LOAD_TARGET_API, API_SERVICE_TOKEN). */
  target?: ApiTarget
  /** Abort a call after this long. Default 10 s. */
  timeoutMs?: number
}

/** `apiClient`'s default per-call timeout. */
export const DEFAULT_CLIENT_TIMEOUT_MS = 10_000

export const LOAD_PASSWORD = "correct horse battery staple"

const sessionClientId = (token: string) =>
  `load-session:${new Bun.CryptoHasher("sha256").update(token).digest("hex").slice(0, 32)}`

/** The typed `@repo/api-contract` client over `/rpc`, with the service bearer token. */
export function apiClient({
  clientId,
  sessionToken,
  requestId,
  target = targets(),
  timeoutMs = DEFAULT_CLIENT_TIMEOUT_MS,
}: ClientOptions = {}): ApiClient {
  const resolvedClientId = clientId ?? (sessionToken ? sessionClientId(sessionToken) : undefined)
  const headers: Record<string, string> = { authorization: `Bearer ${target.apiToken}` }
  if (sessionToken) headers["x-session-token"] = sessionToken
  if (resolvedClientId) headers["x-api-client-id"] = resolvedClientId
  if (requestId) headers["x-request-id"] = requestId
  return createORPCClient(
    new RPCLink({
      url: new URL("/rpc", target.api).toString(),
      headers,
      fetch: (request, init) =>
        fetch(request, {
          ...init,
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
        }),
    })
  )
}

export type SignedInUser = {
  client: ApiClient
  sessionToken: string
  userId: number
  email: string
}

/**
 * A verified, signed-in account: `auth.signUp`, the verify link read from the `file` mailbox,
 * `auth.verifyEmail`, then `auth.signIn` for a fresh session.
 */
export async function signUpVerified(
  email: string,
  {
    target = targets(),
    mailDir = process.env.LOAD_MAIL_DIR || DEFAULT_MAIL_DIR,
    clientId,
  }: { target?: ApiTarget; mailDir?: string; clientId?: string } = {}
): Promise<SignedInUser> {
  const anonymous = apiClient({ target, clientId: clientId ?? `load-anon:${email}` })
  const after = Date.now()
  await anonymous.auth.signUp({ email, password: LOAD_PASSWORD })
  const mail = await latestMail(mailDir, email, {
    after,
    match: (m) => /\/verify-email\?/.test(m.text),
  })
  const token = new URL(linkIn(mail, /\/verify-email\?/)).searchParams.get("token")
  if (!token) throw new Error(`the verify mail to ${email} carries no token`)
  await anonymous.auth.verifyEmail({ token })
  const result = await anonymous.auth.signIn({ email, password: LOAD_PASSWORD })
  if (isTwoFactorChallenge(result)) throw new Error(`${email} unexpectedly has two-step on`)
  const sessionToken = result.session.token
  return {
    client: apiClient({ target, sessionToken, clientId }),
    sessionToken,
    userId: result.user.id,
    email,
  }
}

/** Creates a workspace owned by the client's user; returns its id. */
export async function withWorkspace(client: ApiClient, name = "Load workspace"): Promise<number> {
  const workspace = await client.workspaces.create({ name })
  return workspace.id
}
