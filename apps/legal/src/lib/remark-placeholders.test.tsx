import { describe, expect, test } from "bun:test"
import { evaluate } from "@mdx-js/mdx"
import { Placeholder } from "@repo/ui/components/placeholder"
import * as runtime from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import { type MdastNode, remarkPlaceholders } from "./remark-placeholders"

const text = (value: string): MdastNode => ({ type: "text", value })
const mark = (value: string): MdastNode => ({
  type: "placeholder",
  data: { hName: "mark", hProperties: { dataPlaceholder: "" } },
  children: [text(value)],
})

function run(tree: MdastNode): MdastNode {
  remarkPlaceholders()(tree)
  return tree
}

describe("remarkPlaceholders", () => {
  test("wraps each placeholder in a paragraph's text in a mark, keeping the text around it", () => {
    const tree = run({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [text("Org.nr [ATT FYLLA: nummer], adress [ATT FYLLA: gata].")],
        },
      ],
    })
    expect(tree.children?.[0]?.children).toEqual([
      text("Org.nr "),
      mark("[ATT FYLLA: nummer]"),
      text(", adress "),
      mark("[ATT FYLLA: gata]"),
      text("."),
    ])
  })

  test("reaches nested text (lists, emphasis, headings) and English markers", () => {
    const tree = run({
      type: "root",
      children: [
        {
          type: "list",
          children: [
            { type: "listItem", children: [{ type: "strong", children: [text("[TO FILL: x]")] }] },
          ],
        },
      ],
    })
    expect(tree.children?.[0]?.children?.[0]?.children?.[0]?.children).toEqual([
      mark("[TO FILL: x]"),
    ])
  })

  test("leaves code alone, and text without a placeholder untouched", () => {
    const code = { type: "inlineCode", value: "[TO FILL: x]" }
    const plain = text("No placeholder here.")
    const tree = run({ type: "root", children: [{ type: "paragraph", children: [code, plain] }] })
    expect(tree.children?.[0]?.children).toEqual([code, plain])
  })
})

describe("remarkPlaceholders through MDX", () => {
  // The real compile: @mdx-js/mdx (what fumadocs-mdx runs) with the plugin, rendered with the
  // `mark` → `Placeholder` mapping the page uses.
  async function render(source: string): Promise<string> {
    const { default: Content } = await evaluate(source, {
      ...runtime,
      remarkPlugins: [remarkPlaceholders],
    })
    return renderToStaticMarkup(<Content components={{ mark: Placeholder }} />)
  }

  test("turns a placeholder into Placeholder's <mark data-placeholder>", async () => {
    const html = await render("Org.nr [ATT FYLLA: x], i Sverige.\n\n- **[TO FILL: y]**\n")
    expect(html).toMatch(
      /<p>Org.nr <mark data-placeholder="" class="[^"]*bg-sun[^"]*">\[ATT FYLLA: x\]<\/mark>, i Sverige.<\/p>/
    )
    expect(html).toMatch(/<strong><mark data-placeholder=""[^>]*>\[TO FILL: y\]<\/mark><\/strong>/)
  })

  test("leaves inline code and code blocks alone", async () => {
    const html = await render("`[ATT FYLLA: x]`\n\n```\n[ATT FYLLA: y]\n```\n")
    expect(html).not.toContain("<mark")
    expect(html).toContain("[ATT FYLLA: x]")
    expect(html).toContain("[ATT FYLLA: y]")
  })
})
