import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, sep } from "node:path"
import { docFrontmatterSchema } from "@repo/content/schema"
import { publicContract } from "@repo/public-api-contract"
import {
  buildV1OpenAPIDocument,
  buildWebhookEnvelopeSchemas,
} from "@repo/public-api-contract/openapi"
import { WEBHOOK_EVENTS, WebhookEventSchema } from "@repo/public-api-contract/webhooks"
import { mdxStaticComponents } from "@repo/ui/components/mdx/static"
import type { ComponentType } from "react"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { z } from "zod"
import {
  API_BASE_URL,
  codeSpan,
  EVENTS_DIR,
  EXAMPLE_API_KEY,
  EXAMPLE_DATE,
  EXAMPLE_EXPIRY,
  envelopeExample,
  eventSlug,
  exampleFor,
  generateApiReference,
  jsLiteral,
  mdxText,
  OPERATION_ORDER,
  operationExample,
  operationsOf,
  REFERENCE_DIR,
  renderEventPage,
  renderOperationPage,
  slugFor,
} from "./api-reference"
import { assembleDocs, type DocInput, type EntryKind, type MetaInput } from "./docs-core"

const APP_DIR = join(import.meta.dir, "../..")
const DOCS_DIR = join(APP_DIR, "content/docs")
const REGENERATE = "Run bun run --filter @repo/docs generate:api"

const FRONTMATTER = /^---\n[\s\S]*?\n---\n/

/** The same compiler fumadocs-mdx compiles every page with, resolved from fumadocs-mdx itself
 * (it is fumadocs-mdx's own dependency, not this app's). */
async function mdxCompiler(): Promise<{
  compile: (source: string) => Promise<unknown>
  evaluate: (source: string, options: Record<string, unknown>) => Promise<{ default: unknown }>
}> {
  const fumadocs = Bun.resolveSync("fumadocs-mdx/package.json", APP_DIR)
  return import(Bun.resolveSync("@mdx-js/mdx", dirname(fumadocs)))
}

async function compileMdx(source: string): Promise<void> {
  // Frontmatter is fumadocs' job (a remark plugin); the body is what MDX itself must parse.
  await (await mdxCompiler()).compile(source.replace(FRONTMATTER, ""))
}

/** A page's body compiled, run and rendered with the static component map, as plain text. */
async function renderedText(source: string): Promise<string> {
  const runtime = await import("react/jsx-runtime")
  const { default: Content } = await (await mdxCompiler()).evaluate(
    source.replace(FRONTMATTER, ""),
    { ...runtime, baseUrl: import.meta.url }
  )
  const html = renderToStaticMarkup(
    createElement(Content as ComponentType<{ components: unknown }>, {
      components: mdxStaticComponents,
    })
  )
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
}

/** A fenced block's content, by its language, from a page. */
function fenced(page: string, lang: string): string[] {
  return [...page.matchAll(new RegExp(`^\`\`\`${lang}\n([\\s\\S]*?)\n\`\`\`$`, "gm"))].map(
    (match) => match[1] as string
  )
}

const doc = await buildV1OpenAPIDocument()
const operations = operationsOf(doc)

/** Each operationId's contract procedure, for its Zod input and output schemas. */
const PROCEDURES = {
  getWorkspace: publicContract.workspace.get,
  listMembers: publicContract.members.list,
  listNotes: publicContract.notes.list,
  getNote: publicContract.notes.get,
  createNote: publicContract.notes.create,
  deleteNote: publicContract.notes.delete,
} as const

function zodOf(operationId: string): { input: z.ZodType; output: z.ZodType } {
  const procedure = PROCEDURES[operationId as keyof typeof PROCEDURES]
  if (!procedure) throw new Error(`no procedure for ${operationId}`)
  const { inputSchema, outputSchema } = procedure["~orpc"]
  return { input: inputSchema as z.ZodType, output: outputSchema as z.ZodType }
}

describe("slugs", () => {
  test("an operationId becomes kebab-case", () => {
    expect(slugFor("createNote")).toBe("create-note")
    expect(slugFor("getWorkspace")).toBe("get-workspace")
    expect(slugFor("listAPIKeys")).toBe("list-api-keys")
  })

  test("an event type becomes kebab-case", () => {
    expect(eventSlug("note.created")).toBe("note-created")
    expect(eventSlug("api_key.revoked")).toBe("api-key-revoked")
    expect(eventSlug("ping")).toBe("ping")
  })
})

