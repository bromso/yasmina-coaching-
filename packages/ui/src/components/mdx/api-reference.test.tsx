import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Endpoint } from "./endpoint"
import { mdxComponents } from "./index"
import { mdxStaticComponents } from "./mdx-static"
import { type JsonSchema, SchemaTable, schemaRows } from "./schema-table"

const id = { type: "integer", exclusiveMinimum: 0 } as const

describe("schemaRows", () => {
  test("a flat object: one row per property, required from the schema, format stated", () => {
    const rows = schemaRows({
      type: "object",
      properties: {
        id,
        title: { type: "string", minLength: 1, maxLength: 200 },
        body: { type: "string", maxLength: 10000, default: "" },
        createdAt: { type: "string", format: "date-time" },
      },
      required: ["id", "title", "createdAt"],
    })
    expect(rows.map((row) => [row.path, row.depth, row.type, row.required])).toEqual([
      ["id", 0, "integer", true],
      ["title", 0, "string", true],
      ["body", 0, "string", false],
      ["createdAt", 0, "string (date-time)", true],
    ])
    expect(rows[0]?.description).toContain("positive integer")
    expect(rows[1]?.description).toContain("1–200 characters")
    expect(rows[2]?.description).toContain("Up to 10,000 characters")
    expect(rows[2]?.description).toContain('Default: `""`')
    expect(rows[3]?.description).toContain("ISO 8601")
    expect(rows[3]?.description).toContain("UTC")
  })

  test("nested objects get dotted paths one level deeper", () => {
    const rows = schemaRows({
      type: "object",
      properties: {
        owner: {
          type: "object",
          properties: { id, profile: { type: "object", properties: { name: { type: "string" } } } },
          required: ["id"],
        },
      },
      required: ["owner"],
    })
    expect(rows.map((row) => [row.path, row.depth, row.type, row.required])).toEqual([
      ["owner", 0, "object", true],
      ["owner.id", 1, "integer", true],
      ["owner.profile", 1, "object", false],
      ["owner.profile.name", 2, "string", false],
    ])
  })

  test("arrays: the array row, then its items' fields under `[]`", () => {
    const rows = schemaRows({
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "object", properties: { userId: id }, required: ["userId"] },
        },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["items"],
    })
    expect(rows.map((row) => [row.path, row.depth, row.type, row.required])).toEqual([
      ["items", 0, "array of object", true],
      ["items[].userId", 1, "integer", true],
      ["tags", 0, "array of string", false],
    ])
  })

  test("enums list their values, an array of enums says which values each item takes", () => {
    const rows = schemaRows({
      type: "object",
      properties: {
        plan: { enum: ["free", "pro", "team"], type: "string" },
        scopes: { type: "array", items: { enum: ["notes:read", "notes:write"], type: "string" } },
      },
    })
    expect(rows[0]?.type).toBe("string (enum)")
    expect(rows[0]?.description).toContain("One of `free`, `pro`, `team`.")
    expect(rows[1]?.type).toBe("array of string (enum)")
    expect(rows[1]?.description).toContain("Each item is one of `notes:read`, `notes:write`.")
  })

  test("nullable fields (anyOf with null, or a type list) say `| null`", () => {
    const rows = schemaRows({
      type: "object",
      properties: {
        nextCursor: { anyOf: [id, { type: "null" }] },
        expiresAt: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] },
        note: { type: ["string", "null"] },
      },
      required: ["nextCursor"],
    })
    expect(rows.map((row) => [row.path, row.type])).toEqual([
      ["nextCursor", "integer | null"],
      ["expiresAt", "string (date-time) | null"],
      ["note", "string | null"],
    ])
    expect(rows[0]?.description).toContain("Can be `null`.")
  })

  test("a union of objects merges its variants: constants become the discriminator's values", () => {
    const variant = (type: string) => ({
      type: "object",
      properties: { type: { const: type }, id, name: { type: "string" } },
      required: ["type", "id", "name"],
    })
    const rows = schemaRows({
      type: "object",
      properties: {
        author: { anyOf: [{ anyOf: [variant("user"), variant("api_key")] }, { type: "null" }] },
      },
      required: ["author"],
    })
    expect(rows.map((row) => [row.path, row.depth, row.type, row.required])).toEqual([
      ["author", 0, "object | null", true],
      ["author.type", 1, "string (enum)", true],
      ["author.id", 1, "integer", true],
      ["author.name", 1, "string", true],
    ])
    expect(rows[1]?.description).toContain("One of `user`, `api_key`.")
  })

  test("integer bounds and defaults are stated; the safe-integer noise is not", () => {
    const rows = schemaRows({
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        id: { type: "integer", minimum: -9007199254740991, maximum: 9007199254740991 },
      },
    })
    expect(rows[0]?.description).toBe("Between 1 and 100. Default: `25`.")
    expect(rows[1]?.description).toBe("")
  })

  test('exclusive bounds in words; "positive integer" only for integers', () => {
    const rows = schemaRows({
      type: "object",
      properties: {
        ratio: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 1 },
        count: { type: "integer", exclusiveMinimum: 5 },
        id: { type: "integer", exclusiveMinimum: 0 },
      },
    })
    expect(rows.map((row) => row.description)).toEqual([
      "Greater than 0. Less than 1.",
      "Greater than 5.",
      "A positive integer.",
    ])
  })

  test("a merged union keeps the discriminator's description", () => {
    const variant = (type: string) => ({
      type: "object",
      properties: { type: { const: type, description: "Which kind." } },
      required: ["type"],
    })
    const rows = schemaRows({
      type: "object",
      properties: { author: { anyOf: [variant("user"), variant("api_key")] } },
    })
    expect(rows[1]?.description).toBe("Which kind. One of `user`, `api_key`.")
  })

  test("a description from the schema comes first", () => {
    const rows = schemaRows({
      type: "object",
      properties: { name: { type: "string", description: "The member's display name." } },
    })
    expect(rows[0]?.description).toBe("The member's display name.")
  })

  test("a schema with no fields (an empty body) has no rows", () => {
    expect(schemaRows({ anyOf: [{ not: {} }, { not: {} }] })).toEqual([])
    expect(schemaRows({ type: "object", properties: {} })).toEqual([])
  })
})

