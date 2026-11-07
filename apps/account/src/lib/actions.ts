import { ORPCError } from "@orpc/client"
import {
  type ApiClient,
  ChangePasswordSchema,
  DeleteAccountSchema,
  EMAIL_CHANGE_CODE_REASON,
  type EmailChangePending,
  EmailChangeRequestSchema,
  MAX_IMAGE_BYTES,
  PasskeyIdSchema,
  RegisterInput as PasskeyRegisterInput,
  type ProviderId,
  ProviderIdSchema,
  RenamePasskeySchema,
  SessionIdSchema,
  SetPasswordSchema,
  TWO_FACTOR_PASSWORD_REASON,
  TWO_FACTOR_REAUTH_REASON,
  TWO_FACTOR_WRONG_CODE_REASON,
  TwoFactorCodeSchema,
  UpdateProfileSchema,
} from "@repo/api-contract"
import { isLocale, type Locale } from "@repo/i18n/locales"
import { createLogger } from "@repo/log"
import { type FormState, fieldErrors } from "@repo/ui/components/form-feedback"
import { consentCookie } from "@repo/ui/lib/consent"
import { renderSVG } from "uqr"
import { type AccountT, accountTranslator, oauthErrorMessageIn, zodMessage } from "./i18n"
import { PROVIDER_LABELS } from "./providers"

const logger = createLogger({ service: "account" })

export type { FormState }

export { PROVIDER_LABELS }

/**
 * The Connected-accounts card's message for `?error=…&provider=…`: the auth app sends a failed
 * connect back here. Unknown codes (or none) show nothing; an unknown provider id is not named.
 * In the page's language (English by default).
 *
 * `"suspended"` is apps/auth's own addition, outside `@repo/ui/lib/oauth-errors`'s shared map: its
 * oauth callback sends it when the provider vouched for a suspended account (the api's own
 * already-translated message cannot survive that redirect — see apps/auth's `oauth.ts`). Reachable
 * here only when a suspended user's browser still held a stale `account` session cookie at the
 * moment of connecting (suspending ends every session, so this is a narrow race); the provider is
 * irrelevant to the message, unlike every other code.
 */
export function connectErrorMessage(
  error: string | undefined,
  provider: string | undefined,
  locale?: Locale
): string | undefined {
  const t = accountTranslator(locale)
  if (error === "suspended") return t("common.accountSuspended")
  const label =
    provider && Object.hasOwn(PROVIDER_LABELS, provider)
      ? PROVIDER_LABELS[provider as ProviderId]
      : undefined
  return oauthErrorMessageIn(t, error, label)
}

export type AccountApi = Pick<
  ApiClient["account"],
  "updateProfile" | "changePassword" | "setPassword" | "resendVerification"
> & {
  sessions: Pick<ApiClient["account"]["sessions"], "revoke" | "revokeOthers">
  identities: Pick<ApiClient["account"]["identities"], "list" | "disconnect">
  twoFactor: Pick<
    ApiClient["account"]["twoFactor"],
    "get" | "setup" | "enable" | "disable" | "regenerateRecoveryCodes"
  >
  avatar: Pick<ApiClient["account"]["avatar"], "set" | "remove">
  passkeys: Pick<
    ApiClient["account"]["passkeys"],
    "registerOptions" | "register" | "rename" | "delete"
  >
  email: Pick<ApiClient["account"]["email"], "get" | "requestChange" | "confirmChange">
}

/** Everything a form action needs, injected so the cores run under bun test with a fake api. */
export type ActionDeps = {
  api: AccountApi
  /** The request's language, for this app's own sentences and field errors; English by default.
   * The api's messages already arrive in it (the client sends `x-locale`), so they pass through. */
  locale?: Locale
}

/** The English of `account.common.unavailable` (a test keeps the two equal). */
export const UNAVAILABLE = "The account service is unavailable right now. Try again in a moment."

/** A form field as a string; a missing or file field is "". */
export const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}

