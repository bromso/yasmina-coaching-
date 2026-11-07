import { ORPCError } from "@orpc/client"
import {
  type ApiClient,
  isTwoFactorChallenge,
  MagicLinkRequestSchema,
  PasskeyVerifyInput,
  RequestPasswordResetSchema,
  ResetPasswordSchema,
  SignInSchema,
  SignUpSchema,
} from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { createLogger } from "@repo/log"
import { type FormState, fieldErrors } from "@repo/ui/components/form-feedback"
import { authTranslator, zodMessage } from "./i18n"
import type { TwoFactorRedirect } from "./two-factor"
import { isPlausibleToken } from "./verify-email"

const logger = createLogger({ service: "auth" })

export type { FormState }

export type AuthApi = Pick<
  ApiClient["auth"],
  "signIn" | "signUp" | "requestPasswordReset" | "resetPassword" | "magicLink" | "passkey"
>

/** Everything a form action needs, injected so the cores run under bun test with a fake api. */
export type ActionDeps = {
  api: AuthApi
  setSession(session: { token: string; expiresAt: string }): Promise<void>
  safeNextUrl(candidate: string | null | undefined): string
  client: { userAgent?: string; ip?: string }
  /**
   * Ends a session this browser already holds, so a new sign-in does not leave it live
   * api-side.
   */
  endCurrentSession?: () => Promise<void>
  /** The request's language, for this app's own sentences and field errors; English by default.
   * The api's messages already arrive in it (the client sends `x-locale`), so they pass through. */
  locale?: Locale
}

/**
 * The English of `auth.common.unavailable` and friends (a test keeps them equal to the catalog).
 */
export const UNAVAILABLE = "The sign-in service is unavailable right now. Try again in a moment."
export const RESET_SENT = "If an account exists for that email, a reset link is on its way."
export const MAGIC_SENT = "Check your inbox for a sign-in link."
export const MAGIC_INVALID = "This sign-in link has expired or was already used."
/** The client-side (never the api's own) passkey failure sentence — kept word-for-word equal to
 * `PASSKEY_FAILED_MESSAGE` in `@repo/api-contract`, since a reader must not see two different
 * sentences for "that didn't work" depending on where the failure happened. */
export const PASSKEY_FAILED = "That passkey didn't work. Try again or use another way to sign in."
export const PASSKEY_CANCELLED = "Passkey sign-in was cancelled."

const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}

/**
 * Ends the browser's previous session once a new one has been issued (a failed sign-in leaves it
 * alone). One that cannot be ended is logged, never a reason to refuse the new sign-in.
 */
async function endCurrentSession(deps: ActionDeps) {
  await deps.endCurrentSession?.().catch((error) => {
    logger.error("ending the current session failed", { error })
  })
}

/** The api issued a session; a failure to write its cookie is ours, so it is logged as such. */
async function storeSession(
  deps: ActionDeps,
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

export async function signInCore(
  deps: ActionDeps,
  fd: FormData
): Promise<FormState | { redirectTo: string } | TwoFactorRedirect> {
  const t = authTranslator(deps.locale)
  const values = { email: str(fd, "email") }
  const parsed = SignInSchema.safeParse({
    email: values.email,
    password: str(fd, "password"),
    client: deps.client,
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)), values }
  }
  let issued: Awaited<ReturnType<AuthApi["signIn"]>>
  try {
    issued = await deps.api.signIn(parsed.data)
  } catch (error) {
    // FORBIDDEN only once the password is right: a suspended account, shown with the api's own
    // (already-translated) message.
    const known = apiError(error, ["UNAUTHORIZED", "TOO_MANY_REQUESTS", "FORBIDDEN"])
    if (!known) logger.error("signIn failed", { error })
    return { ok: false, message: known?.message ?? t("common.unavailable"), values }
  }
  // Two-step verification is on: the code step finishes the sign-in, not this action.
  if (isTwoFactorChallenge(issued)) {
    return { challenge: issued.twoFactor.challenge, next: deps.safeNextUrl(str(fd, "next")) }
  }
  // Only now, with the new session issued and the old token still in the cookie, end the old one.
  await endCurrentSession(deps)
  if (!(await storeSession(deps, issued.session)))
    return { ok: false, message: t("common.unavailable"), values }
  return { redirectTo: deps.safeNextUrl(str(fd, "next")) }
}

/**
 * Begins a passkey sign-in: WebAuthn request options plus an opaque challenge id, for
 * `startAuthentication` to run in the browser. Never a two-factor challenge, never field errors —
 * there is no form here, just a button and (when the browser supports it) a quiet autofill
 * ceremony — so any refusal is "unavailable" in the caller's language.
 */
export async function passkeyOptionsCore(
  deps: Pick<ActionDeps, "api" | "locale">
): Promise<{ ok: true; options: unknown; challengeId: string } | { ok: false; message: string }> {
  const t = authTranslator(deps.locale)
  try {
    const { options, challengeId } = await deps.api.passkey.options()
    return { ok: true, options, challengeId }
  } catch (error) {
    logger.error("passkey options failed", { error })
    return { ok: false, message: t("common.unavailable") }
  }
}

/**
 * Finishes a passkey sign-in: the browser's `startAuthentication` response, verified api-side.
 * Same shape as `signInCore` minus the two-factor branch — a passkey counts as both factors, so
 * `auth.passkey.verify` never answers a challenge — and reuses the same session helpers.
 */
