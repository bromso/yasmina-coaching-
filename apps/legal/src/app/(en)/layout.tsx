import type { ReactNode } from "react"
import { documentMetadata, documentViewport, LegalDocument } from "@/components/legal-document"

// The English root layout (`/en`); see `LegalDocument` for why each language has its own.
export const metadata = documentMetadata("en")
export const viewport = documentViewport

export default function EnglishLayout({ children }: { children: ReactNode }) {
  return <LegalDocument locale="en">{children}</LegalDocument>
}
