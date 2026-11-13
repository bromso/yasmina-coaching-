import { robotsFor } from "@repo/sites"
import type { MetadataRoute } from "next"
import { LEGACY_LEGAL_PATHS } from "@/lib/legal-redirect"

// The token manage pages, the post-booking page and the contact form's thank-you page are
// personal, never indexed; the old legal paths only redirect to the legal app.
export default function robots(): MetadataRoute.Robots {
  return robotsFor("www", {
    disallow: [
      "/book/manage/",
      "/book/done",
      "/kontakt/tack",
      LEGACY_LEGAL_PATHS.privacy,
      LEGACY_LEGAL_PATHS.terms,
    ],
  })
}
