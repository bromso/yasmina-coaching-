// The /v1 OpenAPI document, built once from `publicContract` itself (never from `apps/api`'s
// implemented router): `apps/api`'s `/v1` reference plugin and `apps/docs`'s generated reference
// pages both read the exact same document, so they can never disagree. Pulls in Zod and oRPC
// (unlike `./webhook-events`), so it is not on the Zod-free subpath list.
import { type JSONSchema, type OpenAPI, OpenAPIGenerator } from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { ERROR_CODES, publicContract } from "./index"
import type { WebhookEventType } from "./webhook-events"
import { WEBHOOK_DATA_SCHEMAS, WebhookEventSchema } from "./webhooks"

/** The full OpenAPI 3.1 document `OpenAPIGenerator.generate()` returns. */
export type OpenAPIObject = OpenAPI.Document

/**
 * The `/v1` error body as JSON Schema, for the generated spec's error responses. The one place
 * this shape is defined — `apps/api/src/v1/handler.ts` imports this constant for
 * `customErrorResponseBodySchema`, its second (`v1Router`-driven) generation pass.
 */
export const ERROR_BODY_JSON_SCHEMA = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", enum: [...ERROR_CODES] },
        message: { type: "string" },
      },
    },
  },
} as const

const SECURITY_SCHEMES = {
  apiKey: { type: "http" as const, scheme: "bearer", description: "A workspace API key" },
}

/**
 * Builds the `/v1` OpenAPI document straight from `publicContract` — the same security scheme,
 * error shape and route prose `apps/api`'s `/v1` reference plugin serves at `/v1/openapi.json`.
 * `serverUrl` fills in `servers`; omit it where the caller has none (the docs generator writes
 * pages from the paths and schemas, never the server list). `title` names `info.title`; this
 * package takes no branding dependency of its own, so the caller (`apps/api/src/v1/handler.ts`)
 * passes its own `` `${BRAND_NAME} API` ``. `docsUrl`, passed the same way, appends a sentence to
 * `info.description` — which the Scalar reference at `/v1/docs` renders at the top of the page —
 * pointing at the full developer guides; omit it where the caller has none.
 */
export async function buildV1OpenAPIDocument(
  options: { serverUrl?: string; title?: string; docsUrl?: string } = {}
): Promise<OpenAPIObject> {
  const title = options.title ?? "API"
  const generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  })
  const description =
    "The public API. Authenticate with `Authorization: Bearer <API key>`. Every error " +
    "answers `{ error: { code, message } }`; a body over the size cap is 413 " +
    "`validation_failed`, though a body over the server's hard limit may be refused with an " +
    "empty 413." +
    (options.docsUrl
      ? ` Full guides — authentication, rate limits, webhooks and verifying webhook signatures — ` +
        `live in the [developer docs](${options.docsUrl}).`
      : "")
  return generator.generate(publicContract, {
    info: { title, version: "1.0.0", description },
    ...(options.serverUrl ? { servers: [{ url: options.serverUrl }] } : {}),
    components: { securitySchemes: SECURITY_SCHEMES },
    security: [{ apiKey: [] }],
    customErrorResponseBodySchema: () => ERROR_BODY_JSON_SCHEMA as never,
  })
}

/**
 * One JSON Schema per webhook event type's `data`, converted from `WEBHOOK_DATA_SCHEMAS` with the
 * same Zod-to-JSON-Schema converter `buildV1OpenAPIDocument` uses — so a webhook payload's
 * documented shape and `/v1`'s own schema conversion can never drift apart. Pure and
 * deterministic: two calls produce deep-equal output.
 */
export function buildWebhookEventSchemas(): Record<WebhookEventType, JSONSchema> {
  const converter = new ZodToJsonSchemaConverter()
  const schemas = {} as Record<WebhookEventType, JSONSchema>
  for (const type of Object.keys(WEBHOOK_DATA_SCHEMAS) as WebhookEventType[]) {
    const [, jsonSchema] = converter.convert(WEBHOOK_DATA_SCHEMAS[type], { strategy: "output" })
    schemas[type] = jsonSchema
  }
  return schemas
}

/**
 * One JSON Schema per webhook event type's whole delivery body — the envelope `{ type, timestamp,
 * data }` — converted from `WebhookEventSchema`'s own variants with the same converter, so a field
 * added to the envelope reaches the docs with no second definition. Keys in `WEBHOOK_EVENTS`
 * order; pure and deterministic like `buildWebhookEventSchemas`.
 */
export function buildWebhookEnvelopeSchemas(): Record<WebhookEventType, JSONSchema> {
  const converter = new ZodToJsonSchemaConverter()
  const schemas = {} as Record<WebhookEventType, JSONSchema>
  for (const type of Object.keys(WEBHOOK_DATA_SCHEMAS) as WebhookEventType[]) {
    const variant = WebhookEventSchema.options.find((option) => option.shape.type.value === type)
    if (!variant) throw new Error(`WebhookEventSchema has no envelope for ${type}`)
    const [, jsonSchema] = converter.convert(variant, { strategy: "output" })
    schemas[type] = jsonSchema
  }
  return schemas
}
