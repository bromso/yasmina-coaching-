import { tagRoute } from "@/lib/pages"

const route = tagRoute("en")

export const dynamicParams = false
export const generateStaticParams = route.generateStaticParams
export const generateMetadata = route.generateMetadata
export default route.Page