/**
 * A declared api error with one of the given codes, else undefined (anything else is "unavailable").
 * Exported for `workspace-actions.ts`, whose logo cores need the same BAD_REQUEST/field-error split.
 */
export function apiError(error: unknown, codes: string[]) {
  return error instanceof ORPCError && error.defined && codes.includes(error.code)
    ? error
    : undefined
}

/** The uploaded image from a form; null when no file was chosen (browsers send an empty File). */
export function imageFile(fd: FormData, key = "file"): File | null {
  const v = fd.get(key)
  return v instanceof File && v.size > 0 ? v : null
}

/**
 * The `file` field, validated before the api ever sees it — shared by `setAvatarCore` and
 * `setLogoCore` so the "no file" / "too big" messages (and the client-side preview check in
 * `ImageUploadCard`, which mirrors this exact `MAX_IMAGE_BYTES` comparison and the same
 * `image.tooLarge` key) never drift apart. In `t`'s language, English by default.
 */
export function checkImageFile(
  fd: FormData,
  key = "file",
  t: AccountT = accountTranslator()
): { file: File } | { ok: false; fieldErrors: { file: string } } {
  const file = imageFile(fd, key)
  if (!file) return { ok: false, fieldErrors: { file: t("image.choose") } }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, fieldErrors: { file: t("image.tooLarge") } }
  return { file }
}

/**
 * The api's own message for a declared error (already in the request's language); anything
 * undeclared is logged and "unavailable", in `t`'s language (English by default).
 */
export function failure(
  error: unknown,
  codes: string[],
  what: string,
  t: AccountT = accountTranslator()
) {
  const known = apiError(error, ["UNAUTHORIZED", ...codes])
  if (!known) logger.error(`${what} failed`, { error })
  return known?.message ?? t("common.unavailable")
}

export async function updateProfileCore(deps: ActionDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const values = { name: str(fd, "name") }
  const parsed = UpdateProfileSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)), values }
  }
  try {
    await deps.api.updateProfile(parsed.data)
    return { ok: true, message: t("name.updated") }
  } catch (error) {
    return { ok: false, message: failure(error, [], "updateProfile", t), values }
  }
}

export async function setAvatarCore(deps: ActionDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const checked = checkImageFile(fd, "file", t)
  if (!("file" in checked)) return checked
  try {
    await deps.api.avatar.set({ file: checked.file })
    return { ok: true, message: t("image.avatarUpdated") }
  } catch (error) {
    const known = apiError(error, ["BAD_REQUEST"])
    if (known) return { ok: false, fieldErrors: { file: known.message } }
    const codes = ["TOO_MANY_REQUESTS", "SERVICE_UNAVAILABLE"]
    return { ok: false, message: failure(error, codes, "setAvatar", t) }
  }
}

export async function removeAvatarCore(deps: ActionDeps): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  try {
    await deps.api.avatar.remove()
    return { ok: true, message: t("image.avatarRemoved") }
  } catch (error) {
    return { ok: false, message: failure(error, [], "removeAvatar", t) }
  }
}

/** Passwords are never handed back as `values`: the form starts empty after every attempt. */
export async function changePasswordCore(deps: ActionDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const newPassword = str(fd, "newPassword")
  if (newPassword !== str(fd, "confirm"))
    return { ok: false, fieldErrors: { confirm: t("validation.passwordsDontMatch") } }
  const parsed = ChangePasswordSchema.safeParse({
    currentPassword: str(fd, "currentPassword"),
    newPassword,
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)) }
  }
  try {
    await deps.api.changePassword(parsed.data)
    return { ok: true, message: t("password.changed") }
  } catch (error) {
    const wrong = apiError(error, ["FORBIDDEN"])
    if (wrong) return { ok: false, fieldErrors: { currentPassword: wrong.message } }
    return { ok: false, message: failure(error, [], "changePassword", t) }
  }
}

