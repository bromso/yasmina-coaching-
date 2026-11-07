// The /v1 API reference and webhook event pages, rendered from the OpenAPI document and event
// JSON Schemas `@repo/public-api-contract/openapi` builds. Pure: no file system, no clock, no
// environment — `scripts/generate-api-reference.ts` writes what `generateApiReference` returns, and
// `api-reference.test.ts` regenerates it in memory and compares it with the committed files.
import type { OpenAPIObject } from "@repo/public-api-contract/openapi"
import { buildWebhookEnvelopeSchemas } from "@repo/public-api-contract/openapi"
import { WEBHOOK_EVENTS, type WebhookEventType } from "@repo/public-api-contract/webhook-events"
import type { JsonSchema } from "@repo/ui/components/mdx"

/** Where the API is served, as the examples show it: a placeholder for the reader's own domain,
 * never derived from the build's `SITE_DOMAIN` (the pages are generated once and committed). */
export const API_BASE_URL = "https://api.your-domain.example"
/** The one date every example uses. */
export const EXAMPLE_DATE = "2026-01-15T09:30:00.000Z"
/** An `expiresAt` example: 90 days after `EXAMPLE_DATE`, so a key never seems to expire at birth. */
export const EXAMPLE_EXPIRY = "2026-04-15T09:30:00.000Z"
/** A key in the real format that was never issued: the scanner's `bb_live_` rule matches it, so
 * its line carries a `gitleaks:allow` marker. */
export const EXAMPLE_API_KEY = "bb_live_EXAMPLE0_docsOnlyFakeKeyNeverIssuedDoNotUse000000000" // gitleaks:allow

/** The generated folders, relative to apps/docs. */
export const REFERENCE_DIR = "content/docs/developers/reference"
export const EVENTS_DIR = "content/docs/developers/webhooks/events"

const REGENERATE = "bun run --filter @repo/docs generate:api"
const GENERATED_NOTE = `{/* Generated from @repo/public-api-contract by apps/docs/scripts/generate-api-reference.ts. Do not edit: change the contract, then run ${REGENERATE}. */}`

// ---------------------------------------------------------------------------------------------
// Slugs

/** `createNote` → `create-note`; a run of capitals stays one word (`listAPIKeys` → `list-api-keys`). */
export function slugFor(operationId: string): string {
  return operationId
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()
}

/** `api_key.created` → `api-key-created`. */
export function eventSlug(type: string): string {
  return type.replace(/[._]/g, "-").toLowerCase()
}

// ---------------------------------------------------------------------------------------------
// Escaping

/** A code span: a backtick, anything but a backtick or newline, a backtick. Its content is literal
 * in MDX, so it is kept as written. */
const CODE_SPAN = /(`[^`\n]+`)/

/**
 * `text` (Markdown prose, as the contract's descriptions are) as one MDX paragraph: Markdown is
 * kept — code spans, emphasis, links — and MDX syntax is escaped. Newlines collapse to spaces, and
 * outside code spans `{` `}` (expressions), `<` `>` (JSX, HTML), `|` (tables), `&` (character
 * references such as `&copy;`), a stray backtick and `\` are backslash-escaped, as is a leading
 * block marker (`#`, `>`, `-`, `+`, `*`, `1.`) that would start a heading, quote or list.
 */
