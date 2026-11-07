import { sitemapFor } from "@repo/sites"
import type { MetadataRoute } from "next"
import { PUBLIC_ROUTES } from "@/lib/routes"

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapFor("auth", PUBLIC_ROUTES)
}
