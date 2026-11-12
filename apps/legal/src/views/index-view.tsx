import type { LegalDoc } from "@repo/content/legal"
import type { LegalLocale } from "@repo/sites/legal"
import { PageCard } from "@repo/ui/blocks/post-card"
import { DraftNotice } from "@repo/ui/components/draft-notice"
import { UI } from "@/content/ui"

/**
 * The index (`/`, `/en`): the app's name over its pages in `locale`, each a card in the blog's
 * look (`PageCard`, with the classes the blog gives its plain cards) holding its linked title,
 * description and last update. `docs` is `legal.inLocale(locale)`, already in `LEGAL_PAGES` order.
 * While the pages await legal review (`draft`, from `isDraft()`), the same notice as every page.
 */
export function IndexView({
  locale,
  docs,
  draft,
}: {
  locale: LegalLocale
  docs: LegalDoc[]
  draft: boolean
}) {
  const ui = UI[locale]
  return (
    <main id="main" className="container flex max-w-5xl flex-col gap-10 py-12 md:py-16">
      {draft && <DraftNotice>{ui.draft}</DraftNotice>}
      <header className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-balance break-words font-display font-normal text-4xl sm:text-6xl">
          {ui.title}
        </h1>
        <p className="text-balance text-lg">{ui.description}</p>
      </header>
      <section aria-labelledby="pages" className="flex flex-col gap-6">
        <h2 id="pages" className="text-2xl">
          {ui.pages}
        </h2>
        <ul className="grid gap-6 md:grid-cols-2">
          {docs.map((doc) => (
            <li key={doc.page} className="flex">
              <PageCard
                href={doc.url}
                title={doc.title}
                description={doc.description}
                date={doc.updated}
                dateLabel={ui.updated}
                dateLocale={ui.dateLocale}
                headingAs="h3"
                className="w-full overflow-hidden rounded-3xl"
                titleClassName="font-display font-normal text-2xl leading-tight"
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