export function mdxText(text: string): string {
  const escaped = text
    .replace(/\s*\n\s*/g, " ")
    .split(CODE_SPAN)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/[\\{}<>|`&]/g, "\\$&")))
    .join("")
  return escaped.replace(/^([#>+*-])/, "\\$1").replace(/^(\d+)([.)])/, "$1\\$2")
}

/** `text` as one inline code span, whatever backticks it holds: the fence is one backtick longer
 * than its longest run, padded with spaces when the text starts or ends with one. */
export function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = "`".repeat(longest + 1)
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : ""
  return `${fence}${pad}${text}${pad}${fence}`
}

const UNSAFE_IN_STRING = /[{}<>`\u2028\u2029]/g

/**
 * `value` as a JavaScript literal for a JSX prop (`schema={…}`): JSON, but every `{`, `}`, `<`,
 * `>` and backtick inside a string written as a `\u` escape, so no string can end the expression
 * or open a tag however MDX scans it. Objects keep their key order; one entry per line.
 */
export function jsLiteral(value: unknown, indent = ""): string {
  const inner = `${indent}  `
  if (typeof value === "string")
    return JSON.stringify(value).replace(
      UNSAFE_IN_STRING,
      (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
    )
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    return `[\n${value.map((item) => `${inner}${jsLiteral(item, inner)}`).join(",\n")}\n${indent}]`
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
    if (entries.length === 0) return "{}"
    return `{\n${entries.map(([key, item]) => `${inner}${jsLiteral(key)}: ${jsLiteral(item, inner)}`).join(",\n")}\n${indent}}`
  }
  return JSON.stringify(value) ?? "null"
}

/** A frontmatter value: a JSON string is a valid YAML double-quoted scalar. */
const yaml = (text: string) => JSON.stringify(text)

// ---------------------------------------------------------------------------------------------
// Operations

/** One /v1 route, as the pages need it. */
export interface Operation {
  operationId: string
  method: string
  path: string
  summary: string
  description: string
  scope: string | undefined
  pathParameters: JsonSchema | undefined
  queryParameters: JsonSchema | undefined
  requestBody: JsonSchema | undefined
  /** The success status and its body's schema (none for `204`). */
  success: { status: number; schema?: JsonSchema }
  /** Every declared error status, ascending. */
  errors: number[]
}

interface OpenAPIParameter {
  name: string
  in: string
  required?: boolean
  description?: string
  schema?: JsonSchema
}

interface OpenAPIOperation {
  operationId?: string
  summary?: string
  description?: string
  parameters?: OpenAPIParameter[]
  requestBody?: { content?: Record<string, { schema?: JsonSchema }> }
  responses?: Record<string, { content?: Record<string, { schema?: JsonSchema }> }>
  "x-required-scope"?: string
}

const METHODS = ["get", "post", "put", "patch", "delete"] as const

/** Bounds zod emits for every `.int()`: the safe-integer range, noise for a reader. */
const SAFE_INTEGER = 9007199254740991

/** `schema` without the safe-integer bounds every integer carries (`minimum: -2^53+1`). */
function tidy(schema: JsonSchema): JsonSchema {
  return JSON.parse(
    JSON.stringify(schema, (key, value) =>
      (key === "minimum" && value === -SAFE_INTEGER) ||
      (key === "maximum" && value === SAFE_INTEGER)
        ? undefined
        : value
    )
  ) as JsonSchema
}

/** Parameters of one kind as an object schema: each parameter a property. */
function parameterSchema(parameters: OpenAPIParameter[], where: string): JsonSchema | undefined {
  const matching = parameters.filter((parameter) => parameter.in === where)
  if (matching.length === 0) return undefined
  return {
    type: "object",
    properties: Object.fromEntries(
      matching.map((parameter) => [
        parameter.name,
        tidy({
          ...parameter.schema,
          description: parameter.description ?? parameter.schema?.description,
        }),
      ])
    ),
    required: matching.filter((parameter) => parameter.required).map((parameter) => parameter.name),
  }
}

const jsonSchemaOf = (content?: Record<string, { schema?: JsonSchema }>) =>
  content?.["application/json"]?.schema

/**
 * The reference's sidebar order: by resource (workspace, members, notes), then list, get, create,
 * delete. A new operation must be placed here — `operationsOf` refuses one that is not.
 */
export const OPERATION_ORDER = [
  "getWorkspace",
  "listMembers",
  "listNotes",
  "getNote",
  "createNote",
  "deleteNote",
] as const

/** Every operation in the document, in `OPERATION_ORDER`. */
export function operationsOf(doc: OpenAPIObject): Operation[] {
  const order: readonly string[] = OPERATION_ORDER
  const operations = documentOperations(doc)
  const unplaced = operations.filter((op) => !order.includes(op.operationId))
  if (unplaced.length > 0)
    throw new Error(
      `Add ${unplaced.map((op) => op.operationId).join(", ")} to OPERATION_ORDER in apps/docs/src/lib/api-reference.ts`
    )
  return operations.sort((a, b) => order.indexOf(a.operationId) - order.indexOf(b.operationId))
}

function documentOperations(doc: OpenAPIObject): Operation[] {
  const paths = (doc.paths ?? {}) as Record<string, Partial<Record<string, OpenAPIOperation>>>
  return Object.entries(paths).flatMap(([path, item]) =>
    METHODS.flatMap((method) => {
      const operation = item[method]
      if (!operation?.operationId) return []
      const responses = operation.responses ?? {}
      const statuses = Object.keys(responses)
        .map(Number)
        .sort((a, b) => a - b)
      const status = statuses.find((code) => code >= 200 && code < 300) ?? 200
      const body = status === 204 ? undefined : jsonSchemaOf(responses[String(status)]?.content)
      const requestBody = jsonSchemaOf(operation.requestBody?.content)
      return [
        {
          operationId: operation.operationId,
          method: method.toUpperCase(),
          path,
          summary: operation.summary ?? operation.operationId,
          description: operation.description ?? "",
          scope: operation["x-required-scope"],
          pathParameters: parameterSchema(operation.parameters ?? [], "path"),
          queryParameters: parameterSchema(operation.parameters ?? [], "query"),
          requestBody: requestBody && tidy(requestBody),
          success: body ? { status, schema: tidy(body) } : { status },
          errors: statuses.filter((code) => code >= 400),
        },
      ]
    })
  )
}

// ---------------------------------------------------------------------------------------------
// Examples

/** Realistic values for fields by name; each is still checked against the field's own schema
 * (an enum must list it, a string must fit its length) and the examples test validates them. */
const SAMPLES: Record<string, unknown> = {
  title: "Quarterly planning",
  body: "Agenda and decisions from the planning meeting.",
  slug: "acme",
  prefix: "EXAMPLE0",
  role: "member",
  previousRole: "viewer",
  plan: "pro",
  scopes: ["notes:read", "notes:write"],
}

/** `name` depends on what it names: a workspace (it has a slug), an API key (a prefix) or a person. */
function nameFor(siblings: Record<string, JsonSchema>): string {
  if ("slug" in siblings) return "Acme"
  if ("prefix" in siblings) return "CRM sync"
  return "Ada Lovelace"
}

function fits(schema: JsonSchema, value: unknown): boolean {
  if (schema.enum) return schema.enum.includes(value)
  if (typeof value === "string")
    return (
      schema.type === "string" &&
      !schema.format &&
      value.length >= (schema.minLength ?? 0) &&
      value.length <= (schema.maxLength ?? Number.POSITIVE_INFINITY)
    )
  if (Array.isArray(value))
    return (
      schema.type === "array" && value.every((item) => !schema.items || fits(schema.items, item))
    )
  return false
}

/** A fixed example for a schema. `ids` numbers positive integers 1, 2, … in document order. */
function example(
  schema: JsonSchema,
  ids: { next: number },
  key?: string,
  siblings: Record<string, JsonSchema> = {}
): unknown {
  const sample = key === "name" ? nameFor(siblings) : key ? SAMPLES[key] : undefined
  if (sample !== undefined && fits(schema, sample)) return sample
  if ("const" in schema) return schema.const
  if (schema.enum) return schema.enum[0]
  const variants = schema.anyOf ?? schema.oneOf
  if (variants) {
    // Nullable fields show a value: the first variant that is not null.
    const first = variants.find((variant) => variant.type !== "null")
    return first ? example(first, ids, key, siblings) : null
  }
  const type = Array.isArray(schema.type)
    ? schema.type.find((candidate) => candidate !== "null")
    : schema.type
  if (type === "object" || schema.properties) {
    const properties = schema.properties ?? {}
    return Object.fromEntries(
      Object.entries(properties).map(([name, property]) => [
        name,
        example(property, ids, name, properties),
      ])
    )
  }
  if (type === "array") return schema.items ? [example(schema.items, ids, key, siblings)] : []
  if (type === "integer" || type === "number") {
    if (typeof schema.default === "number") return schema.default
    if (schema.minimum !== undefined && schema.minimum > -SAFE_INTEGER) return schema.minimum
    const id = ids.next
    ids.next += 1
    return id
  }
  if (type === "boolean") return true
  if (type === "null") return null
  if (type === "string") {
    if (schema.format === "date-time") return key === "expiresAt" ? EXAMPLE_EXPIRY : EXAMPLE_DATE
    const min = schema.minLength ?? 0
    const max = schema.maxLength ?? Number.POSITIVE_INFINITY
    return "example".padEnd(min, "e").slice(0, max)
  }
  return null
}

/** A fixed example value for `schema`: ids 1, 2, … in document order, the fixed date for every
 * date-time, the first enum value, a value (never `null`) for a nullable field, one item per array. */
export function exampleFor(schema: JsonSchema): unknown {
  return example(schema, { next: 1 })
}

/** Per-operation touches no schema can express: a created note's author is the key, and a page's
 * `nextCursor` is its last item's id (the examples show one item). */
const RESPONSE_FIXES: Record<string, (response: Record<string, unknown>) => void> = {
  createNote: (note) => {
    note.author = { type: "api_key", id: 2, name: "CRM sync" }
  },
  listMembers: (page) => {
    page.nextCursor = (page.items as { userId: number }[]).at(-1)?.userId ?? null
  },
  listNotes: (page) => {
    page.nextCursor = (page.items as { id: number }[]).at(-1)?.id ?? null
  },
}

/** An operation's example request (path parameters, query, body) and response body. */
export function operationExample(op: Operation): {
  pathParams: Record<string, unknown>
  query: Record<string, unknown>
  body: Record<string, unknown> | undefined
  response: unknown
} {
  const pathParams = op.pathParameters
    ? (exampleFor(op.pathParameters) as Record<string, unknown>)
    : {}
  // Only the parameters that have a default are shown, set to it: the request a reader starts from.
  const query = Object.fromEntries(
    Object.entries(op.queryParameters?.properties ?? {}).flatMap(([name, schema]) =>
      schema.default === undefined ? [] : [[name, schema.default]]
    )
  )
  const body = op.requestBody ? (exampleFor(op.requestBody) as Record<string, unknown>) : undefined
  const response = op.success.schema ? exampleFor(op.success.schema) : undefined
  if (response && typeof response === "object")
    RESPONSE_FIXES[op.operationId]?.(response as Record<string, unknown>)
  return { pathParams, query, body, response }
}

// ---------------------------------------------------------------------------------------------
// Reference pages

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
}

/** What a 400 can be about on this route: its own path parameters, query parameters and body. */
function inputsOf(op: Operation): string {
  const names = (schema?: JsonSchema) => Object.keys(schema?.properties ?? {}).map(codeSpan)
  const path = names(op.pathParameters)
  const query = names(op.queryParameters)
  const parts = [
    ...(path.length === 1 ? [`the ${path[0]} path parameter`] : []),
    ...(path.length > 1 ? [`a path parameter (${path.join(", ")})`] : []),
    ...(query.length === 1 ? [`the ${query[0]} query parameter`] : []),
    ...(query.length > 1 ? [`a query parameter (${query.join(", ")})`] : []),
    ...(op.requestBody ? ["the body"] : []),
  ]
  if (parts.length <= 1) return parts[0] ?? "the request"
  return `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}`
}

/**
 * Each error status the document declares for the route, with its `/v1` code and what it means
 * for a caller. The statuses come from the document (the contract's declared errors); a status
 * with no line here fails generation rather than going undocumented.
 */
/** The api's own message for a request body that is not valid JSON (oRPC's, verbatim). */
const MALFORMED_BODY_MESSAGE =
  "Malformed request. Ensure the request body is properly formatted and the 'Content-Type' header is set correctly."

function errorLine(status: number, op: Operation): string {
  const lines: Record<number, string> = {
    400: `\`400\` \`validation_failed\` — ${inputsOf(op)} is invalid. The \`message\` is \`Input validation failed\` and does not name the field; check the request against the rules in the tables above.${op.requestBody ? ` A body that is not valid JSON gets \`${MALFORMED_BODY_MESSAGE}\` instead.` : ""}`,
    401: "`401` `unauthorized` — the API key is missing, malformed, unknown, revoked or expired, or the key's workspace was deleted or its plan no longer includes API access.",
    403: `\`403\` \`forbidden_scope\` — the key does not have the ${codeSpan(op.scope ?? "")} scope.`,
    404: "`404` `not_found` — nothing with that id exists in your workspace.",
    413: "`413` `validation_failed` — the request body is larger than the API accepts. A body over the server's hard limit may be refused with an empty `413`, with no JSON body.",
    429: "`429` `rate_limited` — too many requests with this key, or too many refused attempts from your address; wait the number of seconds in the `Retry-After` header, then retry.",
    500: "`500` `internal` — an unexpected error on our side; retry later.",
    503: "`503` `internal` — the request took too long to answer. It may still have taken effect, so check before you retry a change.",
  }
  const line = lines[status]
  if (!line) throw new Error(`${op.operationId}: no errors-list line for status ${status}`)
  return `- ${line}`
}

