import { robotsFor } from "@repo/sites"
import type { MetadataRoute } from "next"
import { isDraft } from "./draft"

type Env = Record<string, string | undefined>

/**
 * The app's robots rules: everything disallowed while the pages are drafts, with no `Sitemap:`
 * line pointing crawlers at pages they may not fetch; allowed, with the sitemap, after.
 */
export function legalRobots(env: Env = process.env): MetadataRoute.Robots {
  if (!isDraft(env)) return robotsFor("legal", {}, env)
  const { sitemap: _sitemap, ...rules } = robotsFor("legal", { disallow: ["/"] }, env)
  return rules
}
