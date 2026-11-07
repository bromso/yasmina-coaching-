import { describe, expect, test } from "bun:test"
import { CreateNoteSchema, CreateWorkspaceSchema } from "@repo/api-contract"
import { appTranslator, type ZodLikeIssue, zodMessage } from "./i18n"

const issues = (schema: { safeParse(v: unknown): { error?: { issues: unknown[] } } }, v: unknown) =>
  (schema.safeParse(v).error?.issues ?? []) as ZodLikeIssue[]

describe("appTranslator", () => {
  test("English by default, Swedish on request", () => {
    expect(appTranslator()("notes.empty")).toBe("No notes yet.")
    expect(appTranslator("sv")("notes.empty")).toBe("Inga anteckningar än.")
  })

  test("roles are named in the reader's language; English keeps the raw role", () => {
    expect(appTranslator("en")("role", { role: "admin" })).toBe("admin")
    expect(appTranslator("sv")("role", { role: "admin" })).toBe("administratör")
    expect(appTranslator("sv")("role", { role: "viewer" })).toBe("läsare")
  })

  test("HereNow's count is an ICU plural", () => {
    expect(appTranslator("en")("notes.hereNow", { count: 1 })).toBe("1 person here")
    expect(appTranslator("en")("notes.hereNow", { count: 3 })).toBe("3 people here")
    expect(appTranslator("sv")("notes.hereNow", { count: 1 })).toBe("1 person här")
    expect(appTranslator("sv")("notes.hereNow", { count: 3 })).toBe("3 personer här")
  })
})

describe("zodMessage", () => {
  const en = zodMessage(appTranslator("en"))
  const sv = zodMessage(appTranslator("sv"))
  const note = (fields: Record<string, unknown>) =>
    issues(CreateNoteSchema, { workspaceId: "7", title: "Ok", ...fields })

  test("a missing note title is required, in English exactly as before", () => {
    const [issue] = note({ title: "" })
    expect(en(issue)).toBe("Title is required")
    expect(sv(issue)).toBe("Titeln måste fyllas i")
  })

  test("an over-long title or body names the limit", () => {
    const [title] = note({ title: "x".repeat(201) })
    expect(en(title)).toBe("Title must be at most 200 characters")
    expect(sv(title)).toBe("Titeln får innehålla högst 200 tecken")
    const [body] = note({ body: "y".repeat(10_001) })
    expect(en(body)).toBe("Body must be at most 10000 characters")
    expect(sv(body)).toBe("Texten får innehålla högst 10000 tecken")
  })

  test("a wrong type is invalid", () => {
    const [issue] = note({ title: 5 })
    expect(en(issue)).toBe("Title is invalid")
    expect(sv(issue)).toBe("Titeln är ogiltig")
  })

  test("a bad hidden workspace id asks for a reload", () => {
    const [issue] = issues(CreateNoteSchema, { workspaceId: "abc", title: "Ok" })
    expect(en(issue)).toBe("Reload the page and try again")
    expect(sv(issue)).toBe("Ladda om sidan och försök igen")
  })

  test("a workspace name: empty, too long, a control character", () => {
    const [empty] = issues(CreateWorkspaceSchema, { name: "   " })
    expect(en(empty)).toBe("Name is required")
    expect(sv(empty)).toBe("Namnet måste fyllas i")
    const [long] = issues(CreateWorkspaceSchema, { name: "x".repeat(101) })
    expect(sv(long)).toBe("Namnet får innehålla högst 100 tecken")
    const [control] = issues(CreateWorkspaceSchema, { name: "a\u0007b" })
    expect(en(control)).toBe("Name contains an invalid character")
    expect(sv(control)).toBe("Namnet innehåller ett ogiltigt tecken")
  })

  test("never reads the issue's own English message", () => {
    const issue: ZodLikeIssue = { code: "too_small", path: ["title"], minimum: 1, message: "X" }
    expect(sv(issue)).toBe("Titeln måste fyllas i")
  })
})
