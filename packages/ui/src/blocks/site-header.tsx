import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"
import { Fragment } from "react"
import { SiteHeaderMobile, type SiteHeaderMobileLabels } from "./site-header-mobile"
import { SiteHeaderShell, siteHeaderBar } from "./site-header-shell"

export type NavLink = { label: string; href: string; current?: boolean }

type SiteHeaderProps = React.ComponentProps<"header"> & {
  brand: React.ReactNode
  links: NavLink[]
  /**
   * The app's own navigation, after the brand: the blog's Ledarskap inifrån and language links,
   * for example. With it, the whole bar is one nav landmark named `navLabel` (brand, these, the
   * controls and `end`), as on www; `links`, if any, become a list inside it. Below `sm` it takes
   * a row of its own under the brand, like `controls`. Without it nothing changes: the bar is no
   * landmark and `links` keep their own nav.
   */
  nav?: React.ReactNode
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
 * The site-wide header in www's look: a floating pill (`SiteHeaderShell` around a bar drawn with
 * `siteHeaderBar`) holding the brand, cross-app nav (sheet below md), the app's own `nav`,
 * controls and the primary action. Below `sm` the row keeps start, brand, `end` and the
 * hamburger; `nav` and `controls` take rows of their own.
 */
export function SiteHeader({
  brand,
  links,
  nav,
  start,
  controls,
  end,
  sticky,
  navLabel = "Site",
  mobileLabels,
  ...props
}: SiteHeaderProps) {
  const Bar = nav ? "nav" : "div"
  const List = nav ? "ul" : "nav"
  // Inside the bar's landmark the links are list items; as their own nav they need no list.
  const Item = nav ? "li" : Fragment
  return (
    <SiteHeaderShell sticky={sticky} {...props}>
      <Bar
        aria-label={nav ? navLabel : undefined}
        data-slot="site-header-bar"
        className={cn(
          siteHeaderBar,
          "flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:flex-nowrap"
        )}
      >
        {start}
        {/* Below sm the brand shrinks (its name truncates) so it shares row one with `end`; a long
            name such as "Yasmina Petersson" would otherwise push the menu onto a row of its own. */}
        <div
          data-slot="site-header-brand"
          className="flex min-w-0 font-display text-xl leading-tight max-sm:flex-1 max-sm:basis-0"
        >
          {brand}
        </div>
        {links.length > 0 && (
          <List
            aria-label={nav ? undefined : navLabel}
            className="hidden md:flex md:items-center md:gap-1"
          >
            {links.map((link) => (
              <Item key={link.href}>
                {link.current ? (
                  <span
                    aria-current="page"
                    className="inline-flex h-8 items-center rounded-full px-3 text-sm font-medium"
                  >
                    {link.label}
                  </span>
                ) : (
                  <a
                    href={link.href}
                    className="inline-flex h-8 items-center rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {link.label}
                  </a>
                )}
              </Item>
            ))}
          </List>
        )}
        {nav && (
          <div
            data-slot="site-header-nav"
            className="order-last flex basis-full flex-wrap items-center gap-1 sm:order-none sm:ml-auto sm:basis-auto sm:flex-nowrap sm:gap-2"
          >
            {nav}
          </div>
        )}
        {controls && (
          <div
            data-slot="site-header-controls"
            className={cn(
              "order-last flex basis-full flex-wrap items-center justify-end gap-2 sm:order-none sm:basis-auto sm:flex-nowrap",
              // From sm up the first of nav and controls takes the free space; the rest follow it.
              !nav && "sm:ml-auto"
            )}
          >
            {controls}
          </div>
        )}
        {/* With nav or controls, -ml-1 turns the bar's gap-3 into the gap-2 between controls. */}
        <div className={cn("ml-auto flex items-center gap-2", (nav || controls) && "sm:-ml-1")}>
          {end}
          <SiteHeaderMobile links={links} navLabel={navLabel} labels={mobileLabels} />
        </div>
      </Bar>
    </SiteHeaderShell>
  )
}
