import { isValidElement, type ReactElement, type ReactNode } from "react"
import type { TabProps } from "./tabs-stacked"

/** A React element's `type`, when it is a Client Reference: Next wraps one in `React.lazy`, so
 * it is an object carrying this `$$typeof`, never a function — see `isTabElement`. */
const REACT_LAZY = Symbol.for("react.lazy")

function isComponentType(type: unknown): boolean {
  if (typeof type === "function") return true
  return (
    typeof type === "object" &&
    type !== null &&
    (type as { $$typeof?: unknown }).$$typeof === REACT_LAZY
  )
}

/**
 * Whether `node` is a `<Tab value="…">` panel — checked by shape (a component-typed element —
 * a function, or a `React.lazy`-wrapped Client Reference, never a host element like `<div>` or
 * `<input>` — whose `props` carries a string `value`), not by `type` identity. Two different
 * `Tab` implementations exist (the interactive one in `tabs.tsx`, a Client Component; the pure
 * one in `tabs-stacked.tsx`, for the static feed renderer — see the comment on `tabs.tsx`'s `Tab`
 * for why), and an MDX body (a Server Component) builds `<Tab>` elements for whichever one
 * `mdxComponents` / `mdxStaticComponents` maps to. When such an element crosses into a Client
 * Component's `children` (`<Tabs>`, or `<TabsStacked>` rendering `Tabs`'s own pre-hydration
 * fallback), Next wraps a Client Component reference in `React.lazy`, so `child.type` is an
 * opaque lazy wrapper, never `===` anything this module could import directly, and not even a
 * function to brand with a marker property — only `child.props` survives that crossing intact
 * and inspectable before React has rendered the element. The component-type check rules out a
 * host element (a string `type`) that happens to carry a `value` prop, like `<input value="x" />`;
 * `value` itself is specific enough in context (always a direct child of `<Tabs>`) that this does
 * not need to be exhaustive beyond that — it only has to tell a `Tab` apart from stray text or an
 * unrelated element.
 */
export function isTabElement(node: ReactNode): node is ReactElement<TabProps> {
  if (!isValidElement(node)) return false
  if (!isComponentType(node.type)) return false
  const props = node.props
  return (
    typeof props === "object" &&
    props !== null &&
    typeof (props as { value?: unknown }).value === "string"
  )
}

/**
 * The values `<Tabs>` makes triggers for: one per panel, always, so every panel is reachable
 * whatever `items` says. `items`, when given, only orders them — values it names come first, in
 * its order; panels it does not name follow in document order; names matching no panel are
 * ignored.
 */
export function tabTriggers(panelValues: string[], items?: string[]): string[] {
  const values = [...new Set(panelValues)]
  if (!items) return values
  const present = new Set(values)
  const ordered = [...new Set(items)].filter((item) => present.has(item))
  const named = new Set(ordered)
  return [...ordered, ...values.filter((value) => !named.has(value))]
}
