import { assertEnv } from "@repo/session/env"

export function register() {
  // Runs once at `next start`; `next build` never calls it. Fail here, not on the first contact
  // form submission — the /contact server action needs API_URL / API_SERVICE_TOKEN to reach
  // support.create, same as www's waitlist action.
  if (process.env.NEXT_RUNTIME === "nodejs") assertEnv(["API_URL", "API_SERVICE_TOKEN"])
}
