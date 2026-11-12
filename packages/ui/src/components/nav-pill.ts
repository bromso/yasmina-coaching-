import { cn } from "@repo/ui/lib/utils"

const SIZES = {
  /** 32 px on a text-sm line: the site header's links, a section's tabs. */
  sm: "py-1.5",
  /** 36 px: next to the h-9 controls of a header row (the blog's nav). */
  md: "py-2",
} as const

/**
 * The classes of a pill navigation link, the shape of the site header's links: a section's tabs
 * or sub-navigation (the admin sections, a status filter). For a `<Link>` or `<a>` the app renders,
 * with `aria-current="page"` on the current one; `current` fills it.
 */
export function navPill({
  current = false,
  size = "sm",
  className,
}: {
  current?: boolean
  size?: keyof typeof SIZES
  className?: string
} = {}) {
  return cn(
    // Not a flex box: a label and its count ("All (2)") keep the space between them, which a flex
    // container would drop. inline-block, so the padding gives the pill its height even inside a
    // list item.
    "inline-block rounded-full px-3 text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
    SIZES[size],
    current ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
    className
  )
}
