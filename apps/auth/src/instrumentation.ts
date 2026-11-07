import { assertAuthEnv } from "@repo/session/env"

export function register() {
  // Runs once at `next start`; `next build` never calls it. Fail here, not on the first request.
  if (process.env.NEXT_RUNTIME === "nodejs") assertAuthEnv()
}
