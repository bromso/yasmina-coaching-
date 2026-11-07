import { describe, expect, test } from "bun:test"
import { ContentError } from "@repo/content/posts"
import {
  assembleDocs,
  type DocInput,
  docsKnownPaths,
  metaFormatProblems,
  metaProblems,
  reservedProblems,
} from "./docs-core"

const FILE = "apps/docs/content/docs/meta.json"

describe("metaProblems", () => {
  const pages = new Set(["/index", "/getting-started", "/guides/deploying"])
  const folders = new Set(["/guides"])
  const exists = (dir: string, name: string) =>
    folders.has(`${dir}/${name}`) ? "folder" : pages.has(`${dir}/${name}`) ? "page" : undefined

  test("accepts separators, rest tokens, link entries and names that exist", () => {
    expect(
      metaProblems(
        [
          {
            file: FILE,
            dir: "",
            pages: [
              "index",
              "---Start here---",
              "---[Rocket]Guides---",
              "---",
              "getting-started",
              "guides",
              "[GitHub](https://x)",
              "external:[Site](https://x)",
              "[Github][Repo](https://x)",
              "!getting-started",
              "...guides",
              "...",
              "z...a",
            ],
          },
          { file: "apps/docs/content/docs/guides/meta.json", dir: "/guides", pages: ["deploying"] },
        ],
        exists
      )
    ).toEqual([])
  })

  test("a meta.json without pages has nothing to check", () => {
    expect(metaProblems([{ file: FILE, dir: "" }], exists)).toEqual([])
  })

  test("reports a missing name with its file", () => {
    expect(
      metaProblems([{ file: FILE, dir: "", pages: ["index", "nope", "guides"] }], exists)
    ).toEqual([`${FILE}: "nope" in pages matches no page or folder`])
  })

  test("!name and ...name are checked by the name after the prefix", () => {
    expect(metaProblems([{ file: FILE, dir: "", pages: ["!gone", "...lost"] }], exists)).toEqual([
      `${FILE}: "!gone" in pages matches no page or folder`,
      `${FILE}: "...lost" must name a folder`,
    ])
  })

  test("...name must name a folder: a page there is ignored by fumadocs, so it is reported", () => {
    expect(
      metaProblems([{ file: FILE, dir: "", pages: ["...getting-started", "...guides"] }], exists)
    ).toEqual([`${FILE}: "...getting-started" must name a folder`])
  })

  test("!name may hide a page or a folder", () => {
    expect(
      metaProblems([{ file: FILE, dir: "", pages: ["!getting-started", "!guides"] }], exists)
    ).toEqual([])
  })

  test("separators follow fumadocs' regex: ---a---b is one, ------ is a name", () => {
    expect(
      metaProblems(
        [{ file: FILE, dir: "", pages: ["---a---b", "---[Icon]x---y", "------"] }],
        exists
      )
    ).toEqual([`${FILE}: "------" in pages matches no page or folder`])
  })

  test("names are looked up in the meta.json's own folder", () => {
    const nested = "apps/docs/content/docs/guides/meta.json"
    expect(
      metaProblems([{ file: nested, dir: "/guides", pages: ["getting-started"] }], exists)
    ).toEqual([`${nested}: "getting-started" in pages matches no page or folder`])
  })
})

describe("metaFormatProblems", () => {
  test("a meta.yaml or meta.yml anywhere under content/docs is refused", () => {
    expect(
      metaFormatProblems([
        "apps/docs/content/docs/meta.json",
        "apps/docs/content/docs/meta.yaml",
        "apps/docs/content/docs/guides/meta.yml",
        "apps/docs/content/docs/guides/deploying.mdx",
        "apps/docs/content/docs/guides/not-meta.yaml",
      ])
    ).toEqual([
      "apps/docs/content/docs/meta.yaml: use meta.json (meta.yaml is not checked)",
      "apps/docs/content/docs/guides/meta.yml: use meta.json (meta.yaml is not checked)",
    ])
  })
})

describe("docsKnownPaths", () => {
  test("every page URL plus /all and /api/search", () => {
    expect([...docsKnownPaths(["/", "/getting-started", "/guides/deploying"])].sort()).toEqual(
      ["/", "/all", "/api/search", "/getting-started", "/guides/deploying"].sort()
    )
  })
})

