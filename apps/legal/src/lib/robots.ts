import { robotsFor } from "@repo/sites"
import { isDraft } from "./draft"

type Env = Record<string, string | undefined>

/** The app's robots rules: everything disallowed while the pages are drafts, allowed after. */
export function legalRobots(env: Env = process.env) {
  return robotsFor("legal", isDraft(env) ? { disallow: ["/"] } : {}, env)
}
