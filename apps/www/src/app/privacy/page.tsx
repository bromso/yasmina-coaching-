import { LegalPage } from "@repo/ui/blocks/legal-page"
import type { Metadata } from "next"
import { LEGAL_NOTICE } from "@/content/legal-notice"
import { privacy } from "@/content/privacy"

export const metadata: Metadata = { title: "Privacy" }

export default function Page() {
  return (
    <main id="main">
      <LegalPage
        title="Privacy policy"
        updatedAt={privacy.updatedAt}
        sections={privacy.sections}
        notice={LEGAL_NOTICE}
      />
    </main>
  )
}