/** The first sentence of `text`, and the rest. */
function splitSentence(text: string): [string, string] {
  const match = text.match(/^(.+?[.!?])(?:\s+|$)([\s\S]*)$/)
  return match ? [match[1] as string, match[2] as string] : [text, ""]
}

const shellQuote = (text: string) => `'${text.replace(/'/g, "'\\''")}'`

function curlFor(op: Operation, ex: ReturnType<typeof operationExample>): string {
  const path = op.path.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in ex.pathParams ? String(ex.pathParams[name]) : match
  )
  const query = new URLSearchParams(
    Object.entries(ex.query).map(([name, value]) => [name, String(value)])
  ).toString()
  const url = `${API_BASE_URL}${path}${query ? `?${query}` : ""}`
  const lines = [`curl -X ${op.method} "${url}"`, `  -H "Authorization: Bearer $API_KEY"`]
  if (ex.body)
    lines.push(
      `  -H "content-type: application/json"`,
      `  -d ${shellQuote(JSON.stringify(ex.body))}`
    )
  return lines.join(" \\\n")
}

const SECURITY_NOTE = [
  '<Callout type="warning" title="Keep your API key secret">',
  "Send the key only in the `Authorization` header, from your own server. Never put it in a URL or a query string, where logs and browser history keep it, and never in browser or mobile app code, where anyone can read it. See [Authentication](/developers/authentication) for creating and revoking keys.",
  "</Callout>",
].join("\n")

