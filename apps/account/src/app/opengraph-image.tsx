import { BRAND_NAME } from "@repo/sites"
import { OG_SIZE, ogImage } from "@repo/ui/lib/og"

export const size = OG_SIZE
export const contentType = "image/png"
export const alt = `${BRAND_NAME} — Account`

export default function Image() {
  return ogImage({ title: "Account", subtitle: "Profile, security and devices" })
}
