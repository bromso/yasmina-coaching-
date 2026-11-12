import { cn } from "@repo/ui/lib/utils"
import type { ReactNode } from "react"

export type PlaceholderProps = {
  /** The placeholder's own text, brackets included (`[ATT FYLLA: …]`). */
  children?: ReactNode
  className?: string
}

/**
 * Text still to be written (a draft's `[ATT FYLLA: …]` / `[TO FILL: …]`), impossible to miss: a
 * `<mark data-placeholder>` in the sun colour with a dashed outline, so it does not rely on colour
 * alone.
 */
export function Placeholder({ children, className }: PlaceholderProps) {
  return (
    <mark
      data-placeholder=""
      className={cn(
        "rounded-sm bg-sun px-1 font-semibold text-foreground outline-1 outline-foreground outline-dashed",
        className
      )}
    >
      {children}
    </mark>
  )
}
