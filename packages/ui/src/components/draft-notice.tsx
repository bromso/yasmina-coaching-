import { cn } from "@repo/ui/lib/utils"
import type { ReactNode } from "react"

export type DraftNoticeProps = {
  /** The notice's words, in the page's language. */
  children: ReactNode
  className?: string
}

/**
 * A banner saying the page is a draft (the legal pages before review): a `role="note"` block in
 * the soft sun colour. Static, no JavaScript.
 */
export function DraftNotice({ children, className }: DraftNoticeProps) {
  return (
    <div
      role="note"
      data-slot="draft-notice"
      className={cn(
        "rounded-lg border border-border bg-sun-soft px-4 py-3 font-medium text-foreground text-sm",
        className
      )}
    >
      {children}
    </div>
  )
}
