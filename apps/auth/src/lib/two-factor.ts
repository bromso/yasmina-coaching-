import { ORPCError } from "@orpc/client"
import { type ApiClient, TwoFactorVerifySchema } from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { createLogger } from "@repo/log"
import type { FormState } from "@repo/ui/components/form-feedback"
import { authTranslator } from "./i18n"

const logger = createLogger({ service: "auth" })

export type { FormState }

/**
 * Where a sign-in path's (password, magic link, provider) pending challenge waits for its code.
 * Host-only (no Domain, like `oauth`: this origin only), HttpOnly, Lax, 5 minutes — matching the
 * api's own challenge TTL. `secure` follows the environment, same as `@repo/session`'s cookies.
 */
export const TWO_FACTOR_COOKIE = "two_factor"

export function twoFactorCookieAttributes(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure,
    maxAge: 300,
  }
}

/**
 * What `signInCore`, `consumeMagicLinkCore` and `oauthCallbackCore` return instead of a session
 * when the account has two-step verification on: the thin action/route sets `TWO_FACTOR_COOKIE` to
 * `challenge` and redirects to `/login/verify?next=…`.
 */
export type TwoFactorRedirect = { challenge: string; next: string }

export type TwoFactorApi = Pick<ApiClient["auth"]["twoFactor"], "verify">

/**
 * The English of `auth.twoFactor.invalidCode` (a test keeps it equal to the catalog): an
 * undeclared `BAD_REQUEST` from `verify` (the api's own input schema rejecting the code's shape)
 * — should not happen, since the local check below enforces the same bounds, but it is a bad code
 * either way, never "unavailable" or "timed out".
 */
export const TWO_FACTOR_INVALID_CODE_MESSAGE =
  "Enter the 6-digit code from your app, or a recovery code."

/** Everything `verifyTwoFactorCore` needs, injected so it runs under bun test with a fake api. */
export type VerifyDeps = {
  api: TwoFactorApi
  setSession(session: { token: string; expiresAt: string }): Promise<void>
  safeNextUrl(candidate: string | null | undefined): string
  client: { userAgent?: string; ip?: string }
  /** Ends a session this browser already holds, as the other sign-in cores do. */
  endCurrentSession?: () => Promise<void>
  /** `TWO_FACTOR_COOKIE`'s value, read by the thin action; missing means nothing to verify. */
  challenge: string | null
  /** The request's language, for this app's own sentences; English by default. */
  locale?: Locale
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}

/** Mirrors `actions.ts`'s `endCurrentSession`: a failure to end the old session is logged, never a reason to refuse the new one. */
async function endCurrentSession(deps: VerifyDeps) {
  await deps.endCurrentSession?.().catch((error) => {
    logger.error("ending the current session failed", { error })
  })
}

/** Mirrors `actions.ts`'s `storeSession`: the api issued a session; a cookie write failure is ours. */
async function storeSession(
  deps: VerifyDeps,
  session: { token: string; expiresAt: string }
): Promise<boolean> {
  try {
    await deps.setSession(session)
    return true
  } catch (error) {
    logger.error("setSession failed", { error })
    return false
  }
}

/** A declared api error with one of the given codes, else undefined (anything else is "unavailable"). */
function apiError(error: unknown, codes: string[]) {
  return error instanceof ORPCError && error.defined && codes.includes(error.code)
    ? error
    : undefined
}

/** `error=two_factor_expired`, with `next` only when it differs from the login page's own default
 * (so a plain sign-in timeout does not clutter the url with a redundant `next=<appUrl>`). */
function expiredRedirect(deps: VerifyDeps, next: string): { redirectTo: string } {
  const isDefault = next === deps.safeNextUrl(undefined)
  return {
    redirectTo: isDefault
      ? "/login?error=two_factor_expired"
      : `/login?error=two_factor_expired&next=${encodeURIComponent(next)}`,
  }
}

/**
 * The code step's one action: a wrong code keeps the user on the page as a field error (so a retry
 * still targets the same challenge); an expired, unknown or already-burnt one sends them back to
 * sign in again (keeping `next`); a missing or tampered cookie goes straight to `/login`. The
 * code's shape is checked locally first, against the same bounds the api's own input schema
 * enforces, so a *declared* `BAD_REQUEST` is always the "timed out" one; an *undeclared*
 * `BAD_REQUEST` (the api's own schema rejecting a shape ours should already have caught) is a
 * field error instead — it is a bad code, not an unavailable service or a dead challenge.
 */
export async function verifyTwoFactorCore(
  deps: VerifyDeps,
  fd: FormData
): Promise<FormState | { redirectTo: string }> {
  if (!deps.challenge) return { redirectTo: "/login" }
  const t = authTranslator(deps.locale)
  const next = deps.safeNextUrl(str(fd, "next"))
  const parsed = TwoFactorVerifySchema.safeParse({
    challenge: deps.challenge,
    code: str(fd, "code"),
    client: deps.client,
  })
  if (!parsed.success) {
    const issues = parsed.error.issues
    // A malformed challenge (a tampered cookie — the normal case, a missing one, is caught above)
    // is handled exactly the same way: there is nothing to verify.
    if (issues.some((issue) => issue.path[0] === "challenge")) return { redirectTo: "/login" }
    // Only a `code` issue is ever shown as a field error on this form, and only one kind: the
    // code is too short or too long, which the reader fixes by entering the code they were asked
    // for. Anything else (`client`, built from the request rather than typed in) is ours to
    // explain, not the user's to fix.
    if (issues.every((issue) => issue.path[0] === "code")) {
      return { ok: false, fieldErrors: { code: t("twoFactor.invalidCode") } }
    }
    return { ok: false, message: t("common.unavailable") }
  }
  let issued: Awaited<ReturnType<TwoFactorApi["verify"]>>
  try {
    issued = await deps.api.verify(parsed.data)
  } catch (error) {
    const expired = apiError(error, ["BAD_REQUEST"])
    if (expired) return expiredRedirect(deps, next)
    const wrong = apiError(error, ["UNAUTHORIZED"])
    if (wrong) return { ok: false, fieldErrors: { code: wrong.message } }
    const limited = apiError(error, ["TOO_MANY_REQUESTS"])
    if (limited) return { ok: false, message: limited.message }
    // A suspended account: the code itself was right, shown with the api's own message.
    const suspended = apiError(error, ["FORBIDDEN"])
    if (suspended) return { ok: false, message: suspended.message }
    if (error instanceof ORPCError && !error.defined && error.code === "BAD_REQUEST") {
      logger.error("twoFactor verify rejected the code's shape (undeclared)", { error })
      return { ok: false, fieldErrors: { code: t("twoFactor.invalidCode") } }
    }
    logger.error("twoFactor verify failed", { error })
    return { ok: false, message: t("common.unavailable") }
  }
  // Only now, with the new session issued and the old token still in the cookie, end the old one.
  await endCurrentSession(deps)
  if (!(await storeSession(deps, issued.session))) {
    return { ok: false, message: t("common.unavailable") }
  }
  return { redirectTo: next }
}
