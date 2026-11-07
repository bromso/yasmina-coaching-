import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { messagesFor } from "@repo/i18n/messages"
import { translatorFor } from "@repo/i18n/translate"
import { OAUTH_ERROR_MESSAGES } from "@repo/ui/lib/oauth-errors"

/**
 * A translator over the `account` namespace: `t("security.title")`,
 * `t("connected.disconnected", { provider })`.
 */
export type AccountT = (key: string, values?: Record<string, string | number | Date>) => string

/**
 * The `account` namespace in `locale`, outside React — for the action cores, which take the
 * request's locale in their deps and so stay plain functions under bun test. English by default.
 */
export function accountTranslator(locale: Locale = DEFAULT_LOCALE): AccountT {
  return translatorFor(locale, "account")
}

/**
 * `t` narrowed to one group of keys: `scoped(t, "plans")("seats", { count })` reads
 * `plans.seats`. For the plain helpers (`lib/plans.ts`) that a client component calls with
 * next-intl's `useTranslations("account.plans")` and a server core with this.
 */
export function scoped(t: AccountT, prefix: string): AccountT {
  return (key, values) => t(`${prefix}.${key}`, values)
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
const VALIDATION = (messagesFor(DEFAULT_LOCALE, ["account"]).account as { validation: object })
  .validation
const PASSWORD_FIELDS = new Set(["password", "newPassword", "currentPassword", "confirm"])

/**
 * A settings form's Zod issue in the reader's language, for `fieldErrors(issues, zodMessage(t))`:
 * mapped by its code, field and (for a custom refine) `params.key`, never by its English message.
 * Per call, never through a global `z.config`, which would leak one request's language into
 * another's.
 */
export function zodMessage(t: AccountT): (issue: ZodLikeIssue) => string {
  return (issue) => {
    const field = String(issue.path[0] ?? "")
    const key = issue.params?.key
    if (issue.code === "custom") {
      return typeof key === "string" && Object.hasOwn(VALIDATION, key)
        ? t(`validation.${key}`)
        : t("validation.invalid")
    }
    // A two-step code is a TOTP code or a recovery code: any shape problem asks for one.
    if (field === "code") return t("validation.invalidCode")
    // The email schema trims and lowercases, then checks the format and length: any problem with
    // it is "not a valid address" to the reader. `newEmail` is `account.email.requestChange`'s own
    // field name for the same schema.
    if (field === "email" || field === "newEmail") return t("validation.invalidEmail")
    // A workspace name's only pattern refuses control characters.
    if (issue.code === "invalid_format" && field === "name") return t("validation.invalidCharacter")
    // A role, plan or interval outside its list.
    if (issue.code === "invalid_value") return t("validation.choose")
    if (issue.code === "too_small") {
      const min = Number(issue.minimum)
      if (min <= 1 || !PASSWORD_FIELDS.has(field)) return t("validation.required")
      return t("validation.passwordTooShort", { min })
    }
    if (issue.code === "too_big") return t("validation.tooLong", { max: Number(issue.maximum) })
    return t("validation.invalid")
  }
}

/** The provider codes whose message names the provider when its label is known. */
const NAMED = new Set(["unverified", "claimed", "provider"])

/**
 * `@repo/ui/lib/oauth-errors`'s `oauthErrorMessage`, in `t`'s language: the Security page's
 * message for a failed connect (`?error=<code>`), naming the provider by `label`. Unknown codes,
 * or none, show nothing. Mirrors apps/auth's, over the `account` namespace.
 */
export function oauthErrorMessageIn(
  t: AccountT,
  code: string | undefined,
  label: string | undefined
): string | undefined {
  if (!code || !Object.hasOwn(OAUTH_ERROR_MESSAGES, code)) return undefined
  if (!NAMED.has(code)) return t(`oauthErrors.${code}`)
  return label ? t(`oauthErrors.${code}`, { provider: label }) : t(`oauthErrors.${code}Unnamed`)
}
