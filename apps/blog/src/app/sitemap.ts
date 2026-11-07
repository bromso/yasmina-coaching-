import type { MetadataRoute } from "next"
import { blog } from "@/lib/blog"
import { blogSitemap } from "@/lib/sitemap"

export default function sitemap(): MetadataRoute.Sitemap {
  return blogSitemap(blog)
}
