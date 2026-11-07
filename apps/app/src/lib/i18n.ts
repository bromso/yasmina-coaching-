import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"

/** A translator over the `app` namespace: `t("notes.empty")`, `t("notes.hereNow", { count })`. */
export type AppT = (key: string, values?: Record<string, string | number | Date>) => string

/**
 * The `app` namespace in `locale`, outside React — for the action cores, `api-errors.ts` and the
 * chat proxy, which take the request's locale and so stay plain functions under bun test. English
 * by default.
 */
export function appTranslator(locale: Locale = DEFAULT_LOCALE): AppT {
  return translatorFor(locale, "app")
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

/** Hidden inputs: only a stale or tampered page gets them wrong, so the fix is a reload. */
const HIDDEN_FIELDS = new Set(["workspaceId", "id"])

/**
 * A note or workspace form's Zod issue in the reader's language, for `fieldErrors(issues,
 * zodMessage(t))` or a single message: mapped by its code and field, never by its English message.
 * The field (`title`, `body`, `name`) is an ICU select in the message, so each language names it
 * its own way.
 */
export function zodMessage(t: AppT): (issue: ZodLikeIssue) => string {
  return (issue) => {
    const field = String(issue.path[0] ?? "")
    if (HIDDEN_FIELDS.has(field)) return t("validation.reload")
    if (issue.code === "too_small") return t("validation.required", { field })
    if (issue.code === "too_big") {
      return t("validation.tooLong", { field, max: Number(issue.maximum) })
    }
    // The workspace name's only format rule: no control characters.
    if (issue.code === "invalid_format" && issue.format === "regex") {
      return t("validation.invalidCharacter", { field })
    }
    return t("validation.invalid", { field })
  }
}
