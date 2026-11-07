import type { MetadataRoute } from "next"
import { docs } from "@/lib/docs"
import { docsSitemap } from "@/lib/sitemap"

export default function sitemap(): MetadataRoute.Sitemap {
  return docsSitemap(
    docs.pages.map((page) => ({ url: page.url, updated: page.frontmatter.updated }))
  )
}
