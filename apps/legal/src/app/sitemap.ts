import type { MetadataRoute } from "next"
import { legal } from "@/lib/legal"
import { legalSitemap } from "@/lib/sitemap"

export default function sitemap(): MetadataRoute.Sitemap {
  return legalSitemap(legal)
}
