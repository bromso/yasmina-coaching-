"use server"

import { REQUEST_ID_HEADER } from "@repo/log"
import { requestInfo } from "@repo/session"
import { unsubscribeClientId } from "@repo/session/client"
import { headers } from "next/headers"
import { getAuth } from "@/lib/auth"
import { type UnsubscribeState, unsubscribeCore } from "@/lib/unsubscribe"
import { unsubscribeApi } from "@/lib/unsubscribe-api"

/**
 * `/email/unsubscribe`'s one action (**Turn off these emails**): anonymous — whoever holds the
 * mailbox the link went to, signed in on this browser or not; the token alone names the user.
 */
export async function turnOffEmails(
  _prev: UnsubscribeState,
  fd: FormData
): Promise<UnsubscribeState> {
  const h = await headers()
  const { ip } = requestInfo(h)
  const locale = await getAuth().getLocale()
  // A person in a browser: keyed per ip, like every other anonymous form here.
  const getApi = async () =>
    unsubscribeApi({
      clientId: await unsubscribeClientId(ip),
      locale,
      requestId: h.get(REQUEST_ID_HEADER),
    })
  return unsubscribeCore({ getApi, locale }, fd)
}
