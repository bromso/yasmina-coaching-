import { postImage } from "@/lib/pages"

const image = postImage("en")

export const dynamicParams = false
export const size = image.size
export const contentType = image.contentType
export const alt = image.alt
export const generateStaticParams = image.generateStaticParams
export default image.Image
