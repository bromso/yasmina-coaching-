// The api's user-facing messages, in the caller's language. The Next apps forward the locale they
// resolved as `x-locale`; server.ts turns it into `Context.locale` here. Logs, audit rows,
// telemetry and the superadmin-only errors stay English.
import type { Feature, Role } from "@repo/api-contract"
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale, negotiateLocale } from "@repo/i18n/locales"
import type { Messages } from "@repo/i18n/messages"
import { translatorFor } from "@repo/i18n/translate"

/** Every flat message key in the `api` namespace (`roles.*` are names, not messages). */
export type ApiMessageKey = Exclude<keyof Messages["api"], "roles">
type Values = Record<string, string | number | Date>

// One translator per locale for the life of the process, never one per request.
const translators = Object.fromEntries(
  LOCALES.map((locale) => [locale, translatorFor(locale, "api")])
) as Record<Locale, ReturnType<typeof translatorFor>>

/** `key` in the context's locale; English when a translation is missing. Never throws. */
export function apiMessage(
  context: { locale: Locale },
  key: ApiMessageKey,
  values?: Values
): string {
  return translators[context.locale](key, values)
}

/** "Requires the admin role", with the role's own name translated too. */
export function requiresRoleMessage(context: { locale: Locale }, role: Role): string {
  const t = translators[context.locale]
  return t("requiresRole", { role: t(`roles.${role}`) })
}

/** The refusal each gated feature answers with; the type demands an entry per `FEATURES` value. */
export const FEATURE_MESSAGE_KEYS: Record<Feature, ApiMessageKey> = {
  chat: "upgradeChat",
  api: "upgradeApi",
}

/** Longest tag worth reading (BCP 47's practical maximum); anything longer is cut first. */
const MAX_LOCALE_HEADER_LENGTH = 35

/**
 * Whether a header names English as acceptable: some tag whose language is `en`, skipping one
 * weighted `q=0` ("not acceptable", RFC 9110) or with a q that is not a number in [0, 1] — the
 * same tags `negotiateLocale` drops.
 */
export const namesEnglish = (header: string): boolean =>
  header.split(",").some((part) => {
    const [code, ...params] = part.split(";").map((piece) => piece.trim())
    if ((code ?? "").toLowerCase().split("-")[0] !== "en") return false
    const qParam = params.find((param) => param.startsWith("q="))
    if (!qParam) return true
    const q = Number(qParam.slice(2))
    return Number.isFinite(q) && q > 0 && q <= 1
  })

/**
 * The `x-locale` header as `locale` (what to answer in: a supported locale as given, else the
 * negotiated one, `en-US` → `en`, else English) and `requestedLocale` (the supported locale the caller
 * actually named, or null — what account creation stores; null leaves the user's choice unset).
 */
export function localeFromHeader(header: string | null | undefined): {
  locale: Locale
  requestedLocale: Locale | null
} {
  const value = header?.trim().slice(0, MAX_LOCALE_HEADER_LENGTH) ?? ""
  if (isLocale(value)) return { locale: value, requestedLocale: value }
  const locale = negotiateLocale(value)
  // negotiateLocale answers English for anything unsupported too: only a named `en` counts.
  const named = locale !== DEFAULT_LOCALE || (value !== "" && namesEnglish(value))
  return { locale, requestedLocale: named ? locale : null }
}
