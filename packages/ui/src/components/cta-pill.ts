import { cn } from "@repo/ui/lib/utils"

const SIZES = {
  /** In the site header's bar, next to the 30 px toggle. */
  sm: "h-[30px] px-3.5 text-xs",
  /** In a header row of 36 px controls. */
  default: "h-9 px-4",
  /** On its own: the open navigation panel, the close of a post. */
  lg: "h-11 px-5",
} as const

/**
 * The classes of the booking call to action ("Boka"), www's filled pill: for the `<a>` (or motion
 * element) an app renders, so a layout animation can still own the element. Text size comes from
 * the surrounding text, apart from `sm`. Unlike `Button` it keeps the text's own weight and is
 * tracked a little wider.
 */
export function ctaPill({
  size = "default",
  className,
}: {
  size?: keyof typeof SIZES
  className?: string
} = {}) {
  return cn(
    "inline-flex items-center rounded-full bg-primary text-primary-foreground tracking-[0.035em] outline-none transition-colors hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50",
    SIZES[size],
    className
  )
}
