import { siteHeaderBar } from "@repo/ui/blocks/site-header-shell"
import { ctaPill } from "@repo/ui/components/cta-pill"
import { cn } from "@/lib/utils"
import type { ExploreNavLink } from "./explore-nav"

type ExploreNavBarProps = {
  brand: ExploreNavLink
  book: ExploreNavLink
  sections: ExploreNavLink[]
  labels: { nav: string; explore: string }
}

/**
 * The navigation's closed state as plain HTML, pixel for pixel what `ExploreNav` renders closed:
 * the server's markup, what readers without JavaScript keep (with the section links under it),
 * and what shows until the animated version has loaded. The toggle does nothing until then.
 */
export function ExploreNavBar({ brand, book, sections, labels }: ExploreNavBarProps) {
  return (
    <nav aria-label={labels.nav} className={cn(siteHeaderBar, "overflow-hidden")}>
      <div className="flex min-h-8 w-full items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          <a
            href={brand.href}
            className="block truncate rounded-md font-display text-xl leading-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {brand.label}
          </a>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-expanded={false}
            className="flex h-[30px] w-[84px] items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span>{labels.explore}</span>
          </button>
          <a href={book.href} className={ctaPill({ size: "sm" })}>
            <span>{book.label}</span>
          </a>
        </div>
      </div>
      <noscript>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-sm">
          {sections.map((section) => (
            <li key={section.href}>
              <a href={section.href} className="underline underline-offset-4">
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </noscript>
    </nav>
  )
}
