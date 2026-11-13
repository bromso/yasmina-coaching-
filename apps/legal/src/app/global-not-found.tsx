import { BRAND_NAME } from "@repo/sites/brand"
import { StatusPage } from "@repo/ui/blocks/status-page"
import { Button } from "@repo/ui/components/button"
import type { Metadata } from "next"
import { LegalDocument } from "@/components/legal-document"
import { ROOT_LOCALE, UI } from "@/content/ui"

// An unmatched URL has no root layout above it (each language has its own, see `LegalDocument`),
// so this 404 is a whole document, in the app's root language with a line in English below.
// `src/app/not-found.tsx` stays the shared file every static app keeps. No layout's title
// template applies here, so the title carries the brand itself.
const ui = UI[ROOT_LOCALE]
const en = UI.en

export const metadata: Metadata = { title: `${ui.notFound.title} | ${BRAND_NAME}` }

export default function GlobalNotFound() {
  return (
    <LegalDocument locale={ROOT_LOCALE}>
      <main id="main">
        <StatusPage code="404" title={ui.notFound.title} description={ui.notFound.description}>
          <Button asChild size="lg">
            <a href="/">{ui.notFound.back}</a>
          </Button>
        </StatusPage>
        <p lang="en" className="-mt-16 pb-16 text-center text-muted-foreground">
          {en.notFound.title}.{" "}
          <a href="/en" className="underline underline-offset-4 hover:text-foreground">
            {en.notFound.back}
          </a>
        </p>
      </main>
    </LegalDocument>
  )
}
