"use server"

import { LOCALE_COOKIE } from "@repo/i18n/cookie"
import { REQUEST_ID_HEADER } from "@repo/log"
import { requestInfo } from "@repo/session"
import { cookies, headers } from "next/headers"
import { anonymousApiFor } from "@/lib/api"
import { type ApplyFormState, resolveApplyLocale, submitApplicationCore } from "@/lib/apply"
import { openJobs } from "@/lib/jobs"

export type { ApplyFormState }

/**
 * Reads the request only per POST, so `/<slug>/apply` stays static. `openJobs()` is read fresh
 * each call rather than captured at module scope — it is cheap (an in-memory list built once at
 * `next build`) and keeps this action from depending on when the module first loads.
 */
export async function submitApplication(
  _prev: ApplyFormState,
  fd: FormData
): Promise<ApplyFormState> {
  const [h, store] = await Promise.all([headers(), cookies()])
  const { ip } = requestInfo(h)
  const locale = resolveApplyLocale({
    cookie: store.get(LOCALE_COOKIE)?.value,
    acceptLanguage: h.get("accept-language"),
  })
  const api = anonymousApiFor(h.get(REQUEST_ID_HEADER))
  return submitApplicationCore({ api, ip, locale, openJobs: openJobs() }, fd)
}
