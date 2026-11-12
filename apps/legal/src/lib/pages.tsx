// The legal app's pages, once for both languages. Each `page.tsx` under `src/app/(sv)/` and
// `src/app/(en)/en/` is a few lines over one of these factories, plus the route segment config
// Next reads from the file itself (`dynamicParams`). Loading `legal` validates every page, so a
// bad page fails `next build` on every route.

import type { LegalDoc } from "@repo/content/legal"
import { siteUrl } from "@repo/sites"
import type { LegalLocale } from "@repo/sites/legal"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { indexPath, otherLocale, UI } from "@/content/ui"
import { isDraft } from "@/lib/draft"
import { legal, legalPage } from "@/lib/legal"
import { languagesOf } from "@/lib/sitemap"
import { IndexView } from "@/views/index-view"
import { LegalView } from "@/views/legal-view"

type Params = { params: Promise<{ slug: string }> }

const legalBase = () => siteUrl("legal")

/** The index (`/`, `/en`): every page in `locale` with its last update. */
export function indexRoute(locale: LegalLocale) {
  const url = (l: LegalLocale) => `${legalBase()}${indexPath(l)}`
  const metadata: Metadata = {
    alternates: { canonical: url(locale), languages: languagesOf(url("sv"), url("en")) },
  }
  function Page() {
    return (
      <>
        <PageHeader locale={locale} languageHref={indexPath(otherLocale(locale))} />
        <IndexView locale={locale} docs={legal.inLocale(locale)} />
      </>
    )
  }
  return { metadata, Page }
}

/** One page, `/<slug>` or `/en/<slug>`; a slug that is not a legal page in `locale` is not found. */
export function pageRoute(locale: LegalLocale) {
  const ui = UI[locale]
  function load(slug: string): { doc: LegalDoc; translation: LegalDoc } {
    const doc = legal.inLocale(locale).find((candidate) => candidate.slug === slug)
    if (!doc) notFound()
    return { doc, translation: legal.translation(doc) }
  }
  return {
    generateStaticParams(): { slug: string }[] {
      return legal.inLocale(locale).map((doc) => ({ slug: doc.slug }))
    },
    async generateMetadata({ params }: Params): Promise<Metadata> {
      const { doc, translation } = load((await params).slug)
      const url = `${legalBase()}${doc.url}`
      const [sv, en] = locale === "sv" ? [doc, translation] : [translation, doc]
      return {
        title: doc.title,
        description: doc.description,
        alternates: {
          canonical: url,
          languages: languagesOf(`${legalBase()}${sv.url}`, `${legalBase()}${en.url}`),
        },
        openGraph: {
          type: "article",
          url,
          title: doc.title,
          description: doc.description,
          locale: ui.ogLocale,
          modifiedTime: doc.updated.toISOString(),
        },
      }
    },
    async Page({ params }: Params) {
      const { doc, translation } = load((await params).slug)
      const page = legalPage(doc)
      if (!page) notFound()
      return (
        <>
          <PageHeader locale={locale} languageHref={translation.url} />
          <LegalView
            doc={doc}
            Body={page.data.body}
            toc={page.data.toc}
            ui={ui}
            draft={isDraft()}
          />
        </>
      )
    },
  }
}
