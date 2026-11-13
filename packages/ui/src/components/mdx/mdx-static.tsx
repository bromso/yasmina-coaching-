import type { ComponentPropsWithoutRef, ComponentType, ReactNode } from "react"
import { Callout } from "./callout"
import { Card, Cards } from "./cards"
import { CodeBlockFrame } from "./code-block-frame"
import { Endpoint } from "./endpoint"
import { StaticHeading } from "./heading"
import { MdxCode } from "./inline-code"
import { MdxLink } from "./link"
import { StaticMdxImage } from "./mdx-image"
import { MdxLi, MdxOl, MdxParagraph, MdxUl } from "./prose"
import { SchemaTable } from "./schema-table"
import { Step, Steps } from "./steps"
import { MdxTable, MdxTbody, MdxTd, MdxTh, MdxThead, MdxTr } from "./table"
import { Tab, TabsStacked } from "./tabs-stacked"

function staticHeading(as: "h2" | "h3" | "h4") {
  function MdxStaticHeading(
    props: Omit<ComponentPropsWithoutRef<"h2">, "children"> & { children: ReactNode }
  ) {
    return <StaticHeading as={as} {...props} />
  }
  MdxStaticHeading.displayName = `MdxStatic${as.toUpperCase()}`
  return MdxStaticHeading
}

/**
 * The server-safe twin of `mdxComponents` (`./index`), for rendering outside Next's page
 * pipeline — a route handler has no paired "ssr" bundle to resolve a Client Component reference
 * back to its real implementation, so calling one directly throws ("Attempted to call X() from
 * the server but X is on the client"). Every entry here, and everything *it* imports, is a plain
 * component with no `"use client"` directive anywhere in the graph — `mdx-static.test.tsx` walks
 * that graph and fails the build if one ever sneaks back in.
 *
 * The differences from `mdxComponents`: headings drop their hover "#" anchor (`StaticHeading`),
 * images are always `loading="lazy"` regardless of what the author set (`StaticMdxImage`), and
 * `pre`/`Tabs`/`Tab` are `CodeBlockFrame`/`TabsStacked`/`Tab` — the exact same pre-hydration
 * output `CodeBlock` and `Tabs` fall back to, just without the hooks that gate it there. `code`,
 * the table elements, `Callout`, `Cards`, `Card`, `Endpoint` and `SchemaTable` are identical to
 * the interactive map: all are already pure.
 */
// biome-ignore lint/suspicious/noExplicitAny: matches mdxComponents' own Record<string, ComponentType<any>>
export const mdxStaticComponents: Record<string, ComponentType<any>> = {
  h2: staticHeading("h2"),
  h3: staticHeading("h3"),
  h4: staticHeading("h4"),
  pre: CodeBlockFrame,
  code: MdxCode,
  p: MdxParagraph,
  ul: MdxUl,
  ol: MdxOl,
  li: MdxLi,
  img: StaticMdxImage,
  a: MdxLink,
  table: MdxTable,
  thead: MdxThead,
  tbody: MdxTbody,
  tr: MdxTr,
  th: MdxTh,
  td: MdxTd,
  Callout,
  Tabs: TabsStacked,
  Tab,
  Steps,
  Step,
  Cards,
  Card,
  Endpoint,
  SchemaTable,
}
