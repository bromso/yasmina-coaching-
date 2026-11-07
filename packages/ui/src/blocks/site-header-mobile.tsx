"use client"

import { Button } from "@repo/ui/components/button"
import { Icon } from "@repo/ui/components/icon"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@repo/ui/components/sheet"
import type { NavLink } from "./site-header"

export type SiteHeaderMobileLabels = {
  /** The hamburger's accessible name. */
  open?: string
  /** The sheet's title. */
  title?: string
  /** The sheet's close button. */
  close?: string
}

/** Below `md`: a hamburger opening a sheet with the header's links. Nothing when there are none. */
export function SiteHeaderMobile({
  links,
  navLabel = "Site",
  labels,
}: {
  links: NavLink[]
  /** The nav landmark's accessible name, the same as the desktop nav's. */
  navLabel?: string
  labels?: SiteHeaderMobileLabels
}) {
  if (links.length === 0) return null
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={labels?.open ?? "Open menu"}
          className="md:hidden"
        >
          <Icon icon="lucide:menu" className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        closeLabel={labels?.close ?? "Close"}
        className="p-6"
      >
        <SheetTitle>{labels?.title ?? "Menu"}</SheetTitle>
        <nav aria-label={navLabel} className="flex flex-col gap-1">
          {links.map((link) =>
            link.current ? (
              <span
                key={link.href}
                aria-current="page"
                className="rounded-md px-3 py-2 text-sm font-medium"
              >
                {link.label}
              </span>
            ) : (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {link.label}
              </a>
            )
          )}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
