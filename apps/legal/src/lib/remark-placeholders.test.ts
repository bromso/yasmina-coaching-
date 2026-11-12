import { describe, expect, test } from "bun:test"
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
