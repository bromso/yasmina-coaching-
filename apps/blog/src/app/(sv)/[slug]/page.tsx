import { postRoute } from "@/lib/pages"

const route = postRoute("sv")

export const dynamicParams = false
export const generateStaticParams = route.generateStaticParams
export const generateMetadata = route.generateMetadata
export default route.Page
