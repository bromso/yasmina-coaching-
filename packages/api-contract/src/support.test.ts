import { describe, expect, test } from "bun:test"
import { SupportCreateSchema, supportPage, supportReference } from "./support"

describe("support schemas", () => {
  const valid = { email: " Ada@Example.com ", topic: "billing", message: "  Help me please  " }

  test("the email is normalised and the text trimmed", () => {
    expect(SupportCreateSchema.parse({ ...valid, name: " Ada " })).toEqual({
      email: "ada@example.com",
      name: "Ada",
      topic: "billing",
      message: "Help me please",
    })
  })

  test("each field's bounds", () => {
    const bad = (patch: Record<string, unknown>) =>
      SupportCreateSchema.safeParse({ ...valid, ...patch }).success
    expect(bad({ email: "nope" })).toBe(false)
    expect(bad({ topic: "sales" })).toBe(false)
    expect(bad({ message: "too short" })).toBe(false)
    expect(bad({ message: "x".repeat(5001) })).toBe(false)
    expect(bad({ message: "x".repeat(5000) })).toBe(true)
    expect(bad({ name: "x".repeat(101) })).toBe(false)
    expect(bad({ name: "x".repeat(100) })).toBe(true)
  })

  test("supportPage keeps a root-relative help path and drops anything else", () => {
    expect(supportPage("/billing/plans")).toBe("/billing/plans")
    expect(supportPage("/")).toBe("/")
    expect(supportPage(`/${"a".repeat(199)}`)).toHaveLength(200)
    expect(supportPage(`/${"a".repeat(200)}`)).toBeNull()
    for (const bad of ["https://evil.example", "//evil.example", "billing", "/Billing", "/a?b=1"]) {
      expect(supportPage(bad)).toBeNull()
    }
    expect(supportPage(undefined)).toBeNull()
    expect(supportPage(null)).toBeNull()
  })

  test("a bad page is caught to undefined by the schema, never a refusal", () => {
    const page = (value: unknown) => SupportCreateSchema.parse({ ...valid, page: value }).page
    expect(page("/billing/plans")).toBe("/billing/plans")
    expect(page(`/${"a".repeat(199)}`)).toHaveLength(200)
    expect(page(`/${"a".repeat(200)}`)).toBeUndefined()
    expect(page("x".repeat(10_000))).toBeUndefined()
    expect(page("https://evil.example")).toBeUndefined()
    expect(page(42)).toBeUndefined()
    expect(SupportCreateSchema.parse(valid).page).toBeUndefined()
  })

  test("the reference is HELP-<id>", () => {
    expect(supportReference(42)).toBe("HELP-42")
  })
})
