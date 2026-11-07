import { cn } from "@repo/ui/lib/utils"
import type { ReactElement } from "react"

export type DocsNavNode =
  | { type: "page"; title: string; href: string }
  | { type: "separator"; title?: string }
  | {
      type: "folder"
      title: string
      href?: string
      defaultOpen?: boolean
      children: DocsNavNode[]
    }

export type DocsSidebarProps = {
  items: DocsNavNode[]
  currentHref: string
  /** The nav's `aria-label`. Defaults to "Docs". */
  label?: string
}

/** Whether `node` — or, recursively, one of its descendants — is the current page. A folder's own
 * `href` (its index page) counts, so a folder with an index page opens for its own landing page
 * too, not only for pages nested under it. */
function containsCurrent(node: DocsNavNode, currentHref: string): boolean {
  if (node.type === "separator") return false
  if (node.href === currentHref) return true
  if (node.type === "folder")
    return node.children.some((child) => containsCurrent(child, currentHref))
  return false
}

/** A stable key from this item's position and, when it has one, its `href` — titles alone aren't
 * unique (two folders can share a name) and aren't guaranteed to stay plain strings. */
function navKey(item: DocsNavNode, index: number): string {
  const href = item.type === "separator" ? "" : (item.href ?? "")
  return `${index}-${href}`
}

function DocsNavLink({
  href,
  title,
  currentHref,
  className,
}: {
  href: string
  title: string
  currentHref: string
  className?: string
}) {
  const isCurrent = href === currentHref
  return (
    <a
      href={href}
      aria-current={isCurrent ? "page" : undefined}
      className={cn(
        "block rounded-md px-2 py-1 transition-colors hover:bg-muted hover:text-foreground",
        isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
        className
      )}
    >
      {title}
    </a>
  )
}

/** The folder disclosure marker: a small chevron, rotated when the ancestor `<details>` (the
 * `group`) is open. Purely decorative (`aria-hidden`) — a screen reader doesn't learn the
 * open/closed state from this rotation at all, it's already exposed natively by `<summary>`'s own
 * disclosure semantics (the implicit expanded/collapsed state every browser gives it). */
function FolderMarker() {
  return (
    <span
      aria-hidden="true"
      className="text-muted-foreground transition-transform group-open:rotate-90"
    >
      ▸
    </span>
  )
}

function DocsNavItem({ node, currentHref }: { node: DocsNavNode; currentHref: string }) {
  if (node.type === "separator") {
    // No title: a plain divider. `<hr>` carries the separator semantics on its own (its implicit
    // ARIA role is already "separator") — `<li role="separator">` would say the same thing, but
    // Biome's a11y linter treats that role as an "interactive" one that a non-interactive host
    // like `<li>` shouldn't carry, so the real element is both the cleaner and the lint-clean fix.
    if (!node.title) {
      return (
        <li>
          <hr className="my-2 border-muted" />
        </li>
      )
    }
    // A titled separator is a plain list item holding its title: no `role="presentation"`, which
    // would leave the list with a child that is not a list item (axe's `list` rule), and no
    // heading, so the sidebar's outline stays the page's.
    return (
      <li className="mt-4 px-2 first:mt-0">
        <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
          {node.title}
        </span>
      </li>
    )
  }

  if (node.type === "page") {
    return (
      <li>
        <DocsNavLink href={node.href} title={node.title} currentHref={currentHref} />
      </li>
    )
  }

  // node.type === "folder": open when `defaultOpen` is set, or it (or a descendant, or its own
  // index href) is the current page — so the current page's group is never collapsed on load.
  const open = node.defaultOpen || containsCurrent(node, currentHref)

  if (!node.href) {
    // No index page: there's nothing to navigate to, so the whole row is the toggle — its
    // accessible name is just the title, with the decorative chevron alongside it. Nothing to
    // collide with, unlike the href case below.
    return (
      <li>
        <details open={open} className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 hover:bg-muted [&::-webkit-details-marker]:hidden">
            <span className="flex-1 font-medium text-foreground">{node.title}</span>
            <FolderMarker />
          </summary>
          <DocsNavList items={node.children} currentHref={currentHref} nested />
        </details>
      </li>
    )
  }

  return (
    // `relative` gives the toggle below something to position against, so it can sit over the
    // link's row as its own, separately clickable corner rather than sharing the link's click
    // target (or, as an earlier version of this had it, being a barely-there 4px gap next to
    // it — below the WCAG 2.5.8 minimum target size).
    <li className="relative">
      {/* `pr-8` reserves room for the toggle below, so the link's own text never sits under it. */}
      <DocsNavLink href={node.href} title={node.title} currentHref={currentHref} className="pr-8" />
      {/* This `<details>` holds both the toggle and the nested page list — back to the native
          parent/child pairing (no `peer-open:` CSS standing in for it), so the browser's own
          find-in-page can expand a closed folder to show a match inside it, same as any other
          `<details>`. Positioning the `<summary>` itself (`absolute`, a 28px — `size-7` —
          square, meeting WCAG 2.5.8) is what keeps it from overlapping the link's own text:
          the <details> element contributes no layout of its own while closed (its only
          in-flow child is taken out of flow by that `absolute`), so the link's row stays its
          normal height until opened, when the nested list appears below it as usual. The
          toggle's own accessible name ("Toggle <title>", sr-only) stays separate from the
          link's, so the two are never read as the same control. */}
      <details open={open} className="group">
        <summary className="absolute top-0 right-1 grid size-7 cursor-pointer list-none place-items-center rounded-md hover:bg-muted [&::-webkit-details-marker]:hidden">
          <FolderMarker />
          <span className="sr-only">Toggle {node.title}</span>
        </summary>
        <DocsNavList items={node.children} currentHref={currentHref} nested />
      </details>
    </li>
  )
}

function DocsNavList({
  items,
  currentHref,
  nested = false,
}: {
  items: DocsNavNode[]
  currentHref: string
  nested?: boolean
}) {
  return (
    <ul className={cn("flex flex-col gap-1 text-sm", nested && "mt-1 pl-4")}>
      {items.map((item, index) => (
        <DocsNavItem key={navKey(item, index)} node={item} currentHref={currentHref} />
      ))}
    </ul>
  )
}

/**
 * The docs sidebar: plain markup, no JavaScript required. A folder without an index page is a
 * single toggle row (Review Focus 1: a non-link group — its title is both the visible label and
 * the `<summary>`'s accessible name, nothing else to collide with). A folder *with* one pairs
 * that link with a separate, 28px toggle positioned over its own corner of the row (see
 * `DocsNavItem`) — big enough to meet WCAG 2.5.8, and never the same click target as the link
 * text itself. Either way the toggle and the nested page list are the same native `<details>`
 * pairing a browser already knows how to expand (including via find-in-page). A folder starts
 * open when `defaultOpen` is set or it contains the current page, including its own index
 * `href`. Nesting is unbounded.
 */
export function DocsSidebar({
  items,
  currentHref,
  label = "Docs",
}: DocsSidebarProps): ReactElement {
  return (
    <nav aria-label={label} data-slot="docs-sidebar">
      <DocsNavList items={items} currentHref={currentHref} />
    </nav>
  )
}
