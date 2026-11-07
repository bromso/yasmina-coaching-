import { ALL_LOCALE_MESSAGES, deepMerge, type Messages, type Namespace } from "./catalog"
import type { Locale } from "./locales"

export type { Messages, Namespace }

/** English merged under `locale` for each namespace, so a key the locale hasn't translated yet
 * still renders — in English — rather than showing a raw key. */
export function messagesFor(
  locale: Locale,
  namespaces: readonly Namespace[]
): Record<string, unknown> {
  const english = ALL_LOCALE_MESSAGES.en
  const catalog = ALL_LOCALE_MESSAGES[locale]
  const result: Record<string, unknown> = {}
  for (const namespace of namespaces) {
    result[namespace] = deepMerge(english[namespace], catalog[namespace])
  }
  return result
}
