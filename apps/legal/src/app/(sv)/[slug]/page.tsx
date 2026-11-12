import { pageRoute } from "@/lib/pages"

const route = pageRoute("sv")

export const dynamicParams = false
export const generateStaticParams = route.generateStaticParams
export const generateMetadata = route.generateMetadata
export default route.Page