export async function revokeSessionCore(deps: ActionDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const parsed = SessionIdSchema.safeParse({ id: str(fd, "sessionId") })
  if (!parsed.success) return { ok: false, message: t("sessions.notFound") }
  try {
    await deps.api.sessions.revoke(parsed.data)
    return { ok: true, message: t("sessions.revoked") }
  } catch (error) {
    return { ok: false, message: failure(error, ["NOT_FOUND"], "revokeSession", t) }
  }
}

export async function revokeOtherSessionsCore(deps: ActionDeps): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  try {
    await deps.api.sessions.revokeOthers()
    return { ok: true, message: t("sessions.revokedOthers") }
  } catch (error) {
    return { ok: false, message: failure(error, [], "revokeOtherSessions", t) }
  }
}

export type SetPasswordState = FormState & { reauthHref?: string }

/**
 * For a passwordless account: sets a first password so it can sign in with one too. The api
 * wants a recent sign-in for this (there is no password to re-check): a session that has outlived
 * the re-authentication window is told to sign in again, via `deps.reauthHref`, as two-step setup
 * does.
 */
export async function setPasswordCore(
  deps: ActionDeps & { reauthHref?: string },
  fd: FormData
): Promise<SetPasswordState> {
  const t = accountTranslator(deps.locale)
  const password = str(fd, "password")
  if (password !== str(fd, "confirm"))
    return { ok: false, fieldErrors: { confirm: t("validation.passwordsDontMatch") } }
  const parsed = SetPasswordSchema.safeParse({ password })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)) }
  }
  try {
    await deps.api.setPassword(parsed.data)
    return { ok: true, message: t("password.setDone") }
  } catch (error) {
    const known = apiError(error, ["FORBIDDEN"])
    if (
      known &&
      (known.data as { reason?: unknown } | undefined)?.reason === TWO_FACTOR_REAUTH_REASON
    )
      return { ok: false, message: known.message, reauthHref: deps.reauthHref, values: {} }
    return {
      ok: false,
      message: failure(error, ["CONFLICT", "FORBIDDEN"], "setPassword", t),
      values: {},
    }
  }
}

export async function disconnectIdentityCore(deps: ActionDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const parsed = ProviderIdSchema.safeParse(str(fd, "provider"))
  if (!parsed.success) return { ok: false, message: t("connected.unknownProvider") }
  try {
    await deps.api.identities.disconnect({ provider: parsed.data })
    return {
      ok: true,
      message: t("connected.disconnected", { provider: PROVIDER_LABELS[parsed.data] }),
    }
  } catch (error) {
    return {
      ok: false,
      message: failure(error, ["NOT_FOUND", "FORBIDDEN"], "disconnectIdentity", t),
    }
  }
}

export async function resendVerificationCore(deps: ActionDeps): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  try {
    const { sent } = await deps.api.resendVerification()
    return { ok: true, message: t(sent ? "verify.sent" : "verify.alreadyVerified") }
  } catch (error) {
    return { ok: false, message: failure(error, ["TOO_MANY_REQUESTS"], "resendVerification", t) }
  }
}

/**
 * The Email address card's `pending` prop, from either `account.email.requestChange`'s own answer
 * (the most recent attempt) or `account.email.get` (an earlier visit) — `EmailChangeCard` falls
 * back to the latter whenever the former is absent, success or failure alike.
 */
export type EmailChangeRequestState = FormState & {
  /** Set only on `account.email.requestChange`'s own `FORBIDDEN` reauth refusal, like
   * `setupTwoFactorCore`'s. */
  reauthHref?: string
  /** Set only on success: the request just answered. */
  pending?: EmailChangePending
  /** The address as typed, on every answer, so the field keeps it (React resets an action's
   * form after each submit) and **Send again** resends it. Never the password or the code. */
  values?: { newEmail: string }
}

