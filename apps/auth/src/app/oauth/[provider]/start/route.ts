import type { ProviderId } from "@repo/api-contract"
import { createLogger } from "@repo/log"
import { requestInfo, SESSION_COOKIE } from "@repo/session"
import { type NextRequest, NextResponse } from "next/server"
import { getAuth } from "@/lib/auth"
import { OAUTH_COOKIE, oauthCookieAttributes, oauthStartCore } from "@/lib/oauth"

const logger = createLogger({ service: "auth" })

/**
 * Begins a provider sign-in: binds the api's state and PKCE verifier to this browser, then
 * redirects. A browser holding a session is connecting the provider, so the session is forwarded
 * and the api refuses one past its re-auth window (→ the sign-in form, `?reauth=1`) — except from
 * that form's own buttons (`?reauth=1` here too), which sign in afresh.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const auth = getAuth()
  const reauth = req.nextUrl.searchParams.get("reauth") === "1"
  const connect = Boolean(req.cookies.get(SESSION_COOKIE)?.value) && !reauth
  let out: Awaited<ReturnType<typeof oauthStartCore>>
  try {
    const api = connect
      ? await auth.api()
      : await auth.anonymousApi({ ip: requestInfo(req.headers).ip })
    const { providers } = await api.auth.providers()
    out = await oauthStartCore(
      {
        providers,
        start: (p: ProviderId) => api.auth.oauth.start({ provider: p }),
        safeNextUrl: auth.safeNextUrl,
      },
      { provider, next: req.nextUrl.searchParams.get("next") ?? undefined, reauth }
    )
  } catch (error) {
    logger.error("oauth start failed", { error })
    return new NextResponse(null, { status: 303, headers: { Location: "/login?error=failed" } })
  }
  if ("status" in out) return new NextResponse("Not found", { status: 404 })
  // Relative, like every other Location here: a rewritten Host never reaches it.
  if ("signInAgain" in out)
    return new NextResponse(null, { status: 303, headers: { Location: out.signInAgain } })
  const res = NextResponse.redirect(out.redirectTo, 302)
  res.cookies.set(OAUTH_COOKIE, out.cookie, oauthCookieAttributes)
  return res
}
