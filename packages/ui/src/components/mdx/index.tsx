import type { ComponentPropsWithoutRef, ComponentType, ReactNode } from "react"
import { Callout } from "./callout"
import { Card, Cards } from "./cards"
import { CodeBlock } from "./code-block"
import { Endpoint } from "./endpoint"
import { Heading } from "./heading"
import { MdxCode } from "./inline-code"
import { MdxLink } from "./link"
import { MdxImage } from "./mdx-image"
import { MdxLi, MdxOl, MdxParagraph, MdxUl } from "./prose"
import { SchemaTable } from "./schema-table"
import { Step, Steps } from "./steps"
import { Tab, Tabs } from "./tabs"

export { Callout, type CalloutProps, type CalloutType } from "./callout"
export { Card, type CardProps, Cards, type CardsProps } from "./cards"
export { CodeBlock, type CodeBlockProps } from "./code-block"
export { Endpoint, type EndpointProps } from "./endpoint"
export { Heading, type HeadingProps, StaticHeading } from "./heading"
export { MdxCode } from "./inline-code"
export { MdxLink } from "./link"
export { MdxImage, type MdxImageProps, StaticMdxImage } from "./mdx-image"
export { MdxLi, MdxOl, MdxParagraph, MdxUl } from "./prose"
export {
  type JsonSchema,
  type SchemaRow,
  SchemaTable,
  type SchemaTableProps,
  schemaRows,
} from "./schema-table"
export { Step, Steps } from "./steps"
export { Tab, type TabProps, Tabs, type TabsProps, TabsStacked } from "./tabs"

function heading(as: "h2" | "h3" | "h4") {
  function MdxHeading(
    props: Omit<ComponentPropsWithoutRef<"h2">, "children"> & { children: ReactNode }
  ) {
    return <Heading as={as} {...props} />
  }
  MdxHeading.displayName = `Mdx${as.toUpperCase()}`
  return MdxHeading
}

/**
 * The component map fumadocs' MDX renderer spreads over its compiled output: heading levels get
 * anchors, `pre` becomes a copyable code block, `code` outside it an inline span, `p` / `ul` /
 * `ol` / `li` get their prose styling, `img` gets required dimensions and lazy loading, links are
 * underlined and external-aware, and `Callout` / `Tabs` / `Steps` / `Cards` / `Card` — and, for
 * API reference pages, `Endpoint` / `SchemaTable` — are available to author directly in MDX
 * bodies. Typed `ComponentType<any>` to match fumadocs' own `MDXComponents` shape — each entry is
 * only ever called with the props its own tag produces.
 *
 * See `./mdx-static` for `mdxStaticComponents`, its server-safe twin for rendering outside Next's
 * page pipeline (the feed routes).
 */
// biome-ignore lint/suspicious/noExplicitAny: matches fumadocs' MDXComponents = Record<string, ComponentType<any>>
export const mdxComponents: Record<string, ComponentType<any>> = {
  h2: heading("h2"),
  h3: heading("h3"),
  h4: heading("h4"),
  pre: CodeBlock,
  code: MdxCode,
  p: MdxParagraph,
  ul: MdxUl,
  ol: MdxOl,
  li: MdxLi,
  img: MdxImage,
  a: MdxLink,
  Callout,
  Tabs,
  Tab,
  Steps,
  Step,
  Cards,
  Card,
  Endpoint,
  SchemaTable,
}