/**
 * The Personal info page's **Change email** form: a new address, plus — the same re-check
 * `account.twoFactor.disable` runs — the current password (on an account that has one) and, with
 * two-step verification on, a current authenticator or recovery code. A missing or wrong password
 * is a field error on `currentPassword`; a missing or wrong code, on `code`; a passwordless
 * account past the re-authentication window is `deps.reauthHref`, as `setupTwoFactorCore`'s is.
 * The same address as today's is a field error on `newEmail` — the api's own wording, since a
 * taken address answers with the exact same shape (no existence oracle) and so needs no field
 * error of its own here.
 */
export async function requestEmailChangeCore(
  deps: ActionDeps & { reauthHref?: string },
  fd: FormData
): Promise<EmailChangeRequestState> {
  const t = accountTranslator(deps.locale)
  const values = { newEmail: str(fd, "newEmail") }
  const parsed = EmailChangeRequestSchema.safeParse({
    newEmail: values.newEmail,
    password: str(fd, "currentPassword") || undefined,
    code: str(fd, "code") || undefined,
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)), values }
  }
  try {
    const { pending } = await deps.api.email.requestChange(parsed.data)
    return { ok: true, pending, values }
  } catch (error) {
    const known = apiError(error, ["UNAUTHORIZED", "FORBIDDEN", "BAD_REQUEST"])
    const reason = (known?.data as { reason?: unknown } | undefined)?.reason
    if (known?.code === "UNAUTHORIZED" && reason === TWO_FACTOR_PASSWORD_REASON) {
      return { ok: false, fieldErrors: { currentPassword: known.message }, values }
    }
    if (known?.code === "UNAUTHORIZED" && reason === EMAIL_CHANGE_CODE_REASON) {
      return { ok: false, fieldErrors: { code: known.message }, values }
    }
    if (known?.code === "FORBIDDEN" && reason === TWO_FACTOR_REAUTH_REASON) {
      return { ok: false, message: known.message, reauthHref: deps.reauthHref, values }
    }
    if (known?.code === "BAD_REQUEST") {
      return { ok: false, fieldErrors: { newEmail: known.message }, values }
    }
    return {
      ok: false,
      message: failure(
        error,
        ["CONFLICT", "FORBIDDEN", "TOO_MANY_REQUESTS"],
        "email.requestChange",
        t
      ),
      values,
    }
  }
}

/** `account.email.confirmChange`'s answer, for `/email/confirm`'s button. */
export type EmailChangeConfirmState = { ok: true; email: string } | { ok: false; message?: string }

/**
 * `/email/confirm`'s one action: the token from the link's query string, never sent until the
 * button is pressed. Every refusal (an unknown, used, expired or another account's link; the new
 * address taken meanwhile; impersonating) is the api's own message, in place — there is nothing
 * here worth a field error.
 */
export async function confirmEmailChangeCore(
  deps: ActionDeps,
  fd: FormData
): Promise<EmailChangeConfirmState> {
  const t = accountTranslator(deps.locale)
  try {
    const { email } = await deps.api.email.confirmChange({ token: str(fd, "token") })
    return { ok: true, email }
  } catch (error) {
    return {
      ok: false,
      message: failure(error, ["BAD_REQUEST", "CONFLICT", "FORBIDDEN"], "email.confirmChange", t),
    }
  }
}

/** What the Language card's action needs: the save itself and the refresh after it. */
export type LocaleDeps = {
  setLocale(locale: Locale): Promise<void>
  /** Re-renders the whole tree (`revalidatePath("/", "layout")`) after a save. */
  revalidate(): void
  /** The language the page is in now, for a refusal; a success speaks the new one. */
  locale?: Locale
}

/**
 * The Language card: saves the submitted `locale` (the profile, then the cookie) and confirms it
 * in the language just chosen. An unsupported value is a field error; a save that fails is a form
 * message — never a throw to the error page.
 */
