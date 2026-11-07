import { createTelemetryRoute } from "@repo/telemetry/server"

// Browsers post their errors and web vitals here (same origin); this forwards them to apps/api
// with the service token. The app name is stamped here, never trusted from the body.
export const POST = createTelemetryRoute({ app: "blog" })
