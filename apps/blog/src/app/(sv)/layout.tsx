import type { ReactNode } from "react"
import { BlogDocument, documentMetadata, documentViewport } from "@/components/blog-document"

// The Swedish root layout (`/`); see `BlogDocument` for why each language has its own.
export const metadata = documentMetadata("sv")
export const viewport = documentViewport

export default function SwedishLayout({ children }: { children: ReactNode }) {
  return <BlogDocument locale="sv">{children}</BlogDocument>
}