export async function setLocaleCore(deps: LocaleDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const locale = fd.get("locale")
  if (!isLocale(locale)) return { ok: false, fieldErrors: { locale: t("language.invalid") } }
  try {
    await deps.setLocale(locale)
  } catch (error) {
    logger.error("setLocale failed", { error })
    return { ok: false, message: t("language.failed") }
  }
  deps.revalidate()
  return { ok: true, message: accountTranslator(locale)("language.saved") }
}

/**
 * The wrong-code refusal, told apart by `data.reason`, never by its (translated) message:
 * `UNAUTHORIZED` is also the session's own "Sign in required" (an expired session), which
 * belongs on the form, not under the code field.
 */
function wrongCode(error: unknown) {
  const known = apiError(error, ["UNAUTHORIZED"])
  const data = known?.data as { reason?: unknown } | undefined
  return data?.reason === TWO_FACTOR_WRONG_CODE_REASON ? known : undefined
}

export type TwoFactorSetupState =
  | { ok: true; secret: string; otpauthUrl: string; qrSvg: string }
  | { ok: false; message?: string; fieldErrors?: Record<string, string>; reauthHref?: string }

/**
 * Starts (or restarts) enrolment: a fresh secret and its `otpauth://` URL, plus the QR rendered
 * server-side as an inline SVG string from `otpauthUrl` — the secret never leaves this response
 * for a third-party QR service. Reloading the page restarts setup (there is no "pending secret"
 * read endpoint); this core is called again from scratch every time.
 *
 * The api re-checks who is asking: a wrong (or, for an account with one, missing) current
 * password is a field error, and a passwordless account whose session has outlived the
 * re-authentication window is told to sign in again, via `deps.reauthHref` (built by the page
 * action from the auth app's own URL).
 */
export async function setupTwoFactorCore(
  deps: ActionDeps & { reauthHref?: string },
  fd: FormData
): Promise<TwoFactorSetupState> {
  const t = accountTranslator(deps.locale)
  const currentPassword = str(fd, "currentPassword")
  try {
    const { secret, otpauthUrl } = await deps.api.twoFactor.setup(
      currentPassword ? { currentPassword } : {}
    )
    return { ok: true, secret, otpauthUrl, qrSvg: renderSVG(otpauthUrl) }
  } catch (error) {
    const known = apiError(error, ["UNAUTHORIZED", "FORBIDDEN"])
    const reason = (known?.data as { reason?: unknown } | undefined)?.reason
    if (known && reason === TWO_FACTOR_PASSWORD_REASON)
      return { ok: false, fieldErrors: { currentPassword: known.message } }
    if (known && reason === TWO_FACTOR_REAUTH_REASON)
      return { ok: false, message: known.message, reauthHref: deps.reauthHref }
    return {
      ok: false,
      message: failure(error, ["CONFLICT", "FORBIDDEN", "TOO_MANY_REQUESTS"], "twoFactor.setup", t),
    }
  }
}

export type TwoFactorEnableState =
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; message?: string; fieldErrors?: Record<string, string> }

/** Confirms setup with a code from the authenticator app: on success, the ten recovery codes
 * (shown once — the api never returns them again). */
export async function enableTwoFactorCore(
  deps: ActionDeps,
  fd: FormData
): Promise<TwoFactorEnableState> {
  const t = accountTranslator(deps.locale)
  const parsed = TwoFactorCodeSchema.safeParse({ code: str(fd, "code") })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)) }
  }
  try {
    const { recoveryCodes } = await deps.api.twoFactor.enable(parsed.data)
    return { ok: true, recoveryCodes }
  } catch (error) {
    const wrong = wrongCode(error)
    if (wrong) return { ok: false, fieldErrors: { code: wrong.message } }
    return {
      ok: false,
      message: failure(
        error,
        ["CONFLICT", "BAD_REQUEST", "FORBIDDEN", "TOO_MANY_REQUESTS"],
        "twoFactor.enable",
        t
      ),
    }
  }
}

