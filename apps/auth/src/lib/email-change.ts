import { ORPCError } from "@orpc/client"
import type { ApiClient } from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { createLogger } from "@repo/log"
import type { FormState } from "@repo/ui/components/form-feedback"
import { authTranslator } from "./i18n"
import { isPlausibleToken } from "./verify-email"

const logger = createLogger({ service: "auth" })

/**
 * `/email/cancel` and `/email/revert`'s one call each: the two links mailed to an account's OLD
 * address when someone changes it, anonymous — whoever holds that mailbox, signed in or not.
 */
export type EmailChangeApi = Pick<ApiClient["auth"]["emailChange"], "cancel" | "revert">

export type EmailChangeDeps = {
  api: EmailChangeApi
  /**
   * Clears this browser's own `session` cookie once the api has ended every session server-side
   * (both actions do), so a tab left open on another page does not keep showing a now-dead
   * session in the header. Best-effort: a failure here is logged, never a reason to show a
   * failure — the api-side work already happened.
   */
  clearSession(): Promise<void>
  /** The request's language, for this app's own sentences. English by default; the api's own
   * messages already arrive in it, since the client sends `x-locale` from a real signal. */
  locale?: Locale
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}

/** A declared api error with one of the given codes, else undefined (anything else is "unavailable"). */
function apiError(error: unknown, codes: string[]) {
  return error instanceof ORPCError && error.defined && codes.includes(error.code)
    ? error
    : undefined
}

async function clearSession(deps: EmailChangeDeps) {
  await deps.clearSession().catch((error) => {
    logger.error("clearSession failed", { error })
  })
}

export type EmailCancelState = FormState

/**
 * `/email/cancel`'s one action: the token from the link's query string, never sent until the
 * button is pressed. An implausible token is never worth a round trip — the same message either
 * way, as `consumeMagicLinkCore`'s shortcut is. Success voids the pending change and ends every
 * session api-side; this browser's own cookie is cleared too.
 */
export async function cancelEmailChangeCore(
  deps: EmailChangeDeps,
  fd: FormData
): Promise<EmailCancelState> {
  const t = authTranslator(deps.locale)
  const token = str(fd, "token")
  if (!isPlausibleToken(token)) return { ok: false, message: t("emailCancel.invalid") }
  try {
    await deps.api.cancel({ token })
  } catch (error) {
    const bad = apiError(error, ["BAD_REQUEST"])
    if (bad) return { ok: false, message: t("emailCancel.invalid") }
    logger.error("emailChange cancel failed", { error })
    return { ok: false, message: t("common.unavailable") }
  }
  await clearSession(deps)
  return { ok: true, message: t("emailCancel.success") }
}

export type EmailRevertState =
  | { ok: true; passwordReset: boolean }
  | { ok: false; message?: string }

/**
 * `/email/revert`'s one action: mirrors `cancelEmailChangeCore`. The api's answer carries whether
 * a password-reset link also went to the restored address (`passwordReset`), which the success
 * panel needs to decide whether to mention it. The address the undo would restore being taken by
 * another account meanwhile is `CONFLICT`, shown in the api's own words (already in the caller's
 * language, and there is nothing useful to say about it before the round trip happens — unlike
 * the link-invalid case, which the implausible-token shortcut can pre-empt).
 */
export async function revertEmailChangeCore(
  deps: EmailChangeDeps,
  fd: FormData
): Promise<EmailRevertState> {
  const t = authTranslator(deps.locale)
  const token = str(fd, "token")
  if (!isPlausibleToken(token)) return { ok: false, message: t("emailRevert.invalid") }
  let result: { passwordReset: boolean }
  try {
    result = await deps.api.revert({ token })
  } catch (error) {
    const conflict = apiError(error, ["CONFLICT"])
    if (conflict) return { ok: false, message: conflict.message }
    const bad = apiError(error, ["BAD_REQUEST"])
    if (bad) return { ok: false, message: t("emailRevert.invalid") }
    logger.error("emailChange revert failed", { error })
    return { ok: false, message: t("common.unavailable") }
  }
  await clearSession(deps)
  return { ok: true, passwordReset: result.passwordReset }
}
