import { formatPostDate, toISODate } from "@repo/ui/lib/post-date"
import { cn } from "@repo/ui/lib/utils"

export type ChangeLogProps = {
  /** The entries, newest first, in the order they render. */
  changes: { date: Date; summary: string }[]
  /** The dates' language (`sv-SE`, `en-GB`); always formatted in UTC. */
  dateLocale: string
  labels: { heading: string }
  /** The heading's id, which names the section; `changes` by default. */
  id?: string
  className?: string
}

/**
 * A page's change log: a section named by its heading, over an ordered list of dated one-line
 * summaries (`<time dateTime>` per entry). Static, no JavaScript.
 */
export function ChangeLog({
  changes,
  dateLocale,
  labels,
  id = "changes",
  className,
}: ChangeLogProps) {
  return (
    <section
      aria-labelledby={id}
      data-slot="change-log"
      className={cn("flex flex-col gap-4", className)}
    >
      <h2 id={id} className="text-2xl">
        {labels.heading}
      </h2>
      <ol className="flex flex-col gap-3">
        {changes.map((change) => (
          <li
            key={`${toISODate(change.date)} ${change.summary}`}
            className="flex flex-col gap-1 sm:flex-row sm:gap-4"
          >
            <time
              dateTime={toISODate(change.date)}
              className="shrink-0 text-muted-foreground tabular-nums sm:w-28"
            >
              {formatPostDate(change.date, dateLocale)}
            </time>
            <span>{change.summary}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
