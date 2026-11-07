import { BRAND_NAME } from "@repo/sites"
import { OG_SIZE, ogImage } from "@repo/ui/lib/og"

export const dynamic = "force-static"
export const size = OG_SIZE
export const contentType = "image/png"
export const alt = `${BRAND_NAME} — Docs`

export default function Image() {
  return ogImage({ title: "Docs", subtitle: "Guides and reference for the monorepo" })
}