export async function passkeySignInCore(
  deps: ActionDeps,
  fd: FormData
): Promise<FormState | { redirectTo: string }> {
  const t = authTranslator(deps.locale)
  let response: unknown
  try {
    response = JSON.parse(str(fd, "response"))
  } catch {
    return { ok: false, message: t("passkey.failed") }
  }
  const parsed = PasskeyVerifyInput.safeParse({
    challengeId: str(fd, "challengeId"),
    response,
    client: deps.client,
  })
  if (!parsed.success) return { ok: false, message: t("passkey.failed") }
  let issued: Awaited<ReturnType<AuthApi["passkey"]["verify"]>>
  try {
    issued = await deps.api.passkey.verify(parsed.data)
  } catch (error) {
    // FORBIDDEN only once the passkey verifies: a suspended account, shown with the api's own
    // (already-translated) message.
    const known = apiError(error, ["UNAUTHORIZED", "TOO_MANY_REQUESTS", "FORBIDDEN"])
    if (!known) logger.error("passkey verify failed", { error })
    return { ok: false, message: known?.message ?? t("common.unavailable") }
  }
  // Only now, with the new session issued and the old token still in the cookie, end the old one.
  await endCurrentSession(deps)
  if (!(await storeSession(deps, issued.session)))
    return { ok: false, message: t("common.unavailable") }
  return { redirectTo: deps.safeNextUrl(str(fd, "next")) }
}

export async function signUpCore(
  deps: ActionDeps,
  fd: FormData
): Promise<FormState | { redirectTo: string }> {
  const t = authTranslator(deps.locale)
  const values = { name: str(fd, "name"), email: str(fd, "email") }
  const parsed = SignUpSchema.safeParse({
    ...values,
    password: str(fd, "password"),
    client: deps.client,
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)), values }
  }
  let issued: Awaited<ReturnType<AuthApi["signUp"]>>
  try {
    issued = await deps.api.signUp(parsed.data)
  } catch (error) {
    const conflict = apiError(error, ["CONFLICT"])
    if (conflict) return { ok: false, fieldErrors: { email: conflict.message }, values }
    const limited = apiError(error, ["TOO_MANY_REQUESTS"])
    if (limited) return { ok: false, message: limited.message, values }
    logger.error("signUp failed", { error })
    return { ok: false, message: t("common.unavailable"), values }
  }
  // Only now, with the new session issued and the old token still in the cookie, end the old one.
  await endCurrentSession(deps)
  if (!(await storeSession(deps, issued.session)))
    return { ok: false, message: t("common.unavailable"), values }
  return { redirectTo: deps.safeNextUrl(str(fd, "next")) }
}

export async function forgotPasswordCore(deps: ActionDeps, fd: FormData): Promise<FormState> {
  const t = authTranslator(deps.locale)
  const parsed = RequestPasswordResetSchema.safeParse({ email: str(fd, "email") })
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)),
      values: { email: str(fd, "email") },
    }
  }
  // Whatever the api says (including nothing, because it is down), the user sees the same sentence.
  await deps.api
    .requestPasswordReset(parsed.data)
    .catch((error) => logger.error("forgot failed", { error }))
  return { ok: true, message: t("forgotPassword.sent") }
}

export async function resetPasswordCore(
  deps: ActionDeps,
  fd: FormData
): Promise<FormState | { redirectTo: string }> {
  const t = authTranslator(deps.locale)
  const password = str(fd, "password")
  if (password !== str(fd, "confirm"))
    return { ok: false, fieldErrors: { confirm: t("validation.passwordsDontMatch") } }
  const parsed = ResetPasswordSchema.safeParse({ token: str(fd, "token"), password })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)) }
  }
  try {
    await deps.api.resetPassword(parsed.data)
    return { redirectTo: "/login?reset=1" }
  } catch (error) {
    const bad = apiError(error, ["BAD_REQUEST"])
    if (!bad) logger.error("resetPassword failed", { error })
    return { ok: false, message: bad?.message ?? t("common.unavailable") }
  }
}

export async function requestMagicLinkCore(deps: ActionDeps, fd: FormData): Promise<FormState> {
  const t = authTranslator(deps.locale)
  const parsed = MagicLinkRequestSchema.safeParse({ email: str(fd, "email") })
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)),
      values: { email: str(fd, "email") },
    }
  }
  // Whatever the api says (including nothing, because it is down), the user sees the same sentence.
  await deps.api.magicLink
    .request(parsed.data)
    .catch((error) => logger.error("magicLink request failed", { error }))
  return { ok: true, message: t("magic.sent") }
}

export async function consumeMagicLinkCore(
  deps: ActionDeps,
  fd: FormData
): Promise<FormState | { redirectTo: string } | TwoFactorRedirect> {
  const t = authTranslator(deps.locale)
  const token = str(fd, "token")
  // An implausible token is never worth a round trip, and the message is the same either way.
  if (!isPlausibleToken(token)) return { ok: false, message: t("magic.invalid") }
  let issued: Awaited<ReturnType<AuthApi["magicLink"]["consume"]>>
  try {
    issued = await deps.api.magicLink.consume({ token, client: deps.client })
  } catch (error) {
    const bad = apiError(error, ["BAD_REQUEST"])
    if (bad) return { ok: false, message: t("magic.invalid") }
    // A suspended account: the link itself was good, shown with the api's own message.
    const suspended = apiError(error, ["FORBIDDEN"])
    if (suspended) return { ok: false, message: suspended.message }
    logger.error("magicLink consume failed", { error })
    return { ok: false, message: t("common.unavailable") }
  }
  // Two-step verification is on: the code step finishes the sign-in, not this action.
  if (isTwoFactorChallenge(issued)) {
    return { challenge: issued.twoFactor.challenge, next: deps.safeNextUrl(str(fd, "next")) }
  }
  // Only now, with the new session issued and the old token still in the cookie, end the old one.
  await endCurrentSession(deps)
  if (!(await storeSession(deps, issued.session))) {
    return { ok: false, message: t("common.unavailable") }
  }
  return { redirectTo: deps.safeNextUrl(str(fd, "next")) }
}
