import { Children, type ReactElement, type ReactNode } from "react"
import { isTabElement } from "./tab-panel"

export type TabProps = { value: string; children: ReactNode }

/** One labelled panel inside the static `<TabsStacked>`. Only meaningful as a direct child of
 * it. A pure component, so it belongs in `mdxStaticComponents` too — see `./tabs.tsx` for why
 * the interactive `<Tabs>` has its own, separate `Tab`. */
export function Tab({ children }: TabProps) {
  return <>{children}</>
}

/** Only a `Tab` panel (either implementation — see `./tab-panel`) becomes a panel; anything else
 * (stray text, other elements) is ignored. */
function tabPanels(children: ReactNode): ReactElement<TabProps>[] {
  return Children.toArray(children).filter(isTabElement)
}

/**
 * Every `<Tab>` panel stacked, each preceded by its label as a heading — the pre-hydration
 * output `Tabs` itself falls back to (including the server render, since its effect hasn't run
 * yet), extracted here so it has one source and no Client Component in its own graph: it is also
 * `mdxStaticComponents.Tabs` directly, for the feed renderer.
 */
export function TabsStacked({ children }: { children: ReactNode }) {
  return (
    <div data-slot="tabs" className="my-4 flex flex-col gap-6">
      {tabPanels(children).map((panel) => (
        <section key={panel.props.value}>
          <h4 className="mb-2 text-sm font-semibold">{panel.props.value}</h4>
          <div>{panel.props.children}</div>
        </section>
      ))}
    </div>
  )
}
