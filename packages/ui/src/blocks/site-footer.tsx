import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"

export type FooterGroup = { title: string; links: { label: string; href: string }[] }

type SiteFooterProps = React.ComponentProps<"footer"> & {
  brand: React.ReactNode
  groups: FooterGroup[]
  /** The bottom row: copyright, terms, privacy. */
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
