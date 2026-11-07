"use server"

import { LOCALE_COOKIE } from "@repo/i18n/cookie"
import { REQUEST_ID_HEADER } from "@repo/log"
import { requestInfo } from "@repo/session"
import { SESSION_COOKIE } from "@repo/session/cookie"
import { cookies, headers } from "next/headers"
import { anonymousApiFor } from "@/lib/api"
import { type ContactFormState, resolveContactLocale, submitContactCore } from "@/lib/contact"

export type { ContactFormState }

/**
 * Reads the request only per POST, so `/contact` stays static. The shared `session` cookie is
 * read here and nowhere else (never in the page): when present it is forwarded to `support.create`
 * as `x-session-token` so a live, non-impersonation session can link the request, but the
 * rate-limit client id stays `anon:<ip hash>` (see `@/lib/api`'s `contactHeaders`).
 */
export async function submitContact(
  _prev: ContactFormState,
  fd: FormData
): Promise<ContactFormState> {
  const [h, store] = await Promise.all([headers(), cookies()])
  const { ip } = requestInfo(h)
  const locale = resolveContactLocale({
    cookie: store.get(LOCALE_COOKIE)?.value,
    acceptLanguage: h.get("accept-language"),
  })
  const sessionToken = store.get(SESSION_COOKIE)?.value ?? null
  const api = anonymousApiFor(h.get(REQUEST_ID_HEADER))
  return submitContactCore({ api, ip, sessionToken, locale }, fd)
}
