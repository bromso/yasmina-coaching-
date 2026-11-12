import { robotsFor } from "@repo/sites"
import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return robotsFor("legal")
}
