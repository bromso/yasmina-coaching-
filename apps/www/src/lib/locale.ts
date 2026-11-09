import { LOCALE_COOKIE } from "@repo/i18n/cookie"
import { cookies } from "next/headers"
import { cache } from "react"
import { type Locale, localeFromCookie } from "@/lib/site-locale"

/**
 * Server only (it reads the request's cookies): the language this request renders in, `en` when
 * the shared `locale` cookie says so, else Swedish. The layout, the pages and the server actions
 * all call it; `cache` makes it one cookie read per request. Reading cookies makes every www page
 * dynamic (ƒ), which is the price of switching the page itself.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies()
  return localeFromCookie(store.get(LOCALE_COOKIE)?.value)
})
