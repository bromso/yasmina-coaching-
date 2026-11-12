import type { ReactNode } from "react"
import { documentMetadata, documentViewport, LegalDocument } from "@/components/legal-document"

// The Swedish root layout (`/`); see `LegalDocument` for why each language has its own.
export const metadata = documentMetadata("sv")
export const viewport = documentViewport

export default function SwedishLayout({ children }: { children: ReactNode }) {
  return <LegalDocument locale="sv">{children}</LegalDocument>
}