describe("SchemaTable", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: {
      title: { type: "string", description: "Uses `code` & <b>not html</b>" },
      author: {
        anyOf: [{ type: "object", properties: { id }, required: ["id"] }, { type: "null" }],
      },
    },
    required: ["title"],
  }

  test("a real table: caption, column headers with scope, one row per field", () => {
    const html = renderToStaticMarkup(<SchemaTable caption="Request body" schema={schema} />)
    expect(html).toContain("<table")
    expect(html).toContain("<caption")
    expect(html).toContain("Request body")
    for (const header of ["Field", "Type", "Required", "Description"])
      expect(html).toMatch(new RegExp(`<th scope="col"[^>]*>${header}</th>`))
    expect(html).toMatch(/<th scope="row"[^>]*>.*title.*<\/th>/)
    expect(html).toContain("author.id")
    // Required is text, never only an icon or a colour.
    expect(html).toContain(">Required<")
    expect(html).toContain(">Optional<")
  })

  test("descriptions render backticked spans as code and everything else as text", () => {
    const html = renderToStaticMarkup(<SchemaTable caption="Body" schema={schema} />)
    expect(html).toContain("<code")
    expect(html).toContain("&lt;b&gt;not html&lt;/b&gt;")
    expect(html).not.toContain("<b>")
  })

  test("an enum value holding a backtick still renders as one code span", () => {
    const html = renderToStaticMarkup(
      <SchemaTable
        caption="Body"
        schema={{ type: "object", properties: { kind: { type: "string", enum: ["a", "d`e"] } } }}
      />
    )
    expect(html).toContain("<code")
    expect(html).toMatch(/<code[^>]*>d`e<\/code>/)
    expect(html).not.toContain("``")
  })

  test("the scrolling container is reachable by keyboard, as a region named after the caption", () => {
    const html = renderToStaticMarkup(<SchemaTable caption="Body" schema={schema} />)
    expect(html).toMatch(/<section[^>]*aria-label="Body fields"[^>]*tabindex="0"/)
  })

  test("no fields: a sentence instead of an empty table", () => {
    const html = renderToStaticMarkup(
      <SchemaTable caption="Body" schema={{ type: "object", properties: {} }} />
    )
    expect(html).not.toContain("<table")
    expect(html).toContain("No fields.")
  })
})

describe("Endpoint", () => {
  test("method as text, the path as code, and the required scope", () => {
    const html = renderToStaticMarkup(
      <Endpoint method="POST" path="/v1/notes" scope="notes:write" />
    )
    expect(html).toContain("POST")
    expect(html).toContain("/v1/notes")
    expect(html).toContain("notes:write")
    expect(html).toContain("Required scope")
    expect(html).toContain('<span class="sr-only">Method: </span>')
  })

  test("the method is upper-cased and the scope line is absent without a scope", () => {
    const html = renderToStaticMarkup(<Endpoint method="get" path="/v1/workspace" />)
    expect(html).toContain("GET")
    expect(html).not.toContain("Required scope")
  })
})

describe("component maps", () => {
  test("both maps carry Endpoint and SchemaTable", () => {
    expect(mdxComponents.Endpoint).toBe(Endpoint)
    expect(mdxComponents.SchemaTable).toBe(SchemaTable)
    expect(mdxStaticComponents.Endpoint).toBe(Endpoint)
    expect(mdxStaticComponents.SchemaTable).toBe(SchemaTable)
  })
})
