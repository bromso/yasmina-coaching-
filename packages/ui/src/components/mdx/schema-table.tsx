import { cn } from "@repo/ui/lib/utils"
import type { ReactElement, ReactNode } from "react"

/**
 * The subset of JSON Schema (draft 2020-12, as oRPC's converter emits it) `SchemaTable` reads.
 * Plain, serialisable data: an MDX page passes it inline as a prop.
 */
export interface JsonSchema {
  type?: string | string[]
  format?: string
  description?: string
  properties?: Record<string, JsonSchema>
  required?: readonly string[]
  items?: JsonSchema
  enum?: readonly unknown[]
  const?: unknown
  anyOf?: readonly JsonSchema[]
  oneOf?: readonly JsonSchema[]
  not?: JsonSchema
  default?: unknown
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  minLength?: number
  maxLength?: number
}

/** One field of a schema, flattened for a table. */
export interface SchemaRow {
  /** Dotted from the root: `author.id`, an array's items under `[]` (`items[].userId`). */
  path: string
  /** Nesting level, 0 for a top-level field. */
  depth: number
  /** `integer`, `string (date-time)`, `array of object`, `string (enum) | null`, … */
  type: string
  required: boolean
  /** The schema's own description, then its constraints in words; backticks mark code. */
  description: string
}

/** Bounds zod emits for every `.int()`: the safe-integer range, which says nothing to a reader. */
const SAFE_INTEGER = 9007199254740991

const isNull = (schema: JsonSchema) => schema.type === "null"
const isNever = (schema: JsonSchema) => schema.not !== undefined && Object.keys(schema).length === 1

/** The schema without `null` in it, and whether `null` was allowed. Unwraps nested unions. */
function unwrap(schema: JsonSchema): { schema: JsonSchema; nullable: boolean } {
  if (Array.isArray(schema.type) && schema.type.includes("null")) {
    const rest = schema.type.filter((type) => type !== "null")
    const { schema: inner } = unwrap({ ...schema, type: rest.length === 1 ? rest[0] : rest })
    return { schema: inner, nullable: true }
  }
  const variants = schema.anyOf ?? schema.oneOf
  if (!variants) return { schema, nullable: false }
  const nonNull = variants.filter((variant) => !isNull(variant))
  const nullable = nonNull.length < variants.length
  // A union of unions (zod's nullable discriminated union) is one flat union.
  const flat = nonNull.flatMap((variant) => {
    const inner = unwrap(variant)
    return inner.schema.anyOf ?? inner.schema.oneOf ?? [inner.schema]
  })
  if (flat.length === 1) {
    const inner = unwrap(flat[0] as JsonSchema)
    return { schema: inner.schema, nullable: nullable || inner.nullable }
  }
  if (flat.length > 1 && flat.every(isObject)) return { schema: mergeObjects(flat), nullable }
  return { schema: { anyOf: flat }, nullable }
}

const isObject = (schema: JsonSchema) => schema.type === "object" || schema.properties !== undefined

/** One property's schema across a union's variants: constants become an enum of them all. */
function mergeProperty(schemas: JsonSchema[]): JsonSchema {
  if (schemas.every((schema) => "const" in schema))
    return {
      type: "string",
      enum: [...new Set(schemas.map((schema) => schema.const))],
      description: schemas.find((schema) => schema.description)?.description,
    }
  const first = JSON.stringify(schemas[0])
  if (schemas.every((schema) => JSON.stringify(schema) === first)) return schemas[0] as JsonSchema
  return { anyOf: schemas }
}

/** A union of objects (a discriminated union) as one object: every property any variant has,
 * required where every variant requires it. */
function mergeObjects(variants: readonly JsonSchema[]): JsonSchema {
  const keys = [...new Set(variants.flatMap((variant) => Object.keys(variant.properties ?? {})))]
  const properties = Object.fromEntries(
    keys.map((key) => [
      key,
      mergeProperty(
        variants.flatMap((variant) => (variant.properties?.[key] ? [variant.properties[key]] : []))
      ),
    ])
  )
  const required = keys.filter((key) =>
    variants.every((variant) => variant.required?.includes(key))
  )
  return { type: "object", properties, required }
}

