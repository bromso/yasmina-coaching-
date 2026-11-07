import { describe, expect, test } from "bun:test"
import {
  CreateNoteSchema,
  DEFAULT_LIMIT,
  ERROR_CODES,
  ErrorBodySchema,
  MAX_LIMIT,
  MemberSchema,
  NoteSchema,
  PageQuerySchema,
  publicContract,
  SCOPES,
  WorkspaceSchema,
} from "./index"

type Route = { method: string; path: string; successStatus?: number }
const routeOf = (procedure: unknown): Route =>
  (procedure as { "~orpc": { route: Route } })["~orpc"].route

describe("routes", () => {
  test("every route lives under /v1, with the method the design names", () => {
    const routes = [
      routeOf(publicContract.workspace.get),
      routeOf(publicContract.members.list),
      routeOf(publicContract.notes.list),
      routeOf(publicContract.notes.get),
      routeOf(publicContract.notes.create),
      routeOf(publicContract.notes.delete),
    ].map((r) => `${r.method} ${r.path}`)
    expect(routes).toEqual([
      "GET /v1/workspace",
      "GET /v1/members",
      "GET /v1/notes",
      "GET /v1/notes/{id}",
      "POST /v1/notes",
      "DELETE /v1/notes/{id}",
    ])
    expect(routeOf(publicContract.notes.create).successStatus).toBe(201)
    expect(routeOf(publicContract.notes.delete).successStatus).toBe(204)
    const errors = (
      publicContract.notes.create as unknown as {
        "~orpc": { errorMap: Record<string, { status?: number }> }
      }
    )["~orpc"].errorMap
    expect(errors.PAYLOAD_TOO_LARGE?.status).toBe(413)
  })
})

describe("schemas", () => {
  test("the scopes and error codes", () => {
    expect(SCOPES).toEqual(["workspace:read", "members:read", "notes:read", "notes:write"])
    expect(ERROR_CODES).toEqual([
      "unauthorized",
      "forbidden_scope",
      "not_found",
      "validation_failed",
      "rate_limited",
      "internal",
    ])
    expect(
      ErrorBodySchema.parse({ error: { code: "not_found", message: "Note not found" } })
    ).toEqual({ error: { code: "not_found", message: "Note not found" } })
    expect(ErrorBodySchema.safeParse({ error: { code: "NOT_FOUND", message: "x" } }).success).toBe(
      false
    )
  })

  test("page query: limit 1–100, default 25; cursor optional; strings coerce", () => {
    expect(DEFAULT_LIMIT).toBe(25)
    expect(MAX_LIMIT).toBe(100)
    expect(PageQuerySchema.parse({})).toEqual({ limit: 25 })
    expect(PageQuerySchema.parse({ cursor: "7", limit: "100" })).toEqual({ cursor: 7, limit: 100 })
    for (const bad of [{ limit: "0" }, { limit: "101" }, { cursor: "0" }, { cursor: "x" }])
      expect(PageQuerySchema.safeParse(bad).success).toBe(false)
  })

  test("a workspace names its plan; a member carries no email", () => {
    expect(WorkspaceSchema.parse({ id: 1, name: "Acme", slug: "acme", plan: "pro" })).toMatchObject(
      { plan: "pro" }
    )
    expect(Object.keys(MemberSchema.shape).sort()).toEqual(["joinedAt", "name", "role", "userId"])
    const parsed = MemberSchema.parse({
      userId: 1,
      name: "A",
      role: "admin",
      joinedAt: "2026-10-18T00:00:00.000Z",
      email: "a@example.com",
    })
    expect(parsed).not.toHaveProperty("email")
  })

  test("a note's author is a user, an API key or null", () => {
    const base = { id: 1, title: "T", body: "", createdAt: "2026-10-18T00:00:00.000Z" }
    for (const author of [
      { type: "user", id: 1, name: "Ada" },
      { type: "api_key", id: 2, name: "CI" },
      null,
    ])
      expect(NoteSchema.parse({ ...base, author })).toEqual({ ...base, author } as never)
    expect(
      NoteSchema.safeParse({ ...base, author: { type: "bot", id: 1, name: "x" } }).success
    ).toBe(false)
  })

  test("creating a note: a 1–200 title, a body up to 10 000 characters, defaulting to empty", () => {
    expect(CreateNoteSchema.parse({ title: "Hi" })).toEqual({ title: "Hi", body: "" })
    expect(CreateNoteSchema.safeParse({ title: "" }).success).toBe(false)
    expect(CreateNoteSchema.safeParse({ title: "x".repeat(201) }).success).toBe(false)
    expect(CreateNoteSchema.safeParse({ title: "x", body: "y".repeat(10_001) }).success).toBe(false)
  })
})
