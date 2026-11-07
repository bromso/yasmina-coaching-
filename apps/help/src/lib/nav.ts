import type { BreadcrumbsItem } from "@repo/ui/blocks/breadcrumbs"
import { isValidElement, type ReactNode } from "react"

/** The help center's own crumb, at the head of every other page's trail. */
const ROOT_CRUMB: BreadcrumbsItem = { title: "Help", href: "/" }

/**
 * A fumadocs-flavoured name (a `ReactNode`: fumadocs' search highlighting can wrap part of a
 * title in `<mark>`) as plain text, for the `@repo/ui` blocks, which take strings only. Strings
 * and numbers as they are, arrays joined, an element by its `children`, recursively; anything
 * else (`null`, booleans) is empty.
 */
export function textOf(node: ReactNode): string {
  if (typeof node === "string") return node
  if (typeof node === "number" || typeof node === "bigint") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

/**
 * A category page's breadcrumb trail: "Help" then the category.
 */
export function categoryBreadcrumbs(category: { slug: string; title: string }): BreadcrumbsItem[] {
  return [ROOT_CRUMB, { title: category.title, href: `/${category.slug}` }]
}

/**
 * An article page's breadcrumb trail: "Help", its category, then the article itself.
 */
export function articleBreadcrumbs(
  category: { slug: string; title: string },
  article: { path: string; title: string }
): BreadcrumbsItem[] {
  return [...categoryBreadcrumbs(category), { title: article.title, href: article.path }]
}
