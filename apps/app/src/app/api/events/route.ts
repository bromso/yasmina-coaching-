import { readSessionCookie } from "@repo/session/cookie"
import { createEventsRoute } from "@repo/session/events"
import { getAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const GET = createEventsRoute({
  getUser: (req) => getAuth().getUserFromRequest(req),
  getWorkspace: (req) => getAuth().resolveWorkspaceFromRequest(req),
  readSessionToken: (req) => readSessionCookie(req.headers.get("cookie")),
})
