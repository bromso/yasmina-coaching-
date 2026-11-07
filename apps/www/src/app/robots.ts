import { robotsFor } from "@repo/sites"
import type { MetadataRoute } from "next"

// The token manage pages and the post-booking page are personal, never indexed.
export default function robots(): MetadataRoute.Robots {
  return robotsFor("www", { disallow: ["/book/manage/", "/book/done"] })
}
