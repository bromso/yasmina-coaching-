import { BRAND_NAME } from "@repo/sites"
import { OG_SIZE, ogImage } from "@repo/ui/lib/og"

export const size = OG_SIZE
export const contentType = "image/png"
export const alt = `${BRAND_NAME} — Sign in`

export default function Image() {
  return ogImage({ title: "Sign in", subtitle: "Sign in or create an account" })
}
