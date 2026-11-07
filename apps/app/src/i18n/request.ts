import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { messagesFor } from "@repo/i18n/messages"
import { createLogger } from "@repo/log"
import { unstable_rethrow } from "next/navigation"
import { connection } from "next/server"
import { IntlErrorCode } from "next-intl"
import { getRequestConfig } from "next-intl/server"
import { getAuth } from "@/lib/auth"

const logger = createLogger({ service: "app" })

/** The namespaces this app's server components read; the client gets only `app`. */
const NAMESPACES = ["common", "ui", "app"] as const

const ENGLISH = messagesFor(DEFAULT_LOCALE, NAMESPACES)

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (typeof acc !== "object" || acc === null) return undefined
    return (acc as Record<string, unknown>)[key]
  }, value)
}

/**
 * The request's language and messages. No routing and no middleware: the locale comes from
 * `getLocale()` (the saved choice, the `locale` cookie, `Accept-Language`, English), and must never
 * be undefined — next-intl answers 404 for a request config without one.
 */
export default getRequestConfig(async () => {
  // The locale is per request (cookie, saved choice, Accept-Language): never resolved while a
  // build prerenders, which has no request (and, without env, no api to ask).
  await connection()
  let locale: Locale = DEFAULT_LOCALE
  try {
    locale = (await getAuth().getLocale()) ?? DEFAULT_LOCALE
  } catch (error) {
    // Next's own control flow (a dynamic bailout, a redirect) is not a failure: let it through.
    unstable_rethrow(error)
    // getLocale never throws, but getAuth can (production without its env): English, not a 500.
    logger.error("locale resolution failed", { error })
  }
  return {
    locale,
    // English is merged under the locale's own messages, so a gap there already reads in English.
    messages: messagesFor(locale, NAMESPACES),
    timeZone: "UTC",
    onError(error) {
      // A key missing even from English, or a malformed message: log it, never throw at a reader.
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        logger.warn("i18n missing message", { detail: error.message })
      } else logger.error("i18n message error", { error })
    },
    getMessageFallback({ namespace, key }) {
      const path = namespace ? `${namespace}.${key}` : key
      const english = readPath(ENGLISH, path)
      return typeof english === "string" ? english : path
    },
  }
})
