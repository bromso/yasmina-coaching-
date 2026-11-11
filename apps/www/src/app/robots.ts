import { robotsFor } from "@repo/sites"
import type { MetadataRoute } from "next"

// The token manage pages, the post-booking page and the contact form's thank-you page are
// personal, never indexed.
export default function robots(): MetadataRoute.Robots {
  return robotsFor("www", { disallow: ["/book/manage/", "/book/done", "/kontakt/tack"] })
}
