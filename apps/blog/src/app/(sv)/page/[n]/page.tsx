import { listPageRoute } from "@/lib/pages"

const route = listPageRoute("sv")

// Page 1 is the index; only 2..pages exist here.
export const dynamicParams = false
export const generateStaticParams = route.generateStaticParams
export const generateMetadata = route.generateMetadata
export default route.Page
