import { robotsFor } from "@repo/sites"
import type { MetadataRoute } from "next"

// Every page needs a session; nothing to index.
export default function robots(): MetadataRoute.Robots {
  return robotsFor("account", { disallow: ["/"] })
}
