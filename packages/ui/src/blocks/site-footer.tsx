import { BRAND_NAME } from "@repo/sites/brand"
import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"
import { Fragment } from "react"

export type FooterLink = { label: string; href: string }
export type FooterGroup = { title: string; links: FooterLink[] }

type SiteFooterProps = React.ComponentProps<"footer"> & {
  brand: React.ReactNode
  groups: FooterGroup[]
  /** The bottom row: copyright, terms, privacy — `SiteFooterLegal` draws it in www's look. */
  legal?: React.ReactNode
  /** The nav landmark's accessible name. */
  navLabel?: string
}

/** The site-wide footer: brand column, headed link groups, and a legal row. Content via props. */
export function SiteFooter({
  brand,
  groups,
  legal,
  navLabel = "Footer",
  className,
  ...props
}: SiteFooterProps) {
  return (
    <footer data-slot="site-footer" className={cn("border-t", className)} {...props}>
      <div className="container grid gap-8 py-10 md:grid-cols-[1fr_auto]">
        <div>{brand}</div>
        {groups.length > 0 && (
          <nav aria-label={navLabel} className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {groups.map((group) => (
              <div key={group.title} className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold">{group.title}</h2>
                <ul className="flex flex-col gap-2">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        )}
      </div>
      {legal && (
        <div
          data-slot="site-footer-legal"
          className="container border-t py-6 text-sm text-muted-foreground"
        >
          {legal}
        </div>
      )}
    </footer>
  )
}

type SiteFooterLegalProps = {
  /** The links after the copyright (terms, privacy, …), in order. */
  links: FooterLink[]
  /** Who holds the copyright. */
  owner?: React.ReactNode
  /** Defaults to the current year (at render: build time in the static apps). */
  year?: number
}

/**
 * The legal row's line, www's look: `© <year> <owner> · <link> · <link>`, small and muted, each
 * link underlined. Every app passes it as `SiteFooter`'s `legal`, with its own (translated) links,
 * so the row is styled here once. A `<p>` holding "©": the visual spec masks it by that.
 */
export function SiteFooterLegal({
  links,
  owner = BRAND_NAME,
  year = new Date().getFullYear(),
}: SiteFooterLegalProps) {
  return (
    <p className="text-muted-foreground text-xs">
      © {year} {owner}
      {links.map((link) => (
        <Fragment key={link.href}>
          {" "}
          ·{" "}
          <a href={link.href} className="underline underline-offset-4 hover:text-foreground">
            {link.label}
          </a>
        </Fragment>
      ))}
    </p>
  )
}
