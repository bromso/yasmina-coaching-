import { describe, expect, test } from "bun:test"
import type { ComponentType, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { mdxComponents } from "./index"
import { mdxStaticComponents } from "./mdx-static"

/** One entry of a component map; a missing one fails the test rather than render a bare tag. */
function entry(
  components: typeof mdxComponents,
  tag: string
): ComponentType<{ children: ReactNode }> {
  const component = components[tag]
  if (!component) throw new Error(`no MDX component for <${tag}>`)
  return component
}

/** A markdown table as the MDX compiler emits it, rendered through one component map. */
function table(components: typeof mdxComponents): string {
  const Table = entry(components, "table")
  const Thead = entry(components, "thead")
  const Tbody = entry(components, "tbody")
  const Tr = entry(components, "tr")
  const Th = entry(components, "th")
  const Td = entry(components, "td")
  return renderToStaticMarkup(
    <Table>
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Duration</Th>
        </Tr>
      </Thead>
      <Tbody>
        <Tr>
          <Td>session</Td>
          <Td>30 days</Td>
        </Tr>
      </Tbody>
    </Table>
  )
}

describe("the MDX table", () => {
  const html = table(mdxComponents)

  test("scrolls sideways inside its own wrapper, reachable by keyboard", () => {
    expect(html).toMatch(/^<div data-slot="mdx-table"[^>]*tabindex="0"/)
    expect(html).toMatch(/^<div[^>]*class="[^"]*overflow-x-auto/)
    expect(html).toContain("<table")
  })

  test("every header cell is a column header", () => {
    expect(html.match(/<th scope="col"/g)).toHaveLength(2)
  })

  test("is styled from tokens: borders, a muted header row", () => {
    expect(html).toMatch(/<thead class="[^"]*bg-muted/)
    expect(html).toMatch(/<tr class="[^"]*border-b/)
    expect(html).toMatch(/<td class="[^"]*px-3/)
  })

  test("keeps inline code on one line inside it", () => {
    expect(html).toMatch(/<table class="[^"]*\[&amp;_code\]:whitespace-nowrap/)
  })

  test("the static map renders the same table", () => {
    expect(table(mdxStaticComponents)).toBe(html)
  })
})
