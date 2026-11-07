// Internal: the raw, unmerged message catalogs and the merge primitive `messagesFor` (./messages)
// and `translatorFor` (./translate) build on. Not part of the public API — @repo/i18n has no
// "./catalog" entry in package.json's "exports", so only this package's own modules and tests
// reach it, by relative path. Statically imported (never read from disk) so every catalog bundles
// into Next's client and server output alike.
import enAccount from "../messages/en/account.json"
import enApi from "../messages/en/api.json"
import enApp from "../messages/en/app.json"
import enAuth from "../messages/en/auth.json"
import enCommon from "../messages/en/common.json"
import enEmail from "../messages/en/email.json"
import enUi from "../messages/en/ui.json"
import svAccount from "../messages/sv/account.json"
import svApi from "../messages/sv/api.json"
import svApp from "../messages/sv/app.json"
import svAuth from "../messages/sv/auth.json"
import svCommon from "../messages/sv/common.json"
import svEmail from "../messages/sv/email.json"
import svUi from "../messages/sv/ui.json"
import type { Locale } from "./locales"

const EN = {
  common: enCommon,
  ui: enUi,
  auth: enAuth,
  app: enApp,
  account: enAccount,
  email: enEmail,
  api: enApi,
}
const SV = {
  common: svCommon,
  ui: svUi,
  auth: svAuth,
  app: svApp,
  account: svAccount,
  email: svEmail,
  api: svApi,
}

/** English is the source of truth: every other locale's shape is derived from it. */
export type Namespace = keyof typeof EN
export type Messages = { [N in Namespace]: (typeof EN)[N] }

/** Every locale's own, unmerged catalog — what the catalogs actually ship, as opposed to
 * `messagesFor`'s result (which always equals English's key set by construction, since that is
 * the fallback). Tests read this directly to catch a real translation gap. */
export const ALL_LOCALE_MESSAGES: Record<Locale, Messages> = { en: EN, sv: SV }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** English, with anything the override actually has layered on top — recursively, so a missing
 * key at any depth falls back to English rather than disappearing. */
export function deepMerge(base: unknown, override: unknown): unknown {
  if (isPlainObject(base) && isPlainObject(override)) {
    const merged: Record<string, unknown> = { ...base }
    for (const key of Object.keys(override)) {
      merged[key] = key in base ? deepMerge(base[key], override[key]) : override[key]
    }
    return merged
  }
  return override === undefined ? base : override
}