const table = (caption: string, schema: JsonSchema) =>
  `<SchemaTable caption={${jsLiteral(caption)}} schema={${jsLiteral(schema)}} />`

/** One /v1 route's page: purpose and explanation, the endpoint, its tables, a complete example
 * request with the security note beside it, the response, and its errors. */
export function renderOperationPage(op: Operation): string {
  const [purpose, explanation] = splitSentence(op.description)
  const ex = operationExample(op)
  const out: string[] = [
    "---",
    `title: ${yaml(op.summary)}`,
    `description: ${yaml(purpose)}`,
    "---",
    "",
    GENERATED_NOTE,
    "",
    mdxText(purpose),
    "",
  ]
  if (explanation) out.push(mdxText(explanation), "")
  out.push(
    `<Endpoint method={${jsLiteral(op.method)}} path={${jsLiteral(op.path)}}${op.scope ? ` scope={${jsLiteral(op.scope)}}` : ""} />`,
    ""
  )

  const request: string[] = []
  if (op.pathParameters) request.push(table("Path parameters", op.pathParameters), "")
  if (op.queryParameters) request.push(table("Query parameters", op.queryParameters), "")
  if (op.requestBody)
    request.push("Send the body as JSON.", "", table("Request body", op.requestBody), "")
  out.push("## Request", "", ...(request.length > 0 ? request : ["No parameters or body.", ""]))

  out.push(
    "## Example request",
    "",
    `The example reads your API key from the \`API_KEY\` environment variable. A key looks like \`${EXAMPLE_API_KEY}\` — that one is a fake, never issued. {/* gitleaks:allow */}`,
    "",
    "```bash",
    curlFor(op, ex),
    "```",
    "",
    SECURITY_NOTE,
    ""
  )

  const statusText = [op.success.status, STATUS_TEXT[op.success.status]].filter(Boolean).join(" ")
  const statusLine = `\`${statusText}\``
  out.push("## Response", "")
  if (op.success.schema) {
    out.push(
      `On success the API answers ${statusLine} with a JSON body.`,
      "",
      table("Response body", op.success.schema),
      "",
      "Example response:",
      "",
      "```json",
      JSON.stringify(ex.response, null, 2),
      "```",
      ""
    )
  } else {
    out.push(`On success the API answers ${statusLine} with an empty body.`, "")
  }

  out.push(
    "## Errors",
    "",
    'Every error answers with a JSON body `{ "error": { "code": "…", "message": "…" } }`. This route can answer:',
    "",
    ...op.errors.map((status) => errorLine(status, op)),
    ""
  )
  return out.join("\n")
}

