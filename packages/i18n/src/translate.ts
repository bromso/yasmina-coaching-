// For apps/api and @repo/email: a translator with no React and no Next request context, used
// wherever a locale is known up front rather than read from the current request.
import { createTranslator } from "use-intl/core"
import { ALL_LOCALE_MESSAGES, deepMerge, type Namespace } from "./catalog"
import { DEFAULT_LOCALE, type Locale } from "./locales"

type Values = Record<string, string | number | Date>

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (typeof acc !== "object" || acc === null) return undefined
    return (acc as Record<string, unknown>)[key]
  }, value)
}

/** The mechanism behind `translatorFor`, parameterised over the catalogs it reads — exposed only
 * so this package's own tests can exercise a deliberate gap (a key present in English but missing
 * from another locale, or a malformed locale message) by injecting fixture catalogs, without
 * editing the real, shipped ones. `translatorFor` is just this, closed over the real catalogs.
 *
 * Never throws: English is merged in under `locale` before `createTranslator` ever sees the
 * messages, so a key missing from the locale's own catalog resolves to English without reaching
 * the fallback below. The fallback only fires for a key missing from English too — it returns the
 * raw key, so a test can catch it — or for an ICU error while formatting an otherwise-present
 * message (a malformed translation, say), where it returns the unformatted English string rather
 * than a bare key path. */
export function createTranslatorFrom(
  locale: Locale,
  namespace: string,
  catalogs: Record<Locale, Record<string, unknown>>
): (key: string, values?: Values) => string {
  const english = catalogs[DEFAULT_LOCALE][namespace]
  const own = catalogs[locale][namespace]
  const messages = { [namespace]: deepMerge(english, own) }
  const englishMessages = { [namespace]: english }

  const translator = createTranslator({
    locale,
    messages,
    namespace,
    getMessageFallback: ({ key }) => {
      const fallback = readPath(englishMessages[namespace], key)
      return typeof fallback === "string" ? fallback : key
    },
    onError: () => {
      // Swallowed on purpose: getMessageFallback above always supplies usable text.
    },
  })

  // use-intl types `t`'s key as a literal union of the namespace's own nested keys; the public
  // signature here takes a plain `string` on purpose (translatorFor is used dynamically, with
  // keys that only exist at runtime), so the narrower type is intentionally widened.
  return translator as unknown as (key: string, values?: Values) => string
}

/** A translator over one namespace, in one locale, backed by the real shipped catalogs. See
 * `createTranslatorFrom` for the mechanism and its guarantees. */
export function translatorFor<N extends Namespace>(
  locale: Locale,
  namespace: N
): (key: string, values?: Values) => string {
  return createTranslatorFrom(locale, namespace, ALL_LOCALE_MESSAGES)
}
