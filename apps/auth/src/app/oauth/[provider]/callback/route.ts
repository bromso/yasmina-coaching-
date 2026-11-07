import { createLogger } from "@repo/log"
import { requestInfo, SESSION_COOKIE } from "@repo/session"
import { type NextRequest, NextResponse } from "next/server"
import { getAuth } from "@/lib/auth"
import {
  appleFormPostRedirect,
  OAUTH_COOKIE,
  type OauthCallbackParams,
  oauthCallbackCore,
  oauthCookieAttributes,
} from "@/lib/oauth"
import { TWO_FACTOR_COOKIE, twoFactorCookieAttributes } from "@/lib/two-factor"

const logger = createLogger({ service: "auth" })

type Context = { params: Promise<{ provider: string }> }

/**
 * Every provider finishes here: Google and GitHub return with a GET, and Apple's `form_post` is
 * bounced into one by `POST` below. A top-level GET carries the `SameSite=Lax` session cookie.
 */
export async function GET(req: NextRequest, ctx: Context) {
  const q = req.nextUrl.searchParams
  return finish(req, ctx, {
    code: q.get("code") ?? undefined,
    state: q.get("state") ?? undefined,
    error: q.get("error") ?? undefined,
    user: q.get("user") ?? undefined,
  })
}

/**
 * Apple returns with a cross-site `form_post` (its `user` field carries the name, once). A Lax
 * cookie never rides a cross-site POST, so finishing here would not see the session and "Connect
 * Apple" would run as a sign-in. Instead this answers 303 to the GET above on this origin with the
 * fields in the query; the `oauth` cookie (`SameSite=None`) is left for the GET to check and clear.
 */
export async function POST(req: NextRequest, { params }: Context) {
  const { provider } = await params
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    form = new FormData()
  }
  const field = (name: string) => {
    const v = form.get(name)
    return typeof v === "string" ? v : undefined
  }
  const location = appleFormPostRedirect(provider, {
    code: field("code"),
    state: field("state"),
    user: field("user"),
    error: field("error"),
  })
  return new NextResponse(null, { status: 303, headers: { Location: location } })
}

async function finish(req: NextRequest, { params }: Context, query: OauthCallbackParams) {
  const { provider } = await params
  const auth = getAuth()
  const client = requestInfo(req.headers)
  // Signed in already: forward the session so the api connects the provider to this account.
  const currentToken = req.cookies.get(SESSION_COOKIE)?.value
  const signedIn = Boolean(currentToken)
  const out = await oauthCallbackCore(
    {
      callback: async (input, as) => {
        const api = as === "user" ? await auth.api() : await auth.anonymousApi({ ip: client.ip })
        return api.auth.oauth.callback({ ...input, client })
      },
      safeNextUrl: auth.safeNextUrl,
    },
    {
      provider,
      params: query,
      cookie: req.cookies.get(OAUTH_COOKIE)?.value,
      signedIn,
      currentToken,
    }
  )
  // Two-step verification is on: park the challenge and send the browser to the code step instead
  // of issuing a session.
  if ("challenge" in out) {
    const res = new NextResponse(null, {
      status: 303,
      headers: { Location: `/login/verify?next=${encodeURIComponent(out.next)}` },
    })
    res.cookies.set(
      TWO_FACTOR_COOKIE,
      out.challenge,
      twoFactorCookieAttributes(process.env.NODE_ENV === "production")
    )
    res.cookies.set(OAUTH_COOKIE, "", { ...oauthCookieAttributes, maxAge: 0 })
    return res
  }
  let location = out.redirectTo
  // No `session` when the api answered with this browser's own (connecting a provider while
  // signed in never mints a second one): the cookie stays exactly as it is.
  if (out.session) {
    // The new session is issued; end the one this browser held (as password sign-in does). A
    // failure is logged, never a reason to refuse the new sign-in.
    if (signedIn) {
      await auth
        .api()
        .then((api) => api.auth.signOut())
        .catch((error) => logger.error("ending the current session failed", { error }))
    }
    try {
      await auth.setSession(out.session)
    } catch (error) {
      logger.error("setSession failed", { error })
      location = "/login?error=failed"
    }
  }
  // A relative Location keeps a rewritten Host out of it.
  const res = new NextResponse(null, { status: 303, headers: { Location: location } })
  // Single use, whatever the outcome.
  res.cookies.set(OAUTH_COOKIE, "", { ...oauthCookieAttributes, maxAge: 0 })
  return res
}