// ---------------------------------------------------------------------------------------------
// Event pages

/** Each event's purpose (one sentence) and when it is sent. */
const EVENT_DOCS: Record<WebhookEventType, { purpose: string; detail: string }> = {
  "note.created": {
    purpose: "A note was created in your workspace.",
    detail:
      "Sent for notes created in the app and through the API ([Create a note](/developers/reference/create-note)). `data` is the note as [Get a note](/developers/reference/get-note) returns it.",
  },
  "note.deleted": {
    purpose: "A note was deleted from your workspace.",
    detail:
      "Sent for notes deleted in the app and through the API ([Delete a note](/developers/reference/delete-note)). Only the note's id is left to send.",
  },
  "member.joined": {
    purpose: "Someone joined your workspace.",
    detail:
      "Sent when a person accepts an invitation. `data` is the member as [List members](/developers/reference/list-members) returns them — never an email address.",
  },
  "member.left": {
    purpose: "Someone left your workspace.",
    detail:
      "Sent when a member leaves or is removed, and when a member's account is deleted. `data` is the member as they were, with the role they last held; for a deleted account, `name` is an empty string.",
  },
  "member.role_changed": {
    purpose: "A member's role in your workspace changed.",
    detail:
      "Sent when an admin changes a member's role, and for both people when ownership is transferred. `data` is the member with their new `role`, plus `previousRole`.",
  },
  "workspace.updated": {
    purpose: "Your workspace was changed.",
    detail:
      "Sent when the workspace is renamed or its logo is changed or removed. `data` is the workspace as [Get the workspace](/developers/reference/get-workspace) returns it.",
  },
  "api_key.created": {
    purpose: "An API key was created for your workspace.",
    detail:
      "`data` describes the key — its name, the 8 characters of its prefix, its scopes and when it expires — never the key itself.",
  },
  "api_key.revoked": {
    purpose: "An API key for your workspace was revoked.",
    detail:
      "From this moment the key is refused. `data` describes the key as `api_key.created` did — never the key itself.",
  },
  ping: {
    purpose: "A test event.",
    detail:
      "Sent only when you choose **Send test event** on an endpoint, and only to that endpoint, to confirm it is reachable and verifies signatures. You cannot subscribe to it.",
  },
}

