import { tagRoute } from "@/lib/pages"

const route = tagRoute("sv")

export const dynamicParams = false
export const generateStaticParams = route.generateStaticParams
export const generateMetadata = route.generateMetadata
export default route.Page
