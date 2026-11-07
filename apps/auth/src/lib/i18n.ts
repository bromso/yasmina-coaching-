import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { messagesFor } from "@repo/i18n/messages"
import { translatorFor } from "@repo/i18n/translate"
import { OAUTH_ERROR_MESSAGES } from "@repo/ui/lib/oauth-errors"

/**
 * A translator over the `auth` namespace: `t("login.title")`, `t("social.login", { provider })`.
 */
export type AuthT = (key: string, values?: Record<string, string | number | Date>) => string

/**
 * The `auth` namespace in `locale`, outside React — for the action cores, which take the
 * request's locale in their deps and so stay plain functions under bun test. English by default.
 */
export function authTranslator(locale: Locale = DEFAULT_LOCALE): AuthT {
  return translatorFor(locale, "auth")
}

/** The parts of a Zod issue this reads; every Zod issue fits it. */
export type ZodLikeIssue = {
  code: string
  path: PropertyKey[]
  message: string
  format?: string
  minimum?: number | bigint
  maximum?: number | bigint
  params?: Record<string, unknown>
}

// The keys a custom refine may name through `params: { key }` (English is the source of truth).
const VALIDATION = (messagesFor(DEFAULT_LOCALE, ["auth"]).auth as { validation: object }).validation
const PASSWORD_FIELDS = new Set(["password", "newPassword", "currentPassword", "confirm"])

/**
 * A Zod issue in the reader's language, for `fieldErrors(issues, zodMessage(t))`: mapped by its
 * code (and, for a custom refine, its `params.key`), never by its English message. Per call, never
 * through a global `z.config`, which would leak one request's language into another's.
 */
export function zodMessage(t: AuthT): (issue: ZodLikeIssue) => string {
  return (issue) => {
    const field = String(issue.path[0] ?? "")
    const key = issue.params?.key
    if (issue.code === "custom") {
      return typeof key === "string" && Object.hasOwn(VALIDATION, key)
        ? t(`validation.${key}`)
        : t("validation.invalid")
    }
    if (issue.code === "invalid_format" && issue.format === "email") {
      return t("validation.invalidEmail")
    }
    // The email schema trims and lowercases, then checks the format and length: any other length
    // issue on it is still "not a valid address" to the reader.
    if (field === "email" && (issue.code === "too_big" || issue.code === "too_small")) {
      return t("validation.invalidEmail")
    }
    const password = PASSWORD_FIELDS.has(field)
    if (issue.code === "too_small") {
      const min = Number(issue.minimum)
      if (min <= 1) return t("validation.required")
      return t(password ? "validation.passwordTooShort" : "validation.tooShort", { min })
    }
    if (issue.code === "too_big") {
      const max = Number(issue.maximum)
      return t(password ? "validation.passwordTooLong" : "validation.tooLong", { max })
    }
    return t("validation.invalid")
  }
}

/** The provider codes whose message names the provider when its label is known. */
const NAMED = new Set(["unverified", "claimed", "provider"])

/**
 * `@repo/ui/lib/oauth-errors`'s `oauthErrorMessage`, in `t`'s language: the message for
 * `?error=<code>`, naming the provider by `label`. Unknown codes, or none, show nothing.
 */
export function oauthErrorMessageIn(
  t: AuthT,
  code: string | undefined,
  label: string | undefined
): string | undefined {
  if (!code || !Object.hasOwn(OAUTH_ERROR_MESSAGES, code)) return undefined
  if (!NAMED.has(code)) return t(`oauthErrors.${code}`)
  return label ? t(`oauthErrors.${code}`, { provider: label }) : t(`oauthErrors.${code}Unnamed`)
}
