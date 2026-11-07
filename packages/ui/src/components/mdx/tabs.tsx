"use client"

import { TabsContent, TabsList, Tabs as TabsRoot, TabsTrigger } from "@repo/ui/components/tabs"
import { cn } from "@repo/ui/lib/utils"
import { Children, type ReactElement, type ReactNode, useEffect, useState } from "react"
import { isTabElement, tabTriggers } from "./tab-panel"
import { type TabProps, TabsStacked } from "./tabs-stacked"

export type { TabProps } from "./tabs-stacked"
export { TabsStacked } from "./tabs-stacked"

/**
 * This `Tabs`'s own `<Tab>` — a separate Client Component from `tabs-stacked.tsx`'s pure one,
 * not reused. An MDX body compiles to a Server Component, which builds `<Tab>` elements for
 * whatever `mdxComponents.Tab` maps to; a *plain* `Tab` (no "use client" of its own) passed as
 * this `Tabs`'s `children` is, from React's perspective, just another Server Component, and
 * gets rendered away on the server before crossing to the client at all — the element, and its
 * `value`, never arrive here. Marking `Tab` itself a Client Component is what lets the element
 * survive that crossing (as a `React.lazy`-wrapped reference) with its props intact — though
 * `child.type` becomes that opaque wrapper, never `===` anything importable, so `tabPanels` (and
 * `TabsStacked`'s own, for the pre-hydration fallback below) matches by `props.value` instead —
 * see `./tab-panel`. The static feed renderer has no such crossing (nothing in its graph is a
 * Client Component), so it keeps the plain `Tab` in `tabs-stacked.tsx`.
 */
export function Tab({ children }: TabProps) {
  return <>{children}</>
}

function tabPanels(children: ReactNode): ReactElement<TabProps>[] {
  return Children.toArray(children).filter(isTabElement)
}

export type TabsProps = {
  /** Optional: orders the triggers. Every `<Tab>` gets a trigger from its own `value` either way
   * (see `tabTriggers`), so a missing or mismatched `items` cannot leave a panel unreachable. */
  items?: string[]
  children: ReactNode
}

/**
 * A tabbed group of `<Tab>` panels. Before hydration (`isHydrated` false, including the server
 * render) every panel is shown stacked via `TabsStacked` — the content is fully present without
 * JavaScript. After mount it switches to the interactive tablist.
 */
export function Tabs({ items, children }: TabsProps) {
  const [isHydrated, setIsHydrated] = useState(false)
  useEffect(() => setIsHydrated(true), [])

  if (!isHydrated) return <TabsStacked>{children}</TabsStacked>

  const panels = tabPanels(children)
  const values = panels.map((panel) => panel.props.value)

  return (
    <TabsRoot defaultValue={values[0]} className={cn("my-4")}>
      <TabsList>
        {tabTriggers(values, items).map((item) => (
          <TabsTrigger key={item} value={item}>
            {item}
          </TabsTrigger>
        ))}
      </TabsList>
      {panels.map((panel) => (
        <TabsContent key={panel.props.value} value={panel.props.value}>
          {panel.props.children}
        </TabsContent>
      ))}
    </TabsRoot>
  )
}