/** Turns two-step verification off: a TOTP code or a recovery code, same input as `enable`. */
export async function disableTwoFactorCore(deps: ActionDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const parsed = TwoFactorCodeSchema.safeParse({ code: str(fd, "code") })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)) }
  }
  try {
    await deps.api.twoFactor.disable(parsed.data)
    return { ok: true, message: t("twoFactor.turnedOff") }
  } catch (error) {
    const wrong = wrongCode(error)
    if (wrong) return { ok: false, fieldErrors: { code: wrong.message } }
    return {
      ok: false,
      message: failure(
        error,
        ["CONFLICT", "FORBIDDEN", "TOO_MANY_REQUESTS"],
        "twoFactor.disable",
        t
      ),
    }
  }
}

export type TwoFactorRegenerateState =
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; message?: string; fieldErrors?: Record<string, string> }

/** Replaces every recovery code; the old ones stop working immediately. */
export async function regenerateRecoveryCodesCore(
  deps: ActionDeps,
  fd: FormData
): Promise<TwoFactorRegenerateState> {
  const t = accountTranslator(deps.locale)
  const parsed = TwoFactorCodeSchema.safeParse({ code: str(fd, "code") })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)) }
  }
  try {
    const { recoveryCodes } = await deps.api.twoFactor.regenerateRecoveryCodes(parsed.data)
    return { ok: true, recoveryCodes }
  } catch (error) {
    const wrong = wrongCode(error)
    if (wrong) return { ok: false, fieldErrors: { code: wrong.message } }
    return {
      ok: false,
      message: failure(
        error,
        ["CONFLICT", "FORBIDDEN", "TOO_MANY_REQUESTS"],
        "twoFactor.regenerateRecoveryCodes",
        t
      ),
    }
  }
}

export type PasskeyRegisterOptionsState =
  | { ok: true; options: unknown; challengeId: string }
  | { ok: false; message?: string; fieldErrors?: Record<string, string>; reauthHref?: string }

/**
 * The "Add a passkey" form's first step: WebAuthn creation options and an opaque challenge id, for
 * `startRegistration` to run in the browser. The api re-checks who is asking exactly as two-step
 * setup does: a wrong (or, for an account with one, missing) current password is a field error,
 * and a passwordless account whose session has outlived the re-authentication window is told to
 * sign in again, via `deps.reauthHref` (built by the page action from the auth app's own URL).
 */
export async function passkeyRegisterOptionsCore(
  deps: ActionDeps & { reauthHref?: string },
  fd: FormData
): Promise<PasskeyRegisterOptionsState> {
  const t = accountTranslator(deps.locale)
  const currentPassword = str(fd, "currentPassword")
  try {
    const { options, challengeId } = await deps.api.passkeys.registerOptions(
      currentPassword ? { password: currentPassword } : {}
    )
    return { ok: true, options, challengeId }
  } catch (error) {
    const known = apiError(error, ["UNAUTHORIZED", "FORBIDDEN"])
    const reason = (known?.data as { reason?: unknown } | undefined)?.reason
    if (known && reason === TWO_FACTOR_PASSWORD_REASON)
      return { ok: false, fieldErrors: { currentPassword: known.message } }
    if (known && reason === TWO_FACTOR_REAUTH_REASON)
      return { ok: false, message: known.message, reauthHref: deps.reauthHref }
    return {
      ok: false,
      message: failure(
        error,
        // CONFLICT: the account already has MAX_PASSKEYS.
        ["FORBIDDEN", "TOO_MANY_REQUESTS", "CONFLICT"],
        "passkeys.registerOptions",
        t
      ),
    }
  }
}

export type PasskeyRegisterState = FormState

/**
 * The "Add a passkey" form's second step, once the browser has a signed attestation: the
 * challenge id `passkeyRegisterOptionsCore` answered with, the response, and an optional name.
 * Left blank (or whitespace-only), `name` is sent as `undefined` rather than `""` — the api's
 * schema requires at least one character, and `undefined` is what tells it to pick the default
 * ("This device" / "Security key") instead of answering a validation error for an empty field.
 */
