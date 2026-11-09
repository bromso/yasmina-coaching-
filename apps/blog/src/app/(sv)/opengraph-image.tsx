import { indexImage } from "@/lib/pages"

const image = indexImage("sv")

export const dynamic = "force-static"
export const size = image.size
export const contentType = image.contentType
export const alt = image.alt
export default image.Image
