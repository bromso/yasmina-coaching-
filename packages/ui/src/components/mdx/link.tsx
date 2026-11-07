import { cn } from "@repo/ui/lib/utils"
import type { ComponentPropsWithoutRef } from "react"

/** The MDX `a`: a plain `<a>` (never `next/link` — `@repo/ui` has no Next dependency). A pure
 * component, shared by `mdxComponents` and `mdxStaticComponents`. */
export function MdxLink({ href, children, className, ...props }: ComponentPropsWithoutRef<"a">) {
  const isExternal = typeof href === "string" && /^https?:\/\//.test(href)
  return (
    <a
      href={href}
      rel={isExternal ? "noreferrer" : undefined}
      className={cn("underline underline-offset-4 hover:text-muted-foreground", className)}
      {...props}
    >
      {children}
    </a>
  )
}
