import { LEGAL_PAGES, type LegalLocale } from "@repo/sites/legal"
import { pages } from "collections/server"
import { UI } from "@/content/ui"

/**
 * The index (`/`, `/en`): the app's name over its pages in `locale`, by title only, in the order
 * `LEGAL_PAGES` lists them. Read straight from the collection until the pages themselves, with
 * their dates and links, render through `createLegal`.
 */
export function IndexView({ locale }: { locale: LegalLocale }) {
  const ui = UI[locale]
  const order = Object.keys(LEGAL_PAGES)
  const own = pages
    .filter((doc) => doc.locale === locale && Object.hasOwn(LEGAL_PAGES, doc.page))
    .sort((a, b) => order.indexOf(a.page) - order.indexOf(b.page))
  return (
    <main id="main" className="container flex max-w-3xl flex-col gap-10 py-12 md:py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-balance break-words text-4xl sm:text-6xl">{ui.title}</h1>
        <p className="text-balance text-lg">{ui.description}</p>
      </header>
      <section aria-labelledby="pages" className="flex flex-col gap-4">
        <h2 id="pages" className="text-2xl">
          {ui.pages}
        </h2>
        <ul className="flex flex-col gap-2">
          {own.map((doc) => (
            <li key={doc.page}>{doc.title}</li>
          ))}
        </ul>
      </section>
    </main>
  )
}
