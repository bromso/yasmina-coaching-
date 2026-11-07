import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Callout } from "./callout"
import { CodeBlock, CopyControls, copyToClipboard } from "./code-block"
import { Heading } from "./heading"
import { mdxComponents } from "./index"
import { MdxCode } from "./inline-code"
import { MdxImage } from "./mdx-image"
import { MdxLi, MdxOl, MdxParagraph, MdxUl } from "./prose"
import { Step, Steps } from "./steps"
import { Tab, Tabs } from "./tabs"

describe("Heading", () => {
  test("renders the heading tag with its id and a hash anchor pointing at it", () => {
    const html = renderToStaticMarkup(
      <Heading as="h2" id="getting-started">
        Getting started
      </Heading>
    )
    expect(html).toMatch(/<h2[^>]*id="getting-started"/)
    expect(html).toContain('href="#getting-started"')
    expect(html).toContain('aria-label="Link to section: Getting started"')
    expect(html).toContain("Getting started")
  })

  test("renders h3/h4 as given, and no anchor without an id", () => {
    const h3 = renderToStaticMarkup(<Heading as="h3">No id</Heading>)
    expect(h3).toMatch(/^<h3/)
    expect(h3).not.toContain("aria-label")

    const h4 = renderToStaticMarkup(
      <Heading as="h4" id="deep">
        Deep
      </Heading>
    )
    expect(h4).toMatch(/^<h4/)
  })

  test("the anchor's name uses the plain text of nested children", () => {
    const html = renderToStaticMarkup(
      <Heading as="h2" id="install">
        Install <code>bun</code> {2}
      </Heading>
    )
    expect(html).toContain('aria-label="Link to section: Install bun 2"')
  })

  test("children with no text fall back to a generic name", () => {
    const html = renderToStaticMarkup(
      <Heading as="h2" id="icon">
        <svg aria-hidden="true" />
      </Heading>
    )
    expect(html).toContain('aria-label="Link to this section"')
  })
})

