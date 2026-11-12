import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"

type SunPanelProps<T extends React.ElementType = "div"> = {
  as?: T
  /** `soft` (default) is the pale sun-soft ground of cards and teasers; `sun` the full yellow
   * of a call to action. */
  tone?: "soft" | "sun"
  className?: string
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className">

/**
 * The coaching look's warm, rounded panel: the ground of www's and the blog's cards, teasers and
 * calls to action. Padding and layout are the caller's.
 */
export function SunPanel<T extends React.ElementType = "div">({
  as,
  tone = "soft",
  className,
  ...props
}: SunPanelProps<T>) {
  const Component = as || "div"
  return (
    <Component
      className={cn("rounded-4xl", tone === "sun" ? "bg-sun" : "bg-sun-soft", className)}
      {...props}
    />
  )
}
