import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"

type EyebrowProps<T extends React.ElementType = "span"> = {
  /** The element: a `span` by default; `h3`, `dt` or `p` where the label is that. */
  as?: T
  className?: string
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className">

/** The small uppercase label above a section's headline, or heading a list or a term. */
export function Eyebrow<T extends React.ElementType = "span">({
  as,
  className,
  ...props
}: EyebrowProps<T>) {
  const Component = as || "span"
  return (
    <Component
      className={cn(
        "block font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]",
        className
      )}
      {...props}
    />
  )
}
