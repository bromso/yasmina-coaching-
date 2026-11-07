import { describe, expect, test } from "bun:test"
import { extractImages, extractLinks, headingProblems, imageProblems } from "./checks"

describe("extractLinks", () => {
  test("finds markdown links and href attributes", () => {
    const source = [
      'See [the guides](/tags/guides) and [docs](http://docs.brand.localhost:3004/ "Docs").',
      "<a href=\"/authors/team\">Team</a> and <Card href='/rss.xml' />",
    ].join("\n")
    expect(extractLinks(source)).toEqual([
      "/tags/guides",
      "http://docs.brand.localhost:3004/",
      "/authors/team",
      "/rss.xml",
    ])
  })

  test("ignores fenced code blocks and inline code", () => {
    const source = [
      "[real](/real)",
      "```md",
      "[fake](/fenced)",
      '<a href="/fenced-href">x</a>',
      "```",
      "~~~",
      "[fake](/tilde)",
      "~~~",
      "Inline `[fake](/inline)` code.",
    ].join("\n")
    expect(extractLinks(source)).toEqual(["/real"])
  })

  test("ignores images, which are files rather than pages", () => {
    expect(extractLinks("![A photo](/images/photo.png) and [a page](/page)")).toEqual(["/page"])
  })
})

describe("linked images", () => {
  const source = "[![badge](/b.png)](/target)"

  test("the outer link is a link", () => {
    expect(extractLinks(source)).toEqual(["/target"])
  })

  test("the inner image is an image", () => {
    expect(extractImages(source)).toEqual(["/b.png"])
  })
})

describe("reference-style links", () => {
  test("a definition's target is a link", () => {
    const source = [
      "See [the guides][g] and [team].",
      "",
      '[g]: /tags/guides "Guides"',
      "[team]: <https://example.org/team>",
    ].join("\n")
    expect(extractLinks(source)).toEqual(["/tags/guides", "https://example.org/team"])
  })

  test("a footnote is not a definition", () => {
    expect(extractLinks("Text.[^1]\n\n[^1]: A footnote, not a link.")).toEqual([])
  })

  test("a definition inside a code fence is ignored", () => {
    expect(extractLinks(["```", "[g]: /fenced", "```"].join("\n"))).toEqual([])
  })
})

describe("extractImages", () => {
  test("finds markdown images and src attributes, skipping code", () => {
    const source = [
      '![A photo](/images/photo.png "Title")',
      '<MdxImage src="/images/chart.svg" width={10} height={10} alt="" />',
      "`![inline](/inline.png)`",
      "```",
      "![fenced](/fenced.png)",
      "```",
    ].join("\n")
    expect(extractImages(source)).toEqual(["/images/photo.png", "/images/chart.svg"])
  })
})

describe("imageProblems", () => {
  const exists = (path: string) => path === "/authors/team.svg"

  test("a root-relative image missing from public/ is reported", () => {
    expect(imageProblems("a.mdx", ["/authors/team.svg", "/missing.png"], exists)).toEqual([
      'a.mdx: image "/missing.png" not found in public/',
    ])
  })

  test("the query string and fragment are ignored, and %-escapes decoded", () => {
    expect(
      imageProblems("a.mdx", ["/authors/team.svg?v=2#x", "/authors/team%2Esvg"], exists)
    ).toEqual([])
  })

  test("remote, protocol-relative and data: images are left alone", () => {
    const srcs = [
      "https://example.org/x.png",
      "//cdn.example.org/x.png",
      "data:image/png;base64,AA",
    ]
    expect(imageProblems("a.mdx", srcs, exists)).toEqual([])
  })
})

describe("headingProblems", () => {
  const pageMessage = 'a.mdx: use "##" for headings — the page title is the page\'s h1'
  const postMessage = 'a.mdx: use "##" for headings — the post title is the page\'s h1'

  test("an ATX h1 in the body is refused, once per page", () => {
    expect(headingProblems("a.mdx", "Intro\n\n# Big\n\ntext\n\n# Another\n")).toEqual([pageMessage])
    expect(headingProblems("a.mdx", "   # Indented up to three spaces\n")).toEqual([pageMessage])
    expect(headingProblems("a.mdx", "#\n")).toEqual([pageMessage])
  })

  test("a setext h1 (a line underlined with =) is refused", () => {
    expect(headingProblems("a.mdx", "Big title\n=========\n")).toEqual([pageMessage])
  })

  test("h2 and deeper, hashtags, code and frontmatter comments are fine", () => {
    const source = [
      "---",
      "title: T",
      "# a YAML comment",
      "---",
      "## Section",
      "### Sub",
      "#hashtag is not a heading",
      "    # indented code",
      "```sh",
      "# a shell comment",
      "```",
      "Use `# not a heading` inline.",
      "",
      "a = b",
      "",
      "===",
    ].join("\n")
    expect(headingProblems("a.mdx", source)).toEqual([])
  })

  test('without titleOwner the message says "page"', () => {
    expect(headingProblems("a.mdx", "# Big\n")).toEqual([pageMessage])
  })

  test('with titleOwner "post" the message says "post"', () => {
    expect(headingProblems("a.mdx", "# Big\n", "post")).toEqual([postMessage])
  })
})
