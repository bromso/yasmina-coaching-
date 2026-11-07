import { cn } from "@repo/ui/lib/utils"
import type { ReactNode } from "react"

export type LegalSection = { id: string; title: string; paragraphs: string[] }

export type LegalPageProps = {
  title: string
  updatedAt: string
  sections: LegalSection[]
  notice?: ReactNode
  className?: string
}

/** A terms/privacy-style page: title, last-updated date, an optional notice, a contents nav, and sections. */
export function LegalPage({ title, updatedAt, sections, notice, className }: LegalPageProps) {
  const formatted = new Date(updatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
  return (
    <article className={cn("container max-w-3xl py-16", className)}>
      <h1 className="font-semibold text-4xl tracking-tight">{title}</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Last updated <time dateTime={updatedAt}>{formatted}</time>
      </p>
      {notice && (
        <div
          role="note"
          className="my-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950"
        >
          {notice}
        </div>
      )}
      <nav aria-label="Contents" className="my-8">
        <ol className="flex flex-col gap-1 text-sm">
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="underline underline-offset-4">
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-col gap-10">
        {sections.map((section) => (
          <section key={section.id}>
            <h2 id={section.id} className="font-semibold text-2xl tracking-tight">
              {section.title}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-4 text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  )
}
