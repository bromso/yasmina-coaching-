import type { LegalDoc } from "@repo/content/legal"
import { Toc, type TocItem } from "@repo/ui/blocks/toc"
import { TocActive } from "@repo/ui/blocks/toc-active"
import { ChangeLog } from "@repo/ui/components/change-log"
import { DraftNotice } from "@repo/ui/components/draft-notice"
import { mdxComponents } from "@repo/ui/components/mdx"
import { Placeholder } from "@repo/ui/components/placeholder"
import { formatPostDate, toISODate } from "@repo/ui/lib/post-date"
import type { ComponentType } from "react"
import type { LegalUi } from "@/content/ui"

export type LegalViewProps = {
  doc: LegalDoc
  /** The compiled MDX body. */
  Body: ComponentType<{ components?: typeof mdxComponents }>
  /** The body's headings, as fumadocs lists them. */
  toc: TocItem[]
  /** The words, in the page's language. */
  ui: LegalUi
  /** Whether the pages still await legal review (`isDraft()`): shows the draft notice. */
  draft: boolean
}

/** The change log's heading id: the contents list's last entry links to it. */
const CHANGES_ID = "changes"

/**
 * The MDX components of a page's body: the shared ones, plus `mark` — what the placeholder
 * plugin (`lib/remark-placeholders.ts`) turns every `[ATT FYLLA: …]` into — as `Placeholder`.
 */
const bodyComponents = { ...mdxComponents, mark: Placeholder }

/**
 * One legal page: the draft notice while in review, the title, description and last update, the
 * body at a reading width, then the change log itself — with a contents list of the body's
 * headings and the change log that marks the section being read (`TocActive`). One list, placed
 * by the grid: below `lg` inline between the header and the body; from `lg` a sticky right-hand
 * column, kept below the stuck header by `--sticky-header-offset`.
 */
export function LegalView({ doc, Body, toc, ui, draft }: LegalViewProps) {
  const contents = [...toc, { title: ui.changes, url: `#${CHANGES_ID}`, depth: 2 }]
  return (
    <main id="main" className="container flex max-w-5xl flex-col gap-10 py-12 md:py-16">
      {draft && <DraftNotice>{ui.draft}</DraftNotice>}
      <article className="flex min-w-0 flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-x-12">
        <header className="flex max-w-3xl flex-col gap-4">
          <h1 className="text-balance break-words font-display font-normal text-4xl md:text-6xl">
            {doc.title}
          </h1>
          <p className="text-balance text-lg">{doc.description}</p>
          <p className="text-muted-foreground text-sm">
            {ui.updated}{" "}
            <time dateTime={toISODate(doc.updated)}>
              {formatPostDate(doc.updated, ui.dateLocale)}
            </time>
          </p>
        </header>
        <div className="lg:sticky lg:top-(--sticky-header-offset) lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:max-h-[calc(100dvh-var(--sticky-header-offset))] lg:self-start lg:overflow-y-auto">
          <TocActive>
            <Toc items={contents} label={ui.contents} navLabel={ui.contents} />
          </TocActive>
        </div>
        {/* Layout only: mdxComponents styles each element; this spaces the blocks. */}
        <div className="flex min-w-0 max-w-3xl flex-col gap-5 text-lg leading-relaxed [&_h2]:mt-4 [&_h2]:text-3xl [&_h3]:mt-2 [&_h3]:text-2xl">
          <Body components={bodyComponents} />
        </div>
        <ChangeLog
          id={CHANGES_ID}
          changes={doc.changes}
          dateLocale={ui.dateLocale}
          labels={{ heading: ui.changes }}
        />
      </article>
    </main>
  )
}
