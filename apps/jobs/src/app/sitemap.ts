import type { MetadataRoute } from "next"
import { openJobs } from "@/lib/jobs"
import { jobsSitemap } from "@/lib/sitemap"

export default function sitemap(): MetadataRoute.Sitemap {
  return jobsSitemap(openJobs())
}
