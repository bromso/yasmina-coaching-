import { analyticsIdentity } from "@repo/session"
import { createAnalyticsRoute } from "@repo/telemetry/server"
import { getAuth } from "@/lib/auth"

// Browsers post their pageviews and client events here (same origin); this forwards them to
// apps/api with the service token. The app name is stamped here, never trusted from the body.
// Only when the visitor has consented to "all" does the route resolve who they are — never from
// the body either. `analyticsIdentity` also carries no ids while impersonating: an admin browsing
// as a user is the admin's activity, not the user's.
export const POST = createAnalyticsRoute({
  app: "auth",
  identity: async (req) => {
    const me = await getAuth().getMeFromRequest(req)
    const { workspace } = await getAuth().resolveWorkspaceFromRequest(req)
    return analyticsIdentity(me, workspace?.id ?? null)
  },
})