describe("reservedProblems", () => {
  const page = (url: string, file: string) => ({ url, file: `apps/docs/content/docs/${file}` })

  test("the root metadata routes are reserved too", () => {
    const names = [
      "opengraph-image",
      "twitter-image",
      "manifest.webmanifest",
      "sitemap.xml",
      "robots.txt",
    ]
    expect(reservedProblems(names.map((name) => page(`/${name}`, `${name}.mdx`)))).toEqual(
      names.map(
        (name) =>
          `apps/docs/content/docs/${name}.mdx: "${name}" is reserved (it would be shadowed by a built-in route)`
      )
    )
  })

  test("a top-level page or folder named all, og or api is shadowed by a built-in route", () => {
    expect(
      reservedProblems([
        page("/all", "all.mdx"),
        page("/og", "og/index.mdx"),
        page("/api/search", "api/search.mdx"),
      ])
    ).toEqual([
      `apps/docs/content/docs/all.mdx: "all" is reserved (it would be shadowed by a built-in route)`,
      `apps/docs/content/docs/og/index.mdx: "og" is reserved (it would be shadowed by a built-in route)`,
      `apps/docs/content/docs/api/search.mdx: "api" is reserved (it would be shadowed by a built-in route)`,
    ])
  })

  test("the names are free below the top level, and as part of a longer name", () => {
    expect(
      reservedProblems([
        page("/", "index.mdx"),
        page("/guides/api", "guides/api.mdx"),
        page("/all-pages", "all-pages.mdx"),
        page("/apis", "apis/index.mdx"),
      ])
    ).toEqual([])
  })
})

function doc(slug: string, source: string): DocInput {
  return {
    file: `apps/docs/content/docs/${slug || "index"}.mdx`,
    url: `/${slug}`,
    source: `---\ntitle: ${slug || "Home"}\ndescription: A page\n---\n\n${source}\n`,
    images: [],
  }
}

const known = {
  hosts: new Set(["docs.example.com", "www.example.com"]),
  ownHost: "docs.example.com",
}
const noImages = () => true
const noMetas = { metas: [], kind: () => "page" as const }

function problemsOf(run: () => void): string[] {
  try {
    run()
  } catch (error) {
    if (error instanceof ContentError) return error.problems
    throw error
  }
  return []
}

describe("assembleDocs", () => {
  test("clean pages pass", () => {
    expect(
      problemsOf(() =>
        assembleDocs(
          [doc("", "See [setup](/getting-started)."), doc("getting-started", "## Setup")],
          noMetas,
          known,
          noImages
        )
      )
    ).toEqual([])
  })

  test("a body h1 in one page and a broken link in another make ONE ContentError", () => {
    const problems = problemsOf(() =>
      assembleDocs(
        [doc("", "# Welcome"), doc("getting-started", "See [nowhere](/nope).")],
        noMetas,
        known,
        noImages
      )
    )
    expect(problems).toEqual([
      `apps/docs/content/docs/index.mdx: use "##" for headings — the page title is the page's h1`,
      `apps/docs/content/docs/getting-started.mdx: broken link "/nope"`,
    ])
  })

  test("a link to /all and to another page's #anchor is accepted", () => {
    expect(
      problemsOf(() =>
        assembleDocs(
          [
            doc("", "[Every page](/all) and [setup](/getting-started#install)."),
            doc("getting-started", ""),
          ],
          noMetas,
          known,
          noImages
        )
      )
    ).toEqual([])
  })

  test("a link to a local development host is reported", () => {
    expect(
      problemsOf(() =>
        assembleDocs([doc("", "[Local](http://localhost:3000/x)")], noMetas, known, noImages)
      )
    ).toEqual([
      `apps/docs/content/docs/index.mdx: link "http://localhost:3000/x" points at a local development host`,
    ])
  })

  test("a reserved name joins the same ContentError", () => {
    expect(problemsOf(() => assembleDocs([doc("api", "")], noMetas, known, noImages))).toEqual([
      `apps/docs/content/docs/api.mdx: "api" is reserved (it would be shadowed by a built-in route)`,
    ])
  })

  test("meta.yaml, meta.json and image problems join the same ContentError", () => {
    const page = { ...doc("", "![Diagram](/diagram.png)"), images: ["/diagram.png"] }
    const problems = problemsOf(() =>
      assembleDocs(
        [page],
        {
          metas: [{ file: FILE, dir: "", pages: ["missing"] }],
          kind: () => undefined,
          files: ["apps/docs/content/docs/guides/meta.yaml"],
        },
        known,
        () => false
      )
    )
    expect(problems).toEqual([
      "apps/docs/content/docs/guides/meta.yaml: use meta.json (meta.yaml is not checked)",
      `${FILE}: "missing" in pages matches no page or folder`,
      `apps/docs/content/docs/index.mdx: image "/diagram.png" not found in public/`,
    ])
  })
})
