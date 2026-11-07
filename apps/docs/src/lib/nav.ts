import type { BreadcrumbsItem } from "@repo/ui/blocks/breadcrumbs"
import type { DocsNavNode } from "@repo/ui/blocks/docs-sidebar"
import type { PrevNextProps } from "@repo/ui/blocks/prev-next"
import { getBreadcrumbItems } from "fumadocs-core/breadcrumb"
import { findNeighbour, type Node, type Root } from "fumadocs-core/page-tree"
import { isValidElement, type ReactNode } from "react"

/** The docs landing page's crumb, at the head of every other page's trail. */
const ROOT_CRUMB: BreadcrumbsItem = { title: "Docs", href: "/" }

/**
 * A fumadocs name (a `ReactNode`: a page title can be `<code>x</code> setup`) as plain text, for
 * the `@repo/ui` blocks, which take strings only. Strings and numbers as they are, arrays joined,
 * an element by its `children`, recursively; anything else (`null`, booleans) is empty.
 */
export function textOf(node: ReactNode): string {
  if (typeof node === "string") return node
  if (typeof node === "number" || typeof node === "bigint") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

function toNavNode(node: Node): DocsNavNode {
  switch (node.type) {
    case "page":
      return { type: "page", title: textOf(node.name), href: node.url }
    case "separator":
      return { type: "separator", title: textOf(node.name) || undefined }
    case "folder":
      return {
        type: "folder",
        title: textOf(node.name),
        href: node.index?.url,
        defaultOpen: node.defaultOpen,
        children: node.children.map(toNavNode),
      }
  }
}

/** The fumadocs page tree as the sidebar's plain, serialisable nodes. */
export function toNavNodes(tree: Root): DocsNavNode[] {
  return tree.children.map(toNavNode)
}

/**
 * A page's breadcrumb trail: "Docs" (the landing page), each folder above the page (linked when it
 * has an index page) and the page itself. Empty for the landing page, which has nothing above it.
 */
export function breadcrumbsFor(url: string, tree: Root): BreadcrumbsItem[] {
  if (url === "/") return []
  const items = getBreadcrumbItems(url, tree, { includePage: true }).map((item) => ({
    title: textOf(item.name),
    href: item.url,
  }))
  return [ROOT_CRUMB, ...items]
}

/** The pages before and after `url` in sidebar order, as `PrevNext`'s props. */
export function neighboursFor(url: string, tree: Root): PrevNextProps {
  const { previous, next } = findNeighbour(tree, url)
  const result: PrevNextProps = {}
  if (previous)
    result.prev = { href: previous.url, title: textOf(previous.name), label: "Previous" }
  if (next) result.next = { href: next.url, title: textOf(next.name), label: "Next" }
  return result
}

/** One group on the `/all` index: a separator's or a top-level folder's title (none for the pages
 * before the first separator or after a top-level folder) and its pages in sidebar order. */
export interface NavSection {
  title?: string
  pages: { href: string; title: string }[]
}

/** Every page under `node`, in sidebar order: a folder's index page first, then its children. */
function pagesOf(node: DocsNavNode): NavSection["pages"] {
  if (node.type === "separator") return []
  if (node.type === "page") return [{ href: node.href, title: node.title }]
  const own = node.href ? [{ href: node.href, title: node.title }] : []
  return [...own, ...node.children.flatMap(pagesOf)]
}

/**
 * The sidebar's pages grouped for the `/all` index: a separator starts a section under its title, a
 * top-level folder is a section of its own (nested folders flattened into it), and the pages after
 * a folder form an untitled section until the next separator. Empty sections are dropped.
 */
export function sectionsOf(nodes: DocsNavNode[]): NavSection[] {
  const sections: NavSection[] = []
  let current: NavSection = { pages: [] }
  const flush = () => {
    if (current.pages.length > 0) sections.push(current)
  }
  for (const node of nodes) {
    if (node.type === "separator") {
      flush()
      current = node.title ? { title: node.title, pages: [] } : { pages: [] }
    } else if (node.type === "folder") {
      flush()
      sections.push({ title: node.title, pages: pagesOf(node) })
      // The pages after a folder continue untitled: repeating the separator's title would read as
      // a second section of the same name.
      current = { pages: [] }
    } else {
      current.pages.push(...pagesOf(node))
    }
  }
  flush()
  return sections.filter((section) => section.pages.length > 0)
}