export async function passkeyRegisterCore(
  deps: ActionDeps,
  fd: FormData
): Promise<PasskeyRegisterState> {
  const t = accountTranslator(deps.locale)
  let response: unknown
  try {
    response = JSON.parse(str(fd, "response"))
  } catch {
    return { ok: false, message: t("passkeys.ceremonyFailed") }
  }
  const name = str(fd, "name").trim()
  const parsed = PasskeyRegisterInput.safeParse({
    challengeId: str(fd, "challengeId"),
    response,
    name: name || undefined,
  })
  if (!parsed.success) return { ok: false, message: t("passkeys.ceremonyFailed") }
  try {
    await deps.api.passkeys.register(parsed.data)
    return { ok: true, message: t("passkeys.added") }
  } catch (error) {
    // CONFLICT: the cap was reached between the options and this register (another tab).
    const known = apiError(error, ["BAD_REQUEST", "CONFLICT"])
    if (known) return { ok: false, message: known.message }
    return { ok: false, message: failure(error, ["FORBIDDEN"], "passkeys.register", t) }
  }
}

/**
 * Renames a passkey. Unlike the other list cards' per-row forms (whose fields never fail
 * validation — a role is picked from a fixed list), this one can: the name is shown as a single
 * form message rather than a field error, since the result is shared by every row's identical
 * `useActionState` hook and there would be no way to tell, from the state alone, which row's input
 * it belongs to.
 */
export async function renamePasskeyCore(deps: ActionDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const parsed = RenamePasskeySchema.safeParse({ id: str(fd, "id"), name: str(fd, "name") })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, message: issue ? zodMessage(t)(issue) : t("validation.invalid") }
  }
  try {
    await deps.api.passkeys.rename(parsed.data)
    return { ok: true, message: t("passkeys.renamed") }
  } catch (error) {
    return { ok: false, message: failure(error, ["NOT_FOUND", "FORBIDDEN"], "passkeys.rename", t) }
  }
}

/**
 * Removes a passkey. The api refuses the account's last way in (`CONFLICT`, when there is no
 * password, no connected provider and no other passkey) with a translated message naming that.
 */
export async function deletePasskeyCore(deps: ActionDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const parsed = PasskeyIdSchema.safeParse({ id: str(fd, "id") })
  if (!parsed.success) return { ok: false, message: t("passkeys.notFound") }
  try {
    await deps.api.passkeys.delete(parsed.data)
    return { ok: true, message: t("passkeys.removed") }
  } catch (error) {
    return {
      ok: false,
      message: failure(error, ["NOT_FOUND", "FORBIDDEN", "CONFLICT"], "passkeys.delete", t),
    }
  }
}

// Data & privacy. Their own api slice, so the other cores' fakes need not grow.
export type PrivacyApi = Pick<ApiClient["account"], "delete" | "cancelDeletion"> & {
  export: Pick<ApiClient["account"]["export"], "request">
}

export type PrivacyDeps = { api: PrivacyApi; locale?: Locale }

/**
 * Asks for a data export; the card then shows it as being prepared. A second request inside the
 * interval is the api's `CONFLICT`, whose message already carries the time it can be asked again.
 */
export async function requestExportCore(deps: PrivacyDeps): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  try {
    await deps.api.export.request()
    return { ok: true, message: t("privacy.preparing") }
  } catch (error) {
    return { ok: false, message: failure(error, ["CONFLICT", "FORBIDDEN"], "export.request", t) }
  }
}

/** What the Cookies and analytics card needs: where the cookie goes, and the write itself. */
export type ConsentDeps = {
  /** `COOKIE_DOMAIN`, as the banner gets it, so one choice holds on every subdomain. */
  domain?: string
  /** Whether the page was served over https (the banner's `location.protocol === "https:"`). */
  secure: boolean
  /** Sets the cookie from a whole `Set-Cookie` string — the exact one the banner writes. */
  setCookie(raw: string): Promise<void> | void
  locale?: Locale
}

