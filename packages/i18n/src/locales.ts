// Zero dependencies, zero zod: this module must stay importable from @repo/api-contract and from
// browser bundles, so it never pulls in use-intl, React or Next.

export const LOCALES = ["en", "sv"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", sv: "Svenska" }

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

// Accept-Language can list arbitrarily many tags; parsing more than this is wasted work for a
// header nothing legitimate needs (RFC 9110 puts no hard cap on the field itself). Capping by
// character count would risk slicing the last tag in half; splitting first and capping the
// number of parts never does.
const MAX_TAGS = 50

// en / en-US / sv-SE / x-whatever — a primary tag plus 0+ subtags, each 1-8 alphanumerics.
const LANGUAGE_TAG = /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/

type WeightedTag = { code: string; q: number }

/** Accept-Language's tags in quality order (highest first), dropping anything malformed — a bad
 * tag shape, a q outside [0, 1], or a q that doesn't parse as a number — and every `q=0` tag,
 * which RFC 9110 defines as "not acceptable". */
function parseAcceptLanguage(header: string): WeightedTag[] {
  const tags: WeightedTag[] = []
  for (const rawPart of header.split(",").slice(0, MAX_TAGS)) {
    const [rawCode, ...params] = rawPart.split(";").map((piece) => piece.trim())
    if (!rawCode || !LANGUAGE_TAG.test(rawCode)) continue

    let q = 1
    const qParam = params.find((param) => param.startsWith("q="))
    if (qParam) {
      const value = Number(qParam.slice(2))
      if (!Number.isFinite(value) || value < 0 || value > 1) continue
      if (value === 0) continue // q=0: "not acceptable", never a match
      q = value
    }
    tags.push({ code: rawCode.toLowerCase(), q })
  }
  // Array#sort is a stable sort, so equal-quality tags keep the order the header gave them.
  return tags.sort((a, b) => b.q - a.q)
}

/** The best supported locale a browser's `Accept-Language` names, or null when it names none:
 * honours quality weights and tries each tag's exact code first, then its language subtag
 * (`sv-SE` -> `sv`). */
function matchAcceptLanguage(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null
  for (const { code } of parseAcceptLanguage(acceptLanguage)) {
    if (isLocale(code)) return code
    const subtag = code.split("-")[0]
    if (isLocale(subtag)) return subtag
  }
  return null
}

/** The best supported locale for a browser's `Accept-Language` header: honours quality weights,
 * tries each tag's exact code first and then its language subtag (`sv-SE` -> `sv`), and falls
 * back to `en` for anything unsupported, missing or malformed. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  return matchAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE
}

/** Where a resolved locale came from; `default` means nothing named a supported locale. */
export type LocaleSource = "saved" | "cookie" | "header" | "default"

type LocaleSignals = {
  saved?: string | null
  cookie?: string | null
  acceptLanguage?: string | null
}

/** `resolveLocale`, plus which signal decided it — so a caller can tell a real choice (any
 * source but `default`) from the English fallback. */
export function resolveLocaleWithSource(input: LocaleSignals): {
  locale: Locale
  source: LocaleSource
} {
  if (isLocale(input.saved)) return { locale: input.saved, source: "saved" }
  if (isLocale(input.cookie)) return { locale: input.cookie, source: "cookie" }
  const header = matchAcceptLanguage(input.acceptLanguage)
  if (header) return { locale: header, source: "header" }
  return { locale: DEFAULT_LOCALE, source: "default" }
}

/** Resolution order: a signed-in user's saved preference, else the `locale` cookie, else the
 * negotiated `Accept-Language`, else `en`. An invalid saved value or cookie is ignored outright,
 * not treated as a hard stop. */
export function resolveLocale(input: LocaleSignals): Locale {
  return resolveLocaleWithSource(input).locale
}
