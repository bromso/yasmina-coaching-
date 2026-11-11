import { cn } from "@repo/ui/lib/utils"
import { Children, type ComponentPropsWithoutRef, isValidElement, type ReactNode } from "react"

export type HeadingProps = Omit<ComponentPropsWithoutRef<"h2">, "children"> & {
  as: "h2" | "h3" | "h4"
  id?: string
  children: ReactNode
}

/** The plain text of a heading's children, nested elements (`code`, `em`, links) included. */
function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child)
      if (isValidElement<{ children?: ReactNode }>(child)) return textOf(child.props.children)
      return ""
    })
    .join("")
}

/** The anchor's accessible name: names the section, so a list of links reads as more than a run
 * of identical "#"s; a heading with no text content falls back to a generic name. */
function anchorLabel(children: ReactNode): string {
  const text = textOf(children).replace(/\s+/g, " ").trim()
  return text ? `Link to section: ${text}` : "Link to this section"
}

/**
 * An MDX heading that keeps the `id` fumadocs sets on it and adds a visible-on-hover "#" anchor
 * linking to that same id. Its scroll margin (`--sticky-header-offset`) keeps the heading clear of a
 * stuck site header when the anchor (or a Toc entry) is followed; with no stuck header it is 0.
 */
export function Heading({ as: Tag, id, children, className, ...props }: HeadingProps) {
  return (
    <Tag
      id={id}
      className={cn(
        "group relative scroll-mt-(--sticky-header-offset) font-semibold tracking-tight",
        className
      )}
      {...props}
    >
      {children}
      {id && (
        <a
          href={`#${id}`}
          aria-label={anchorLabel(children)}
          className="ml-2 text-muted-foreground no-underline opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          #
        </a>
      )}
    </Tag>
  )
}

/**
 * The static twin of `Heading`: keeps the same `id` but no hover "#" anchor — a feed reader has
 * no page to scroll, and the anchor's `group`/hover affordance means nothing there either.
 */
export function StaticHeading({ as: Tag, id, children, className, ...props }: HeadingProps) {
  return (
    <Tag id={id} className={cn("font-semibold tracking-tight", className)} {...props}>
      {children}
    </Tag>
  )
}
