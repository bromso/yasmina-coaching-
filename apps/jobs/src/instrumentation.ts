import { assertEnv } from "@repo/session/env"

export function register() {
  // Runs once at `next start`; `next build` never calls it. Fail here, not on the first apply
  // submission — the /<slug>/apply server action needs API_URL / API_SERVICE_TOKEN to reach
  // jobs.apply, same as apps/help's contact action and apps/www's waitlist action.
  if (process.env.NEXT_RUNTIME === "nodejs") assertEnv(["API_URL", "API_SERVICE_TOKEN"])
}
