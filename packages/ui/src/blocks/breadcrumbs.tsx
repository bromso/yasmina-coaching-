import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/breadcrumb"
import { Fragment, type ReactElement } from "react"

export type BreadcrumbsItem = {
  title: string
  href?: string
}

export type BreadcrumbsProps = {
  items: BreadcrumbsItem[]
}

/** A stable key from this item's position and, when it has one, its `href` — titles alone aren't
 * unique (two crumbs can share a name) and aren't guaranteed to stay plain strings. */
function breadcrumbKey(item: BreadcrumbsItem, index: number): string {
  return `${index}-${item.href ?? ""}`
}

/**
 * Docs page breadcrumbs, over the shared `breadcrumb` primitive. Renders nothing for fewer than
 * two items — a single page (or none at all) has nothing to show above it. The last item is
 * always plain text, `BreadcrumbPage`'s own `aria-current="page"`, even when it carries an
 * `href`; any other item without one (Review Focus 1: a folder with no index page) is plain text
 * too, just without that attribute.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps): ReactElement | null {
  if (items.length < 2) return null

  return (
    <Breadcrumb data-slot="docs-breadcrumbs">
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <Fragment key={breadcrumbKey(item, index)}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{item.title}</BreadcrumbPage>
                ) : item.href ? (
                  <BreadcrumbLink href={item.href}>{item.title}</BreadcrumbLink>
                ) : (
                  <span>{item.title}</span>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
