import { LegalPage } from "@repo/ui/blocks/legal-page"
import type { Metadata } from "next"
import { LEGAL_NOTICE } from "@/content/legal-notice"
import { terms } from "@/content/terms"

export const metadata: Metadata = { title: "Terms" }

export default function Page() {
  return (
    <main id="main">
      <LegalPage
        title="Terms of service"
        updatedAt={terms.updatedAt}
        sections={terms.sections}
        notice={LEGAL_NOTICE}
      />
    </main>
  )
}
