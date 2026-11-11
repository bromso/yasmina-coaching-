import { LegalPage } from "@repo/ui/blocks/legal-page"
import type { Metadata } from "next"
import { LEGAL_CHROME } from "@/content/legal-notice"
import { privacyFor } from "@/content/privacy"
import { getLocale } from "@/lib/locale"

export async function generateMetadata(): Promise<Metadata> {
  return { title: privacyFor(await getLocale()).metaTitle }
}

/** Swedish by default, English through the `locale` cookie, like every www page. */
export default async function Page() {
  const locale = await getLocale()
  const doc = privacyFor(locale)
  const chrome = LEGAL_CHROME[locale]
  return (
    <main id="main">
      <LegalPage
        title={doc.title}
        updatedAt={doc.updatedAt}
        sections={doc.sections}
        notice={chrome.notice}
        labels={{ lastUpdated: chrome.lastUpdated, contents: chrome.contents }}
        dateLocale={chrome.dateLocale}
      />
    </main>
  )
}