/** Each event type's delivery body, the envelope `{ type, timestamp, data }`, as the contract's
 * `WebhookEventSchema` defines it. */
const ENVELOPE_SCHEMAS = buildWebhookEnvelopeSchemas() as Record<WebhookEventType, JsonSchema>

/** An envelope schema's example: `type` its constant, the fixed `timestamp`, `data` built from
 * the event's own schema. */
function envelopeExampleFor(envelope: JsonSchema): Record<string, unknown> {
  return exampleFor(tidy(envelope)) as Record<string, unknown>
}

/** One event type's example envelope, `{ type, timestamp, data }` — the one its page shows. */
export function envelopeExample(type: WebhookEventType): Record<string, unknown> {
  return envelopeExampleFor(ENVELOPE_SCHEMAS[type])
}

const VERIFY_NOTE = [
  '<Callout type="warning" title="Verify the signature first">',
  "Anyone can send a request to your endpoint. Before you parse or act on a delivery, check its `webhook-signature` header against your endpoint's signing secret, and refuse a `webhook-timestamp` more than 5 minutes from your own clock. See [Verifying signatures](/developers/webhooks/verifying-signatures).",
  "</Callout>",
].join("\n")

/** One webhook event's page: purpose and when it is sent, the envelope's table (`envelope` is the
 * delivery body's schema), an example with the "verify the signature first" note beside it. */