describe("operationsOf", () => {
  test("every /v1 route in the curated order: workspace, members, then notes list/get/create/delete", () => {
    expect(operations.map((op) => [op.operationId, op.method, op.path, op.scope])).toEqual([
      ["getWorkspace", "GET", "/v1/workspace", "workspace:read"],
      ["listMembers", "GET", "/v1/members", "members:read"],
      ["listNotes", "GET", "/v1/notes", "notes:read"],
      ["getNote", "GET", "/v1/notes/{id}", "notes:read"],
      ["createNote", "POST", "/v1/notes", "notes:write"],
      ["deleteNote", "DELETE", "/v1/notes/{id}", "notes:write"],
    ])
    expect(operations.map((op) => op.operationId)).toEqual([...OPERATION_ORDER])
  })

  test("each route's errors are the document's: only what that route can answer", () => {
    const errors = Object.fromEntries(operations.map((op) => [op.operationId, op.errors]))
    expect(errors).toEqual({
      getWorkspace: [401, 403, 429, 500, 503],
      listMembers: [400, 401, 403, 429, 500, 503],
      listNotes: [400, 401, 403, 429, 500, 503],
      getNote: [400, 401, 403, 404, 429, 500, 503],
      createNote: [400, 401, 403, 413, 429, 500, 503],
      deleteNote: [400, 401, 403, 404, 429, 500, 503],
    })
    const remove = operations.find((op) => op.operationId === "deleteNote")
    expect(remove?.success).toEqual({ status: 204 })
  })

  test("an operation missing from OPERATION_ORDER is refused, naming it", () => {
    const extra = structuredClone(doc) as { paths: Record<string, Record<string, unknown>> }
    extra.paths["/v1/extra"] = { get: { operationId: "getExtra", responses: {} } }
    expect(() => operationsOf(extra as never)).toThrow("Add getExtra to OPERATION_ORDER")
  })
})

describe("mdxText escapes descriptions for MDX prose", () => {
  test("braces, angle brackets, pipes and stray backticks are escaped; code spans are kept", () => {
    expect(mdxText("a {b} <c> d|e")).toBe("a \\{b\\} \\<c\\> d\\|e")
    expect(mdxText("pass `cursor` and `{x}`")).toBe("pass `cursor` and `{x}`")
    expect(mdxText("a ` stray")).toBe("a \\` stray")
    expect(mdxText("back\\slash")).toBe("back\\\\slash")
  })

  test("a leading block marker cannot turn the line into a heading, quote or list", () => {
    expect(mdxText("# not a heading")).toBe("\\# not a heading")
    expect(mdxText("> not a quote")).toBe("\\> not a quote")
    expect(mdxText("- not a list")).toBe("\\- not a list")
    expect(mdxText("1. not a list")).toBe("1\\. not a list")
  })

  test("newlines collapse, so a description stays one paragraph", () => {
    expect(mdxText("one\n\n# two")).toBe("one # two")
  })
})

describe("codeSpan", () => {
  test("a fence longer than any backtick run inside, padded when the text starts with one", () => {
    expect(codeSpan("notes:write")).toBe("`notes:write`")
    expect(codeSpan("a`b")).toBe("``a`b``")
    expect(codeSpan("`x")).toBe("`` `x ``")
  })
})

