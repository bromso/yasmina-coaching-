import { cn } from "@repo/ui/lib/utils"
import type { ComponentPropsWithoutRef } from "react"

export type MdxImageProps = Omit<ComponentPropsWithoutRef<"img">, "width" | "height"> & {
  width: number | string
  height: number | string
}

/** An MDX body image: width/height are required (no layout shift), lazy and async by default
 * (an author-set `loading` wins — it is spread after). */
export function MdxImage({ className, alt = "", ...props }: MdxImageProps) {
  return (
    <img
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("rounded-lg border", className)}
      {...props}
    />
  )
}

/** The static twin of `MdxImage`: `loading="lazy"` is spread *after* `props`, so it always wins
 * — a feed is read whole, never "above the fold", regardless of what the author set. */
export function StaticMdxImage({ className, alt = "", ...props }: MdxImageProps) {
  return (
    <img
      alt={alt}
      decoding="async"
      className={cn("rounded-lg border", className)}
      {...props}
      loading="lazy"
    />
  )
}