describe("CodeBlock", () => {
  test("server render is a plain pre with no copy button or live region", () => {
    const html = renderToStaticMarkup(
      <CodeBlock className="shiki">
        <code>console.log(1)</code>
      </CodeBlock>
    )
    expect(html).toContain("<pre")
    expect(html).toContain("console.log(1)")
    expect(html).not.toContain("Copy code")
    expect(html).not.toContain("<button")
    expect(html).not.toContain('role="status"')
  })

  test("renders the optional title", () => {
    const html = renderToStaticMarkup(
      <CodeBlock title="package.json">
        <code>{"{}"}</code>
      </CodeBlock>
    )
    expect(html).toContain("package.json")
  })

  // CodeBlock only renders CopyControls once `isHydrated` is true, which never happens under
  // renderToStaticMarkup (effects don't run). CopyControls is exported from the module so its
  // own markup — the button plus the next-to-it live region — can be checked directly.
  describe("CopyControls (the hydrated render's button + live region)", () => {
    test("idle: labelled 'Copy code', with a present but empty live region (nothing announced)", () => {
      const html = renderToStaticMarkup(<CopyControls status="idle" onCopy={() => {}} />)
      expect(html).toContain('aria-label="Copy code"')
      expect(html).toMatch(/<span[^>]*role="status"[^>]*aria-live="polite"[^>]*><\/span>/)
    })

    test("copied: labelled 'Copied', and the live region announces 'Copied to clipboard'", () => {
      const html = renderToStaticMarkup(<CopyControls status="copied" onCopy={() => {}} />)
      expect(html).toContain('aria-label="Copied"')
      expect(html).toMatch(
        /<span[^>]*role="status"[^>]*aria-live="polite"[^>]*>Copied to clipboard<\/span>/
      )
    })

    test("failed: still 'Copy code', and the live region announces \"Couldn't copy\"", () => {
      const html = renderToStaticMarkup(<CopyControls status="failed" onCopy={() => {}} />)
      expect(html).toContain('aria-label="Copy code"')
      expect(html).not.toContain("Copied to clipboard")
      expect(html).toMatch(/<span[^>]*role="status"[^>]*>Couldn(&#x27;|')t copy<\/span>/)
    })
  })

  describe("copyToClipboard", () => {
    test("resolves true when the clipboard accepts the text", async () => {
      const written: string[] = []
      const clipboard = { writeText: async (text: string) => void written.push(text) }
      expect(await copyToClipboard("bun add x", clipboard)).toBe(true)
      expect(written).toEqual(["bun add x"])
    })

    test("resolves false, never throws, when the clipboard API is missing", async () => {
      expect(await copyToClipboard("x", undefined)).toBe(false)
      expect(await copyToClipboard("x", {} as Pick<Clipboard, "writeText">)).toBe(false)
    })

    test("resolves false when writeText rejects (permission denied)", async () => {
      const clipboard = {
        writeText: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
      }
      expect(await copyToClipboard("x", clipboard)).toBe(false)
    })
  })
})

describe("Callout", () => {
  test("has role=note and renders the title and children", () => {
    const html = renderToStaticMarkup(
      <Callout type="tip" title="Heads up">
        Be careful.
      </Callout>
    )
    expect(html).toContain('role="note"')
    expect(html).toContain("Heads up")
    expect(html).toContain("Be careful.")
  })

  test("defaults to note type without a title", () => {
    const html = renderToStaticMarkup(<Callout>Plain note.</Callout>)
    expect(html).toContain('role="note"')
    expect(html).toContain("Plain note.")
  })
})

describe("Tabs", () => {
  test("server render shows every panel, each preceded by its label as a heading", () => {
    const html = renderToStaticMarkup(
      <Tabs items={["npm", "bun"]}>
        <Tab value="npm">npm install</Tab>
        <Tab value="bun">bun add</Tab>
      </Tabs>
    )
    expect(html).toContain("npm install")
    expect(html).toContain("bun add")
    expect(html).toMatch(/<h\d[^>]*>npm<\/h\d>/)
    expect(html).toMatch(/<h\d[^>]*>bun<\/h\d>/)
    // Not the interactive tablist (that only mounts client-side).
    expect(html).not.toContain('role="tablist"')
  })

  test("ignores a non-Tab child instead of treating it as a panel", () => {
    const html = renderToStaticMarkup(
      <Tabs items={["npm"]}>
        {"a stray string, not a Tab"}
        <Tab value="npm">npm install</Tab>
        <div>not a Tab either</div>
      </Tabs>
    )
    expect(html).toContain("npm install")
    expect(html).not.toContain("not a Tab either")
    expect((html.match(/<h4/g) ?? []).length).toBe(1)
  })
})

describe("Steps", () => {
  test("renders an ordered list with one item per step", () => {
    const html = renderToStaticMarkup(
      <Steps>
        <Step>First</Step>
        <Step>Second</Step>
      </Steps>
    )
    expect(html).toMatch(/<ol/)
    expect((html.match(/<li/g) ?? []).length).toBe(2)
    expect(html).toContain("First")
    expect(html).toContain("Second")
  })
})

describe("MdxImage", () => {
  test("keeps width and height, adds lazy loading and async decoding", () => {
    const html = renderToStaticMarkup(
      <MdxImage src="/cat.png" alt="A cat" width={800} height={400} />
    )
    expect(html).toContain('width="800"')
    expect(html).toContain('height="400"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('decoding="async"')
    expect(html).toContain('alt="A cat"')
  })
})

describe("mdxComponents", () => {
  test("maps h2-h4 to Heading, pre to CodeBlock, img to MdxImage", () => {
    expect(mdxComponents.pre).toBe(CodeBlock)
    expect(mdxComponents.img).toBe(MdxImage)
    expect(mdxComponents.Callout).toBe(Callout)
    expect(mdxComponents.Tabs).toBe(Tabs)
    expect(mdxComponents.Tab).toBe(Tab)
    expect(mdxComponents.Steps).toBe(Steps)
    expect(mdxComponents.Step).toBe(Step)

    const H2 = mdxComponents.h2 as NonNullable<typeof mdxComponents.h2>
    const html = renderToStaticMarkup(<H2 id="x">X</H2>)
    expect(html).toMatch(/<h2[^>]*id="x"/)
  })

  test("the a mapping marks an external link rel=noreferrer with no target", () => {
    const Anchor = mdxComponents.a as NonNullable<typeof mdxComponents.a>
    const external = renderToStaticMarkup(<Anchor href="https://example.com">Out</Anchor>)
    expect(external).toContain('rel="noreferrer"')
    expect(external).not.toContain("target=")

    const internal = renderToStaticMarkup(<Anchor href="/docs/guide">In</Anchor>)
    expect(internal).not.toContain("rel=")
    expect(internal).not.toContain("target=")
  })
})

describe("prose mappings", () => {
  test("maps p, ul, ol, li and code to the prose components", () => {
    expect(mdxComponents.p).toBe(MdxParagraph)
    expect(mdxComponents.ul).toBe(MdxUl)
    expect(mdxComponents.ol).toBe(MdxOl)
    expect(mdxComponents.li).toBe(MdxLi)
    expect(mdxComponents.code).toBe(MdxCode)
  })

  test("lists get their markers back and items their spacing", () => {
    const html = renderToStaticMarkup(
      <>
        <MdxParagraph>Text</MdxParagraph>
        <MdxUl>
          <MdxLi>One</MdxLi>
        </MdxUl>
        <MdxOl className="extra">
          <MdxLi>Two</MdxLi>
        </MdxOl>
      </>
    )
    expect(html).toContain('<p class="leading-7">Text</p>')
    expect(html).toMatch(/<ul class="[^"]*list-disc[^"]*pl-6/)
    expect(html).toMatch(/<ol class="[^"]*list-decimal[^"]*pl-6[^"]*extra"/)
    expect(html).toMatch(/<li class="[^"]*mt-1/)
  })

  test("inline code is a styled span", () => {
    const html = renderToStaticMarkup(
      <MdxParagraph>
        Run <MdxCode>bun dev</MdxCode>
      </MdxParagraph>
    )
    expect(html).toMatch(/<code data-slot="inline-code" class="[^"]*bg-muted[^"]*">bun dev<\/code>/)
  })

  test("code inside a code block keeps Shiki's own markup, visually reset by a pre & variant", () => {
    // MdxCode no longer tells inline and block code apart with a Client-Component Context (that
    // kept it out of the static feed map): both get the same classes, and a `pre &` CSS variant
    // resets the pill back to plain when a real `<pre>` ancestor is present — no JS involved.
    const html = renderToStaticMarkup(
      <CodeBlock className="shiki">
        <MdxCode className="language-ts" style={{ color: "red" }}>
          <span className="line">const a = 1</span>
        </MdxCode>
      </CodeBlock>
    )
    expect(html).toContain('style="color:red"')
    expect(html).toContain('<span class="line">const a = 1</span>')
    expect(html).toContain("language-ts")
    expect(html).toContain("bg-muted")
    expect(html).toContain("[pre_&amp;]:bg-transparent")
  })

  test("links are underlined", () => {
    const Anchor = mdxComponents.a as NonNullable<typeof mdxComponents.a>
    expect(renderToStaticMarkup(<Anchor href="/x">X</Anchor>)).toMatch(/class="[^"]*underline/)
  })
})
