import { StatusPage } from "@repo/ui/blocks/status-page"
import { Button } from "@repo/ui/components/button"
import type { Metadata } from "next"
import { BlogDocument } from "@/components/blog-document"
import { PageHeader } from "@/components/page-header"
import { ROOT_LOCALE, UI } from "@/content/ui"

// An unmatched URL has no root layout above it (each language has its own, see `BlogDocument`),
// so this 404 is a whole document, in the blog's root language. `src/app/not-found.tsx` stays the
// shared file every static app keeps.
const ui = UI[ROOT_LOCALE]

export const metadata: Metadata = { title: ui.notFound.title }

export default function GlobalNotFound() {
  return (
    <BlogDocument locale={ROOT_LOCALE}>
      <PageHeader locale={ROOT_LOCALE} />
      <main id="main">
        <StatusPage code="404" title={ui.notFound.title} description={ui.notFound.description}>
          <Button asChild size="lg">
            <a href="/">{ui.notFound.back}</a>
          </Button>
        </StatusPage>
      </main>
    </BlogDocument>
  )
}