/** The type column: the base type, its format, `(enum)`, `array of …`. */
function typeLabel(schema: JsonSchema): string {
  if (schema.enum || "const" in schema) {
    const values = schema.enum ?? [schema.const]
    const base = typeof values[0] === "number" ? "number" : "string"
    return `${typeof schema.type === "string" ? schema.type : base} (enum)`
  }
  if (schema.type === "array") {
    const item = schema.items ? unwrap(schema.items) : undefined
    if (!item) return "array"
    return `array of ${typeLabel(item.schema)}${item.nullable ? " | null" : ""}`
  }
  if (isObject(schema)) return "object"
  const variants = schema.anyOf ?? schema.oneOf
  if (variants) return variants.map(typeLabel).join(" | ")
  const type = Array.isArray(schema.type) ? schema.type.join(" | ") : (schema.type ?? "any")
  return schema.format ? `${type} (${schema.format})` : type
}

/** `value` as one Markdown code span, whatever backticks it holds: the fence is one longer than
 * its longest backtick run, padded with a space when the text starts or ends with one. */
function code(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value)
  const fence = "`".repeat(Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length)) + 1)
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : ""
  return `${fence}${pad}${text}${pad}${fence}`
}
const count = (n: number) => n.toLocaleString("en-US")

/** A schema's constraints in words: format, bounds, lengths, values, default. */
function constraints(schema: JsonSchema, nullable: boolean): string[] {
  const parts: string[] = []
  if (schema.format === "date-time")
    parts.push("An ISO 8601 date-time in UTC, such as `2026-01-15T09:30:00.000Z`.")
  else if (schema.format) parts.push(`Format: \`${schema.format}\`.`)
  if (schema.type === "integer" || schema.type === "number") {
    const min =
      schema.minimum !== undefined && schema.minimum > -SAFE_INTEGER ? schema.minimum : undefined
    const max =
      schema.maximum !== undefined && schema.maximum < SAFE_INTEGER ? schema.maximum : undefined
    if (min !== undefined && max !== undefined) parts.push(`Between ${min} and ${max}.`)
    else if (min !== undefined) parts.push(`At least ${min}.`)
    else if (max !== undefined) parts.push(`At most ${max}.`)
    if (schema.type === "integer" && schema.exclusiveMinimum === 0)
      parts.push("A positive integer.")
    else if (schema.exclusiveMinimum !== undefined)
      parts.push(`Greater than ${schema.exclusiveMinimum}.`)
    if (schema.exclusiveMaximum !== undefined) parts.push(`Less than ${schema.exclusiveMaximum}.`)
  }
  if (schema.minLength !== undefined && schema.maxLength !== undefined)
    parts.push(`${count(schema.minLength)}–${count(schema.maxLength)} characters.`)
  else if (schema.maxLength !== undefined)
    parts.push(`Up to ${count(schema.maxLength)} characters.`)
  else if (schema.minLength !== undefined)
    parts.push(`At least ${count(schema.minLength)} characters.`)
  if (schema.enum) parts.push(`One of ${schema.enum.map(code).join(", ")}.`)
  else if ("const" in schema) parts.push(`Always ${code(schema.const)}.`)
  if (schema.type === "array" && schema.items) {
    const item = unwrap(schema.items).schema
    if (item.enum) parts.push(`Each item is one of ${item.enum.map(code).join(", ")}.`)
  }
  if (nullable) parts.push("Can be `null`.")
  if (schema.default !== undefined) parts.push(`Default: ${code(JSON.stringify(schema.default))}.`)
  return parts
}

