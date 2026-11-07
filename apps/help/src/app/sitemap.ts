import type { MetadataRoute } from "next"
import { help } from "@/lib/help"
import { helpSitemap } from "@/lib/sitemap"

export default function sitemap(): MetadataRoute.Sitemap {
  return helpSitemap(help.categories, help.articles)
}
