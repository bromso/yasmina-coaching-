import { createAnalyticsRoute } from "@repo/telemetry/server"

// Browsers post their pageviews and client events here (same origin); this forwards them to
// apps/api with the service token. The app name is stamped here, never trusted from the body.
export const POST = createAnalyticsRoute({ app: "jobs" })