export function renderEventPage(type: WebhookEventType, envelope: JsonSchema): string {
  const docs = EVENT_DOCS[type]
  return [
    "---",
    `title: ${yaml(type)}`,
    `description: ${yaml(docs.purpose)}`,
    "---",
    "",
    GENERATED_NOTE,
    "",
    mdxText(docs.purpose),
    "",
    docs.detail,
    "",
    "## Payload",
    "",
    "Every delivery's body is one JSON envelope: the event's `type`, the `timestamp` it happened at, and its `data`.",
    "",
    table("Envelope", tidy(envelope)),
    "",
    "## Example",
    "",
    "Shown formatted here; a delivery's body arrives as minified JSON.",
    "",
    "```json",
    JSON.stringify(envelopeExampleFor(envelope), null, 2),
    "```",
    "",
    VERIFY_NOTE,
    "",
  ].join("\n")
}

// ---------------------------------------------------------------------------------------------
// Everything

/** A folder's meta.json, formatted as Biome formats JSON: the `pages` list on one line when it fits
 * in 100 columns, else one entry per line. */
function meta(title: string, pages: string[]): string {
  const inline = `  "pages": [${pages.map((page) => JSON.stringify(page)).join(", ")}]`
  const list =
    inline.length <= 100
      ? inline
      : `  "pages": [\n${pages.map((page) => `    ${JSON.stringify(page)}`).join(",\n")}\n  ]`
  return `{\n  "title": ${JSON.stringify(title)},\n${list}\n}\n`
}

/**
 * Every generated file, by its path relative to apps/docs: one page per /v1 operation under
 * `REFERENCE_DIR`, one per webhook event (in `WEBHOOK_EVENTS` order) under `EVENTS_DIR`, and each
 * folder's `meta.json`. Deterministic: the same document always gives the same bytes.
 */
export function generateApiReference(doc: OpenAPIObject): Record<string, string> {
  const files: Record<string, string> = {}
  const operations = operationsOf(doc)
  for (const op of operations)
    files[`${REFERENCE_DIR}/${slugFor(op.operationId)}.mdx`] = renderOperationPage(op)
  files[`${REFERENCE_DIR}/meta.json`] = meta(
    "API reference",
    operations.map((op) => slugFor(op.operationId))
  )
  for (const type of WEBHOOK_EVENTS)
    files[`${EVENTS_DIR}/${eventSlug(type)}.mdx`] = renderEventPage(type, ENVELOPE_SCHEMAS[type])
  files[`${EVENTS_DIR}/meta.json`] = meta("Events", WEBHOOK_EVENTS.map(eventSlug))
  return files
}
