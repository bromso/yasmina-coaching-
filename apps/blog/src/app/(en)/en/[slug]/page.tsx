import { postRoute } from "@/lib/pages"

const route = postRoute("en")

export const dynamicParams = false
export const generateStaticParams = route.generateStaticParams
export const generateMetadata = route.generateMetadata
export default route.Page
