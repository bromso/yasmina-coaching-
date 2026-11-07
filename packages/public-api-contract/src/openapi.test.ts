import { describe, expect, test } from "bun:test"
import {
  buildV1OpenAPIDocument,
  buildWebhookEnvelopeSchemas,
  buildWebhookEventSchemas,
  ERROR_BODY_JSON_SCHEMA,
} from "./openapi"
import { WEBHOOK_EVENTS } from "./webhook-events"

describe("buildV1OpenAPIDocument", () => {
  test("every route is present, with its method, path and operationId", async () => {
    const doc = await buildV1OpenAPIDocument()
    expect(Object.keys(doc.paths ?? {}).sort()).toEqual([
      "/v1/members",
      "/v1/notes",
      "/v1/notes/{id}",
      "/v1/workspace",
    ])
    const workspace = doc.paths?.["/v1/workspace"]?.get
    expect(workspace?.operationId).toBe("getWorkspace")
    const members = doc.paths?.["/v1/members"]?.get
    expect(members?.operationId).toBe("listMembers")
    const notesList = doc.paths?.["/v1/notes"]?.get
    expect(notesList?.operationId).toBe("listNotes")
    const notesCreate = doc.paths?.["/v1/notes"]?.post
    expect(notesCreate?.operationId).toBe("createNote")
    const noteGet = doc.paths?.["/v1/notes/{id}"]?.get
    expect(noteGet?.operationId).toBe("getNote")
    const noteDelete = doc.paths?.["/v1/notes/{id}"]?.delete
    expect(noteDelete?.operationId).toBe("deleteNote")
  })

  test("every route carries a customer-facing summary and description", async () => {
    const doc = await buildV1OpenAPIDocument()
    const operations = [
      doc.paths?.["/v1/workspace"]?.get,
      doc.paths?.["/v1/members"]?.get,
      doc.paths?.["/v1/notes"]?.get,
      doc.paths?.["/v1/notes"]?.post,
      doc.paths?.["/v1/notes/{id}"]?.get,
      doc.paths?.["/v1/notes/{id}"]?.delete,
    ]
    for (const op of operations) {
      expect(op?.summary).toBeString()
      expect((op?.summary ?? "").length).toBeGreaterThan(0)
      expect(op?.description).toBeString()
      expect((op?.description ?? "").length).toBeGreaterThan(0)
    }
  })

  test("every route's required scope appears in the document (x-required-scope)", async () => {
    const doc = await buildV1OpenAPIDocument()
    const scopeOf = (op: unknown) => (op as Record<string, unknown>)["x-required-scope"]
    expect(scopeOf(doc.paths?.["/v1/workspace"]?.get)).toBe("workspace:read")
    expect(scopeOf(doc.paths?.["/v1/members"]?.get)).toBe("members:read")
    expect(scopeOf(doc.paths?.["/v1/notes"]?.get)).toBe("notes:read")
    expect(scopeOf(doc.paths?.["/v1/notes/{id}"]?.get)).toBe("notes:read")
    expect(scopeOf(doc.paths?.["/v1/notes"]?.post)).toBe("notes:write")
    expect(scopeOf(doc.paths?.["/v1/notes/{id}"]?.delete)).toBe("notes:write")
  })

  test("the bearer security scheme, named by the api key", async () => {
    const doc = await buildV1OpenAPIDocument()
    expect(doc.components?.securitySchemes?.apiKey).toMatchObject({
      type: "http",
      scheme: "bearer",
    })
    expect(doc.security).toEqual([{ apiKey: [] }])
  })

  test("the error body shape documents every /v1 error code", async () => {
    expect(ERROR_BODY_JSON_SCHEMA.properties.error.properties.code.enum).toEqual([
      "unauthorized",
      "forbidden_scope",
      "not_found",
      "validation_failed",
      "rate_limited",
      "internal",
    ])
    const doc = await buildV1OpenAPIDocument()
    // Every declared error on every route answers with the /v1 error shape, not oRPC's default.
    const responses = doc.paths?.["/v1/notes/{id}"]?.get?.responses ?? {}
    expect(JSON.stringify(responses)).toContain("forbidden_scope")
    expect(JSON.stringify(responses)).not.toContain('"defined"')
  })

  test("servers: filled in only when a serverUrl is given", async () => {
    expect((await buildV1OpenAPIDocument()).servers).toBeUndefined()
    const doc = await buildV1OpenAPIDocument({ serverUrl: "https://api.example.com/" })
    expect(doc.servers).toEqual([{ url: "https://api.example.com/" }])
  })

  test("deterministic: two builds deep-equal", async () => {
    const [first, second] = await Promise.all([buildV1OpenAPIDocument(), buildV1OpenAPIDocument()])
    expect(first).toEqual(second)
  })

  test("never names an internal procedure outside /v1", async () => {
    const doc = await buildV1OpenAPIDocument()
    expect(JSON.stringify(doc)).not.toContain("/auth/")
    expect(JSON.stringify(doc)).not.toContain("/admin/")
  })
})

describe("buildWebhookEventSchemas", () => {
  test("one schema per event type, ping included", () => {
    const schemas = buildWebhookEventSchemas()
    expect(Object.keys(schemas).sort()).toEqual([...WEBHOOK_EVENTS].sort())
    expect(WEBHOOK_EVENTS.length).toBe(9)
  })

  test("no event schema carries an email property, anywhere nested", () => {
    const schemas = buildWebhookEventSchemas()
    for (const schema of Object.values(schemas))
      expect(JSON.stringify(schema)).not.toContain("email")
  })

  test("a representative shape: note.deleted is just an id", () => {
    const schemas = buildWebhookEventSchemas()
    expect(schemas["note.deleted"]).toMatchObject({
      type: "object",
      properties: { id: { type: "integer" } },
    })
  })

  test("deterministic: two builds deep-equal", () => {
    expect(buildWebhookEventSchemas()).toEqual(buildWebhookEventSchemas())
  })
})

describe("buildWebhookEnvelopeSchemas", () => {
  test("one envelope per event type: type (its constant), timestamp and that type's data", () => {
    const envelopes = buildWebhookEnvelopeSchemas()
    const data = buildWebhookEventSchemas()
    expect(Object.keys(envelopes)).toEqual([...WEBHOOK_EVENTS])
    for (const type of WEBHOOK_EVENTS) {
      const envelope = envelopes[type] as {
        properties: Record<string, Record<string, unknown>>
        required: string[]
      }
      expect(Object.keys(envelope.properties)).toEqual(["type", "timestamp", "data"])
      expect(envelope.required).toEqual(["type", "timestamp", "data"])
      expect(envelope.properties.type?.const).toBe(type)
      expect(envelope.properties.timestamp?.format).toBe("date-time")
      // The envelope's data is the event's data schema, plus the envelope's own description.
      const { description: _, ...envelopeData } = envelope.properties.data as Record<
        string,
        unknown
      >
      expect(envelopeData).toEqual(data[type] as Record<string, unknown>)
    }
  })

  test("deterministic: two builds deep-equal", () => {
    expect(buildWebhookEnvelopeSchemas()).toEqual(buildWebhookEnvelopeSchemas())
  })
})