/** Saves the visitor's consent choice as the cookie banner does: `consentCookie(...)`, verbatim. */
export async function setConsentCore(deps: ConsentDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const value = str(fd, "consent")
  if (value !== "all" && value !== "necessary")
    return { ok: false, fieldErrors: { consent: t("privacy.consentInvalid") } }
  await deps.setCookie(consentCookie(value, { domain: deps.domain, secure: deps.secure }))
  return { ok: true, message: t("privacy.saved") }
}

/**
 * A `Set-Cookie` string (as `consentCookie` builds it) as Next's `cookies().set(name, value,
 * options)` wants it, so the server action writes exactly the attributes the banner writes.
 */
export function cookieParts(raw: string) {
  const [pair = "", ...attrs] = raw.split(";").map((part) => part.trim())
  const eq = pair.indexOf("=")
  const options: {
    path?: string
    maxAge?: number
    sameSite?: "lax" | "strict" | "none"
    domain?: string
    secure?: boolean
  } = {}
  for (const attr of attrs) {
    const [key = "", ...rest] = attr.split("=")
    const value = rest.join("=")
    switch (key.toLowerCase()) {
      case "path":
        options.path = value
        break
      case "max-age":
        options.maxAge = Number(value)
        break
      case "samesite":
        options.sameSite = value.toLowerCase() as "lax" | "strict" | "none"
        break
      case "domain":
        options.domain = value
        break
      case "secure":
        options.secure = true
        break
    }
  }
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1), options }
}

export type DeleteAccountState = FormState & { reauthHref?: string }

export type DeleteAccountDeps = PrivacyDeps & {
  /** The auth app's sign-in form with `next` back to this page, for a session that is too old. */
  reauthHref?: string
  /** Where a deleted account lands: `${AUTH_URL}/login?deleted=1`. */
  authUrl: string
  /** Drops this browser's session cookie (the api has already ended every session). */
  clearSession(): Promise<void>
  /** Next's `redirect`, which throws; outside the try so it is never caught as a failure. */
  redirect(url: string): never
}

/**
 * Schedules the account's deletion once the typed email matches; then signs this browser out
 * and sends it to the sign-in page, which says the account is scheduled for deletion. The
 * typed email is handed back on a refusal, so the field keeps it.
 */
export async function deleteAccountCore(
  deps: DeleteAccountDeps,
  fd: FormData
): Promise<DeleteAccountState> {
  const t = accountTranslator(deps.locale)
  const values = { email: str(fd, "email") }
  const parsed = DeleteAccountSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)), values }
  }
  try {
    await deps.api.delete(parsed.data)
  } catch (error) {
    const known = apiError(error, ["BAD_REQUEST", "FORBIDDEN"])
    if (known?.code === "BAD_REQUEST")
      return { ok: false, fieldErrors: { email: known.message }, values }
    if (
      known &&
      (known.data as { reason?: unknown } | undefined)?.reason === TWO_FACTOR_REAUTH_REASON
    )
      return { ok: false, message: known.message, reauthHref: deps.reauthHref, values }
    return {
      ok: false,
      message: failure(error, ["FORBIDDEN", "CONFLICT"], "account.delete", t),
      values,
    }
  }
  await deps.clearSession()
  return deps.redirect(`${deps.authUrl}/login?deleted=1`)
}

/**
 * The deletion banner's **Cancel deletion**: true when the api cancelled it. A refusal (an
 * impersonation session) or an outage is logged and leaves the banner up.
 */
export async function cancelDeletionCore(deps: Pick<PrivacyDeps, "api">): Promise<boolean> {
  try {
    await deps.api.cancelDeletion()
    return true
  } catch (error) {
    logger.error("cancelDeletion failed", { error })
    return false
  }
}
