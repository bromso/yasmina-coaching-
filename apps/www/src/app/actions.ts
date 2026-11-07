"use server"

import { LOCALE_COOKIE } from "@repo/i18n/cookie"
import { REQUEST_ID_HEADER } from "@repo/log"
import { requestInfo } from "@repo/session"
import type { FormState } from "@repo/ui/components/form-feedback"
import { cookies, headers } from "next/headers"
import { joinWaitlistCore, resolveWaitlistLocale } from "@/lib/actions"
import { anonymousApi } from "@/lib/api"

/** Reads the request only per POST, so the pages that render the form stay static. */
export async function joinWaitlist(_prev: FormState, fd: FormData): Promise<FormState> {
  const [h, store] = await Promise.all([headers(), cookies()])
  const { ip } = requestInfo(h)
  const locale = resolveWaitlistLocale({
    cookie: store.get(LOCALE_COOKIE)?.value,
    acceptLanguage: h.get("accept-language"),
  })
  const client = await anonymousApi(ip, locale, h.get(REQUEST_ID_HEADER))
  return joinWaitlistCore({ api: client.waitlist }, fd)
}