function walk(
  schema: JsonSchema,
  path: string,
  depth: number,
  required: boolean,
  rows: SchemaRow[]
): void {
  const { schema: base, nullable } = unwrap(schema)
  rows.push({
    path,
    depth,
    type: `${typeLabel(base)}${nullable ? " | null" : ""}`,
    required,
    description: [schema.description ?? base.description, ...constraints(base, nullable)]
      .filter(Boolean)
      .join(" "),
  })
  children(base, path, depth + 1, rows)
}

function children(schema: JsonSchema, prefix: string, depth: number, rows: SchemaRow[]): void {
  if (isObject(schema)) {
    for (const [key, property] of Object.entries(schema.properties ?? {}))
      walk(
        property,
        prefix ? `${prefix}.${key}` : key,
        depth,
        schema.required?.includes(key) ?? false,
        rows
      )
  } else if (schema.type === "array" && schema.items) {
    const item = unwrap(schema.items).schema
    if (isObject(item)) children(item, `${prefix}[]`, depth, rows)
  }
}

/**
 * Every field of `schema`, flattened in document order: an object's properties (nested ones as
 * dotted paths one level deeper), an array's item fields under `[]`, unions of objects merged, and
 * `null` folded into the type as `| null`. A schema with no fields — an empty body — has no rows.
 */
export function schemaRows(schema: JsonSchema): SchemaRow[] {
  const rows: SchemaRow[] = []
  const { schema: root } = unwrap(schema)
  if (isNever(root) || root.anyOf?.every(isNever)) return rows
  children(root, "", 0, rows)
  return rows
}

/** A code span as Markdown reads one: a run of backticks, then the shortest text up to a run of
 * exactly the same length; one space of padding on each side is dropped. */
const CODE_SPAN = /(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g

/** `text` with each backticked span (any fence length) as `<code>`; the rest stays plain text. */
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(CODE_SPAN)) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const inner = match[2] as string
    const content = /^ .* $/.test(inner) && inner.trim() ? inner.slice(1, -1) : inner
    nodes.push(
      <code key={match.index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
        {content}
      </code>
    )
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export type SchemaTableProps = {
  /** The JSON Schema to list: an object (its properties are the rows) or a union of objects. */
  schema: JsonSchema
  /** The table's caption, which names it for assistive technology: "Request body", "Response". */
  caption?: string
}

/**
 * A JSON Schema as a table of its fields — field, type (with format), required, description —
 * for API reference pages written in MDX: `<SchemaTable caption="Request body" schema={{…}} />`.
 * Nested fields show as dotted paths, indented by depth. A pure component (no hooks, no Client
 * Component in its graph), so it is in both `mdxComponents` and `mdxStaticComponents`. The
 * container scrolls sideways on a narrow screen and is focusable so a keyboard can scroll it — a
 * named region ("<caption> fields"), so that tab stop is announced with a name.
 */
export function SchemaTable({ schema, caption = "Fields" }: SchemaTableProps): ReactElement {
  const rows = schemaRows(schema)
  if (rows.length === 0)
    return (
      <p data-slot="schema-table" className="my-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{caption}:</span> No fields.
      </p>
    )
  return (
    <section
      data-slot="schema-table"
      aria-label={`${caption} fields`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard
      tabIndex={0}
      className="my-4 w-full overflow-x-auto rounded-lg border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="border-b px-3 py-2 text-left font-medium">{caption}</caption>
        <thead className="bg-muted/50">
          <tr className="border-b">
            <th scope="col" className="px-3 py-2 font-medium">
              Field
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Type
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Required
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.path} className="border-b align-top last:border-0">
              <th scope="row" className="px-3 py-2 font-normal">
                <code
                  className="whitespace-nowrap font-mono text-[0.85em]"
                  style={{ paddingInlineStart: `${row.depth}rem` }}
                >
                  {row.path}
                </code>
              </th>
              <td className="px-3 py-2 font-mono text-[0.85em] whitespace-nowrap">{row.type}</td>
              <td className={cn("px-3 py-2", !row.required && "text-muted-foreground")}>
                {row.required ? "Required" : "Optional"}
              </td>
              <td className="min-w-48 px-3 py-2 text-muted-foreground">
                {inline(row.description)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
