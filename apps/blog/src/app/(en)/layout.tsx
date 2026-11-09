import type { ReactNode } from "react"
import { BlogDocument, documentMetadata, documentViewport } from "@/components/blog-document"

// The English root layout (`/en`); see `BlogDocument` for why each language has its own.
export const metadata = documentMetadata("en")
export const viewport = documentViewport

export default function EnglishLayout({ children }: { children: ReactNode }) {
  return <BlogDocument locale="en">{children}</BlogDocument>
}
