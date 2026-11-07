import { cn } from "@repo/ui/lib/utils"
import type { ReactElement, ReactNode } from "react"

export type TocItem = {
  title: ReactNode
  url: string
  depth: number
}

type TocNode = TocItem & { children: TocNode[] }

/** Turns a flat, document-order list of headings into a tree by comparing each item's depth. */
function buildTree(items: TocItem[]): TocNode[] {
  const root: TocNode[] = []
  const stack: TocNode[] = []

  for (const item of items) {
    const node: TocNode = { ...item, children: [] }
    let top = stack[stack.length - 1]
    while (top && top.depth >= node.depth) {
      stack.pop()
      top = stack[stack.length - 1]
    }
    const parent = stack[stack.length - 1]
    if (parent) {
      parent.children.push(node)
    } else {
      root.push(node)
    }
    stack.push(node)
  }

  return root
}

function TocList({ items, nested = false }: { items: TocNode[]; nested?: boolean }) {
  return (
    <ul className={cn("flex flex-col gap-2", nested && "mt-2 pl-4")}>
      {items.map((item) => (
        <li key={item.url}>
          <a href={item.url} className="text-muted-foreground hover:text-foreground">
            {item.title}
          </a>
          {item.children.length > 0 && <TocList items={item.children} nested />}
        </li>
      ))}
    </ul>
  )
}

export type TocProps = {
  items: TocItem[]
  /** The visible heading above the list. The nav's `aria-label` always reads "On this page". */
  label?: string
}

/** The post page's table of contents, nested by heading depth. Renders nothing for an empty page. */
export function Toc({ items, label = "On this page" }: TocProps): ReactElement | null {
  if (items.length === 0) return null

  const tree = buildTree(items)

  return (
    <nav data-slot="toc" aria-label="On this page" className="text-sm">
      <p className="mb-2 font-semibold">{label}</p>
      <TocList items={tree} />
    </nav>
  )
}
