import { readSessionCookie } from "@repo/session/cookie"
import { createUserEventsRoute } from "@repo/session/events"
import { getAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const GET = createUserEventsRoute({
  getUser: (req) => getAuth().getUserFromRequest(req),
  readSessionToken: (req) => readSessionCookie(req.headers.get("cookie")),
})
