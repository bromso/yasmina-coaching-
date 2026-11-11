import { cn } from "@repo/ui/lib/utils"

/**
 * The classes of a pill navigation link, the shape of the site header's links: a section's tabs
 * or sub-navigation (the admin sections, a status filter). For a `<Link>` or `<a>` the app renders,
 * with `aria-current="page"` on the current one; `current` fills it.
 */
export function navPill({
  current = false,
  className,
}: {
  current?: boolean
  className?: string
} = {}) {
  return cn(
    // Not a flex box: a label and its count ("All (2)") keep the space between them, which a flex
    // container would drop. py-1.5 on the text-sm line is the header links' 32px.
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
    current ? "bg-muted text-foreground" : "text-muted-foreground",
    className
  )
}