describe("jsLiteral writes a prop value MDX parses back unchanged", () => {
  test("braces, angle brackets and backticks inside strings are unicode-escaped", () => {
    const value = { a: "x{y}<script>`z`", b: [1, null, true], "c-d": "\u2028" }
    const literal = jsLiteral(value)
    expect(literal).not.toMatch(/[<>`\u2028]/)
    expect(literal.replace(/"(?:\\.|[^"\\])*"/g, "")).not.toContain("<")
    // biome-ignore lint/security/noGlobalEval: evaluating our own literal is the point of the test
    expect(eval(`(${literal})`)).toEqual(value)
  })
})

describe("hostile strings: the page compiles, and renders exactly the text given", () => {
  const stray =
    "Use {braces}, <script>alert(1)</script>, a ` stray backtick, a | pipe and `code {x}`."
  // Without a stray backtick, every character must come back as written (code spans as text).
  const hostile =
    "Use {braces}, <script>alert(1)</script>, a | pipe, \\, &copy; &#169; R&D and `code {x}`."
  const hostileText =
    "Use {braces}, <script>alert(1)</script>, a | pipe, \\, &copy; &#169; R&D and code {x}."
  const base = operations.find((o) => o.operationId === "getNote")
  if (!base) throw new Error("getNote missing")

  test("an operation page with a hostile summary, description, path, scope, field and enum", async () => {
    const page = renderOperationPage({
      ...base,
      summary: "Get {it} <b>",
      description: `${hostile} More: {y} <i>.`,
      path: "/v1/x{y}/<b>/`t`/{id}",
      scope: "notes:{w}<i>`s`",
      requestBody: {
        type: "object",
        properties: {
          "ti{t}<le>|`": { type: "string", description: hostile },
          kind: { type: "string", enum: ["a{b}<c>", "d`e"] },
        },
        required: ["ti{t}<le>|`"],
      },
    })
    await compileMdx(page)
    expect(page.replace(FRONTMATTER, "")).not.toContain("<script>")
    const text = await renderedText(page)
    for (const expected of [
      hostileText,
      "More: {y} <i>.",
      "/v1/x{y}/<b>/`t`/{id}",
      "notes:{w}<i>`s`",
      "ti{t}<le>|`",
      "a{b}<c>",
      "d`e",
      "the key does not have the notes:{w}<i>`s` scope.",
    ])
      expect(text).toContain(expected)
    // The frontmatter is valid and holds the text as given.
    const front = page.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? ""
    const fields = Object.fromEntries(
      front.split("\n").map((line) => {
        const at = line.indexOf(": ")
        return [line.slice(0, at), JSON.parse(line.slice(at + 2))]
      })
    )
    expect(docFrontmatterSchema.parse(fields).title).toBe("Get {it} <b>")
  })

  test("a stray backtick still compiles (it pairs as Markdown pairs it)", async () => {
    await compileMdx(renderOperationPage({ ...base, description: stray }))
  })

  test("an event page with a hostile field description", async () => {
    const page = renderEventPage("note.created", {
      type: "object",
      properties: { id: { type: "integer", description: hostile } },
      required: ["id"],
    })
    await compileMdx(page)
    expect(page).not.toContain("<script>")
    expect(await renderedText(page)).toContain(hostileText)
  })
})

describe("examples", () => {
  test("fixed values: ids count up from 1, the fixed date, the first enum value", () => {
    expect(
      exampleFor({
        type: "object",
        properties: {
          id: { type: "integer", exclusiveMinimum: 0 },
          otherId: { type: "integer", exclusiveMinimum: 0 },
          at: { type: "string", format: "date-time" },
          kind: { enum: ["a", "b"], type: "string" },
          maybe: { anyOf: [{ type: "string", minLength: 3, maxLength: 5 }, { type: "null" }] },
          list: { type: "array", items: { type: "integer", exclusiveMinimum: 0 } },
          expiresAt: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] },
        },
      })
    ).toEqual({
      id: 1,
      otherId: 2,
      at: EXAMPLE_DATE,
      kind: "a",
      maybe: "examp",
      list: [3],
      // 90 days after the other dates: a key never expires the moment it is created.
      expiresAt: EXAMPLE_EXPIRY,
    })
    expect(Date.parse(EXAMPLE_EXPIRY) - Date.parse(EXAMPLE_DATE)).toBe(90 * 24 * 60 * 60_000)
  })

  test("the request and response each reference page shows validate against the contract", () => {
    const files = generateApiReference(doc)
    for (const op of operations) {
      const page = files[`${REFERENCE_DIR}/${slugFor(op.operationId)}.mdx`] as string
      const { input, output } = zodOf(op.operationId)
      // The request, read back from the page's own curl: path parameters, query and body.
      const curl = fenced(page, "bash")[0] ?? ""
      const url = new URL(curl.match(/curl -X \w+ "([^"]+)"/)?.[1] ?? "")
      const pattern = new RegExp(`^${op.path.replace(/\{(\w+)\}/g, "(?<$1>[^/]+)")}$`)
      const matched = url.pathname.match(pattern)
      const pathParams = matched?.groups ?? {}
      expect({ operationId: op.operationId, matched: matched !== null }).toEqual({
        operationId: op.operationId,
        matched: true,
      })
      const quoted = curl.match(/-d '((?:[^']|'\\'')*)'/)?.[1]
      const body = quoted ? JSON.parse(quoted.replace(/'\\''/g, "'")) : {}
      const request = { ...pathParams, ...Object.fromEntries(url.searchParams), ...body }
      expect(input.safeParse(request).error).toBe(undefined)
      // The response, read back from the page's JSON block.
      const [response] = fenced(page, "json")
      if (op.success.status === 204) expect(response).toBeUndefined()
      else expect(output.safeParse(JSON.parse(response ?? "null")).error).toBe(undefined)
    }
  })

  test("every event page's example envelope validates against the webhook event schema", () => {
    const files = generateApiReference(doc)
    for (const type of WEBHOOK_EVENTS) {
      const page = files[`${EVENTS_DIR}/${eventSlug(type)}.mdx`] as string
      const [shown] = fenced(page, "json")
      const envelope = JSON.parse(shown ?? "null")
      expect(WebhookEventSchema.safeParse(envelope).error).toBe(undefined)
      expect(envelope).toEqual(envelopeExample(type))
      expect(envelope.type).toBe(type)
    }
  })

  test("the envelope table is the contract's envelope schema, not a copy", () => {
    const envelopes = buildWebhookEnvelopeSchemas()
    const page = renderEventPage("ping", envelopes.ping as never)
    expect(generateApiReference(doc)[`${EVENTS_DIR}/ping.mdx`]).toBe(page)
  })

  test("no example carries an email address", () => {
    const all = JSON.stringify([
      ...operations.map(operationExample),
      ...WEBHOOK_EVENTS.map(envelopeExample),
    ])
    expect(all).not.toContain("@")
  })

  test("the fake key has the real format (so the scanner rule and the gitleaks:allow marker are tested)", () => {
    expect(EXAMPLE_API_KEY).toMatch(/^bb_live_[0-9A-Za-z]{8}_[A-Za-z0-9_-]{43}$/)
  })
})

/** The page's errors list, one entry per line. */
const errorLines = (page: string) =>
  page
    .slice(page.indexOf("## Errors"))
    .split("\n")
    .filter((line) => line.startsWith("- "))

describe("generated pages", () => {
  const files = generateApiReference(doc)

  test("one page per operation and per event, plus each folder's meta.json", () => {
    expect(Object.keys(files).sort()).toEqual(
      [
        ...operations.map((op) => `${REFERENCE_DIR}/${slugFor(op.operationId)}.mdx`),
        `${REFERENCE_DIR}/meta.json`,
        ...WEBHOOK_EVENTS.map((type) => `${EVENTS_DIR}/${eventSlug(type)}.mdx`),
        `${EVENTS_DIR}/meta.json`,
      ].sort()
    )
    expect(JSON.parse(files[`${REFERENCE_DIR}/meta.json`] as string).pages).toEqual(
      operations.map((op) => slugFor(op.operationId))
    )
    expect(JSON.parse(files[`${EVENTS_DIR}/meta.json`] as string).pages).toEqual(
      WEBHOOK_EVENTS.map(eventSlug)
    )
  })

  test("deterministic: generating twice gives the same bytes", async () => {
    expect(generateApiReference(await buildV1OpenAPIDocument())).toEqual(files)
  })

  test("a reference page: purpose, endpoint, tables, a complete example, the security note, errors", () => {
    const page = files[`${REFERENCE_DIR}/create-note.mdx`] as string
    expect(page).toContain('title: "Create a note"')
    expect(page).toContain('<Endpoint method={"POST"} path={"/v1/notes"} scope={"notes:write"} />')
    expect(page).toContain("<SchemaTable")
    expect(page).toContain(`curl -X POST "${API_BASE_URL}/v1/notes"`)
    expect(page).toContain('-H "Authorization: Bearer $API_KEY"')
    expect(page).toContain('-H "content-type: application/json"')
    expect(page).toContain("-d '")
    expect(page).toContain("Keep your API key secret")
    // The security note sits right after the example request.
    expect(page.indexOf("Keep your API key secret")).toBeGreaterThan(page.indexOf("curl -X POST"))
    expect(page.indexOf("Keep your API key secret")).toBeLessThan(page.indexOf("## Response"))
    expect(errorLines(page)).toEqual([
      "- `400` `validation_failed` — the body is invalid. The `message` is `Input validation failed` and does not name the field; check the request against the rules in the tables above. A body that is not valid JSON gets `Malformed request. Ensure the request body is properly formatted and the 'Content-Type' header is set correctly.` instead.",
      "- `401` `unauthorized` — the API key is missing, malformed, unknown, revoked or expired, or the key's workspace was deleted or its plan no longer includes API access.",
      "- `403` `forbidden_scope` — the key does not have the `notes:write` scope.",
      "- `413` `validation_failed` — the request body is larger than the API accepts. A body over the server's hard limit may be refused with an empty `413`, with no JSON body.",
      "- `429` `rate_limited` — too many requests with this key, or too many refused attempts from your address; wait the number of seconds in the `Retry-After` header, then retry.",
      "- `500` `internal` — an unexpected error on our side; retry later.",
      "- `503` `internal` — the request took too long to answer. It may still have taken effect, so check before you retry a change.",
    ])
    // The fake key's line carries the scanner marker.
    const keyLine = page.split("\n").find((line) => line.includes(EXAMPLE_API_KEY))
    expect(keyLine).toContain("{/* gitleaks:allow */}")
  })

  test("get-workspace has no input, so no 400; list and get name their own inputs", () => {
    const statuses = (slug: string) =>
      errorLines(files[`${REFERENCE_DIR}/${slug}.mdx`] as string).map((line) => line.slice(3, 6))
    expect(statuses("get-workspace")).toEqual(["401", "403", "429", "500", "503"])
    expect(errorLines(files[`${REFERENCE_DIR}/list-notes.mdx`] as string)[0]).toBe(
      "- `400` `validation_failed` — a query parameter (`cursor`, `limit`) is invalid. The `message` is `Input validation failed` and does not name the field; check the request against the rules in the tables above."
    )
    expect(errorLines(files[`${REFERENCE_DIR}/get-note.mdx`] as string)[0]).toBe(
      "- `400` `validation_failed` — the `id` path parameter is invalid. The `message` is `Input validation failed` and does not name the field; check the request against the rules in the tables above."
    )
    expect(statuses("get-note")).toContain("404")
    expect(statuses("list-notes")).not.toContain("404")
  })

  test("an event page: payload table, example envelope and the verify-first note beside it", () => {
    const page = files[`${EVENTS_DIR}/note-created.mdx`] as string
    expect(page).toContain('title: "note.created"')
    expect(page).toContain("<SchemaTable")
    expect(page).toContain('"type": "note.created"')
    expect(page).toContain(`"timestamp": "${EXAMPLE_DATE}"`)
    const example = page.indexOf('"type": "note.created"')
    const note = page.indexOf("Verify the signature first")
    expect(note).toBeGreaterThan(example)
  })

  test("every generated page compiles as MDX", async () => {
    for (const [path, content] of Object.entries(files))
      if (path.endsWith(".mdx")) await compileMdx(content)
  })
})

/** Every file under `dir` (relative to the app), recursively, with `/` separators. */
function listUnder(dir: string): string[] {
  const root = join(APP_DIR, dir)
  if (!existsSync(root)) return []
  // Dotfiles (a macOS `.DS_Store`, an editor's swap file) are never pages; the generator leaves
  // them alone, so they are not stale either.
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => !path.split(sep).some((part) => part.startsWith(".")))
    .filter((path) => statSync(join(root, path)).isFile())
    .map((path) => `${dir}/${path.split(sep).join("/")}`)
}

describe("drift: the committed pages are exactly what the generator writes", () => {
  const files = generateApiReference(doc)

  test(`every generated file is committed unchanged (${REGENERATE})`, () => {
    for (const [path, content] of Object.entries(files)) {
      const committed = existsSync(join(APP_DIR, path))
        ? readFileSync(join(APP_DIR, path), "utf8")
        : undefined
      if (committed !== content) throw new Error(`${path} is out of date. ${REGENERATE}`)
    }
  })

  test(`no stale page is left behind (${REGENERATE})`, () => {
    const stale = [...listUnder(REFERENCE_DIR), ...listUnder(EVENTS_DIR)].filter(
      (path) => !(path in files)
    )
    if (stale.length > 0) throw new Error(`${stale.join(", ")} is not generated. ${REGENERATE}`)
  })
})

describe("the docs content checks pass with the committed pages", () => {
  test("assembleDocs over every page and meta.json under content/docs", () => {
    const all = listUnder("content/docs").map((path) => path.slice("content/docs/".length))
    const inputs: DocInput[] = all
      .filter((path) => path.endsWith(".mdx"))
      .map((path) => {
        const slug = path.replace(/\.mdx$/, "").replace(/(^|\/)index$/, "")
        const source = readFileSync(join(DOCS_DIR, path), "utf8")
        return { file: `apps/docs/content/docs/${path}`, url: `/${slug}`, source, images: [] }
      })
    const metas: MetaInput[] = all
      .filter((path) => path.endsWith("meta.json"))
      .map((path) => {
        const folder = dirname(path)
        const { pages } = JSON.parse(readFileSync(join(DOCS_DIR, path), "utf8")) as {
          pages?: string[]
        }
        return { file: path, dir: folder === "." ? "" : `/${folder}`, pages }
      })
    const kind = (dir: string, name: string): EntryKind => {
      const base = join(DOCS_DIR, dir, name)
      if (existsSync(base) && statSync(base).isDirectory()) return "folder"
      return existsSync(`${base}.mdx`) ? "page" : undefined
    }
    expect(() =>
      assembleDocs(
        inputs,
        { metas, kind, files: all },
        { hosts: new Set(["docs.brand.localhost:3004"]), ownHost: "docs.brand.localhost:3004" },
        () => true
      )
    ).not.toThrow()
    expect(inputs.some((input) => input.url === "/developers/reference/create-note")).toBe(true)
  })
})
