import { cn } from "@repo/ui/lib/utils"
import type { ReactElement } from "react"

export type PrevNextLink = {
  href: string
  title: string
  label?: string
}

export type PrevNextProps = {
  prev?: PrevNextLink
  next?: PrevNextLink
  /** The nav's `aria-label`. Defaults to "Post navigation". */
  label?: string
}

/** Prev/next navigation at the foot of a post or docs page. Renders nothing with neither link. */
export function PrevNext({
  prev,
  next,
  label = "Post navigation",
}: PrevNextProps): ReactElement | null {
  if (!prev && !next) return null

  return (
    <nav
      data-slot="prev-next"
      aria-label={label}
      className="grid gap-4 border-t pt-6 sm:grid-cols-2"
    >
      {prev ? (
        <a
          href={prev.href}
          className="flex flex-col gap-1 rounded-lg border p-4 transition-colors hover:border-foreground/30"
        >
          <span className="text-xs text-muted-foreground">{prev.label ?? "Previous"}</span>
          <span className="font-medium">{prev.title}</span>
        </a>
      ) : (
        <span aria-hidden="true" />
      )}
      {next ? (
        <a
          href={next.href}
          className={cn(
            "flex flex-col gap-1 rounded-lg border p-4 text-right transition-colors hover:border-foreground/30",
            "sm:col-start-2"
          )}
        >
          <span className="text-xs text-muted-foreground">{next.label ?? "Next"}</span>
          <span className="font-medium">{next.title}</span>
        </a>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  )
}
