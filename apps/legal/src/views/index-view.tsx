import type { LegalDoc } from "@repo/content/legal"
import type { LegalLocale } from "@repo/sites/legal"
import { DraftNotice } from "@repo/ui/components/draft-notice"
import { formatPostDate, toISODate } from "@repo/ui/lib/post-date"
import { UI } from "@/content/ui"

/**
 * The index (`/`, `/en`): the app's name over its pages in `locale`, each linked with its
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
    <main id="main" className="container flex max-w-3xl flex-col gap-10 py-12 md:py-16">
      {draft && <DraftNotice>{ui.draft}</DraftNotice>}
      <header className="flex flex-col gap-3">
        <h1 className="text-balance break-words font-display font-normal text-4xl sm:text-6xl">
          {ui.title}
        </h1>
        <p className="text-balance text-lg">{ui.description}</p>
      </header>
      <section aria-labelledby="pages" className="flex flex-col gap-6">
        <h2 id="pages" className="text-2xl">
          {ui.pages}
        </h2>
        <ul className="flex flex-col gap-6">
          {docs.map((doc) => (
            <li key={doc.page} className="flex flex-col gap-1">
              <a
                href={doc.url}
                className="w-fit rounded-sm font-medium text-xl underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {doc.title}
              </a>
              <p>{doc.description}</p>
              <p className="text-muted-foreground text-sm">
                {ui.updated}{" "}
                <time dateTime={toISODate(doc.updated)}>
                  {formatPostDate(doc.updated, ui.dateLocale)}
                </time>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
