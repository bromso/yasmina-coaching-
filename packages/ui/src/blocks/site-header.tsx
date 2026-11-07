import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"
import { SiteHeaderMobile, type SiteHeaderMobileLabels } from "./site-header-mobile"

export type NavLink = { label: string; href: string; current?: boolean }

type SiteHeaderProps = React.ComponentProps<"header"> & {
  brand: React.ReactNode
  links: NavLink[]
  /** Before the brand: a sidebar trigger, for example. */
  start?: React.ReactNode
  /**
   * Secondary controls (locale switcher, theme toggle): inline just before `end` from `sm` up;
   * below `sm` they wrap onto their own row under the brand, so a 320 px screen never scrolls
   * sideways and every control stays a real element in the page (no JavaScript needed).
   */
  controls?: React.ReactNode
  /** After the nav and `controls`: the primary action — the user menu, sign-in or "Open app". */
  end?: React.ReactNode
  sticky?: boolean
  /** The nav landmark's accessible name, on the desktop nav and the mobile sheet's alike. */
  navLabel?: string
  /** The mobile menu's hamburger, sheet title and close button. */
  mobileLabels?: SiteHeaderMobileLabels
}

/**
 * The site-wide header: brand, cross-app nav (sheet below md), controls and the primary action.
 * Below `sm` the row keeps start, brand, `end` and the hamburger; `controls` take a second row.
 */
export function SiteHeader({
  brand,
  links,
  start,
  controls,
  end,
  sticky,
  navLabel = "Site",
  mobileLabels,
  className,
  ...props
}: SiteHeaderProps) {
  return (
    <header
      data-slot="site-header"
      className={cn("border-b bg-background", sticky && "sticky top-0 z-50", className)}
      {...props}
    >
      <div className="container flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 py-2.5 sm:h-14 sm:flex-nowrap sm:py-0">
        {start}
        {brand}
        {links.length > 0 && (
          <nav aria-label={navLabel} className="hidden md:flex md:items-center md:gap-1">
            {links.map((link) =>
              link.current ? (
                <span
                  key={link.href}
                  aria-current="page"
                  className="rounded-md px-3 py-1.5 text-sm font-medium"
                >
                  {link.label}
                </span>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  {link.label}
                </a>
              )
            )}
          </nav>
        )}
        {controls && (
          <div
            data-slot="site-header-controls"
            className="order-last flex basis-full flex-wrap items-center justify-end gap-2 sm:order-none sm:ml-auto sm:basis-auto sm:flex-nowrap"
          >
            {controls}
          </div>
        )}
        {/* With controls, -ml-2 turns the row's gap-4 into the gap-2 the controls had inside end. */}
        <div className={cn("ml-auto flex items-center gap-2", controls && "sm:-ml-2")}>
          {end}
          <SiteHeaderMobile links={links} navLabel={navLabel} labels={mobileLabels} />
        </div>
      </div>
    </header>
  )
}
