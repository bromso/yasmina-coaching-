import { BRAND_NAME } from "@repo/sites/brand"
import { cn } from "@repo/ui/lib/utils"

/** The three-bar brand mark. Decorative: the brand name beside it carries the meaning. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-6 shrink-0 flex-col items-center justify-center gap-[2px] rounded-md bg-primary p-1",
        className
      )}
    >
      <span className="h-[3px] w-full rounded-full bg-primary-foreground" />
      <span className="h-[3px] w-full rounded-full bg-primary-foreground opacity-70" />
      <span className="h-[3px] w-full rounded-full bg-primary-foreground opacity-40" />
    </span>
  )
}

type BrandProps = {
  name?: string
  href: string
  className?: string
}

/** The site's brand link: mark + name. A plain anchor, so it works across subdomain apps. */
export function Brand({ name = BRAND_NAME, href, className }: BrandProps) {
  return (
    <a href={href} className={cn("flex min-w-0 items-center gap-2 font-semibold", className)}>
      <BrandMark />
      <span className="truncate">{name}</span>
    </a>
  )
}
