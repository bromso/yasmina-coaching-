import { BRAND_NAME } from "@repo/sites"
import { OG_SIZE, ogImage } from "@repo/ui/lib/og"
import { BLOG_DESCRIPTION } from "@/lib/blog-core"

export const dynamic = "force-static"
export const size = OG_SIZE
export const contentType = "image/png"
export const alt = `${BRAND_NAME} — Blog`

export default function Image() {
  return ogImage({ title: "Blog", subtitle: BLOG_DESCRIPTION })
}
