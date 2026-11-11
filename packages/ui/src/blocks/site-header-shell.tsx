import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"

/**
 * The bar's look, www's floating pill: rounded, translucent over the page, a hairline ring and a
 * blur behind. `SiteHeader` draws its bar with it; an app whose navigation draws (and animates)
 * its own bar, as www's `ExploreNav` does, puts these classes on that element instead.
 * Kept in this server- and client-safe file so a client component can import it without pulling
 * the header's sheet into its bundle.
 */
export const siteHeaderBar =
  "w-full max-w-[1024px] rounded-[18px] bg-background/85 py-3 shadow-[0_0_0_1px_var(--border)] backdrop-blur-xl"

/**
 * For a fixed element that starts below the stuck header (account's desktop sidebar): its `top`
 * and height from `--site-header-height` (`packages/tokens`), the safe-area inset the shell sticks
 * below included. `!` on the height beats the sidebar's own `h-svh`.
 */
export const belowSiteHeader =
  "top-[calc(var(--site-header-height)+env(safe-area-inset-top,0px))] h-[calc(100svh-var(--site-header-height)-env(safe-area-inset-top,0px))]!"

/**
 * For what must cover the fixed sidebar where they meet (account's footer, which would otherwise
 * slide under the sidebar's start): stacked at `--layer-above-sidebar`, which `packages/tokens`
 * derives from the sidebar's own `--layer-sidebar`, on the page background so the sidebar does not
 * show through.
 */
export const aboveSidebar = "relative z-(--layer-above-sidebar) bg-background"

type SiteHeaderShellProps = React.ComponentProps<"header"> & {
  /** Pins the header to the top of the viewport, above the page. */
  sticky?: boolean
}

/**
 * The header landmark around the bar: centred, the pill held off the screen's edges, with no
 * background of its own so the page shows around the pill. `SiteHeader` renders it; www renders
 * it directly around its own animated navigation.
 */
export function SiteHeaderShell({ sticky, className, children, ...props }: SiteHeaderShellProps) {
  return (
    <header
      data-slot="site-header"
      className={cn(
        "flex justify-center px-2.5 pt-(--site-header-inset) lg:px-4",
        // Stuck below a notch or status bar when the page draws under it (`viewport-fit=cover`).
        sticky && "sticky top-[env(safe-area-inset-top,0px)] z-50",
        className
      )}
      {...props}
    >
      {children}
    </header>
  )
}
