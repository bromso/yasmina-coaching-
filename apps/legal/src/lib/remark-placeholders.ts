// Imported by source.config.ts, which fumadocs bundles with esbuild leaving packages external: the
// pattern comes by relative path, not "@repo/content/legal", for the reason given there.
import { PLACEHOLDER_PATTERN } from "../../../../packages/content/src/legal"

/** The slice of an mdast node this plugin reads and writes. */
export type MdastNode = {
  type: string
  value?: string
  children?: MdastNode[]
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

/** `value` split around its placeholders, each one a node that becomes `<mark data-placeholder>`. */
function split(value: string): MdastNode[] {
  const nodes: MdastNode[] = []
  let last = 0
  // matchAll copies the regex, so the shared global pattern's lastIndex is never touched.
  for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
    const start = match.index
    if (start > last) nodes.push({ type: "text", value: value.slice(last, start) })
    nodes.push({
      type: "placeholder",
      data: { hName: "mark", hProperties: { dataPlaceholder: "" } },
      children: [{ type: "text", value: match[0] }],
    })
    last = start + match[0].length
  }
  if (nodes.length === 0) return [{ type: "text", value }]
  if (last < value.length) nodes.push({ type: "text", value: value.slice(last) })
  return nodes
}

function walk(node: MdastNode): void {
  if (!node.children) return
  node.children = node.children.flatMap((child) => {
    if (child.type === "text" && child.value) return split(child.value)
    walk(child)
    return [child]
  })
}

/**
 * A remark plugin: every `[ATT FYLLA: …]` / `[TO FILL: …]` in a page's text becomes a `<mark
 * data-placeholder>`, which the page renders as `@repo/ui`'s `Placeholder` (the MDX `mark`
 * component). Code is left alone: inline code and code blocks carry a `value`, not text children.
 * A malformed placeholder is marked too; the build gate (`createLegal`) refuses it anyway.
 */
export function remarkPlaceholders() {
  return (tree: MdastNode): void => walk(tree)
}
