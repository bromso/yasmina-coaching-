import { describe, expect, test } from "bun:test"
import {
  AdminListSchema,
  AUDIT_EXPORT_CAP_MESSAGE,
  AuditExportSchema,
  AuditListSchema,
  auditExportCapMessage,
  ImpersonateSchema,
} from "./admin"

describe("admin schemas", () => {
  test("list input: q trimmed and capped at 100, limit 1..100 default 50, cursor coerced", () => {
    expect(AdminListSchema.parse({})).toEqual({ limit: 50 })
    expect(AdminListSchema.parse({ q: "  ada ", cursor: "12", limit: "10" })).toEqual({
      q: "ada",
      cursor: 12,
      limit: 10,
    })
    expect(AdminListSchema.safeParse({ q: "x".repeat(101) }).success).toBe(false)
    expect(AdminListSchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(AdminListSchema.safeParse({ limit: 101 }).success).toBe(false)
  })
  test("impersonate: reason trimmed, 3..200 chars", () => {
    expect(ImpersonateSchema.parse({ id: 4, reason: "  ticket #12 " })).toEqual({
      id: 4,
      reason: "ticket #12",
    })
    expect(ImpersonateSchema.safeParse({ id: 4, reason: " ab " }).success).toBe(false)
    expect(ImpersonateSchema.safeParse({ id: 4, reason: "x".repeat(201) }).success).toBe(false)
  })
  test("audit list filters are optional and coerced", () => {
    expect(AuditListSchema.parse({ actorId: "3", targetType: "user", targetId: "9" })).toEqual({
      actorId: 3,
      targetType: "user",
      targetId: "9",
      limit: 50,
    })
  })
  test("audit export: a valid same-day range", () => {
    expect(
      AuditExportSchema.parse({ from: "2026-10-18", to: "2026-10-18", format: "csv" })
    ).toEqual({ from: "2026-10-18", to: "2026-10-18", format: "csv" })
  })
  test("audit export: a range exactly 366 days apart is accepted", () => {
    // 2024 is a leap year: Jan 1 to the following Jan 1 is 366 days apart.
    expect(
      AuditExportSchema.safeParse({ from: "2024-01-01", to: "2025-01-01", format: "jsonl" }).success
    ).toBe(true)
  })
  test("audit export: a range 367 days apart is refused", () => {
    expect(
      AuditExportSchema.safeParse({ from: "2024-01-01", to: "2025-01-02", format: "jsonl" }).success
    ).toBe(false)
  })
  test("audit export: from after to is refused", () => {
    expect(
      AuditExportSchema.safeParse({ from: "2026-10-18", to: "2026-10-17", format: "csv" }).success
    ).toBe(false)
  })
  test("audit export: a non-calendar date (Feb 30, month 13) is refused even though it matches the regex shape", () => {
    expect(
      AuditExportSchema.safeParse({ from: "2026-02-30", to: "2026-02-30", format: "csv" }).success
    ).toBe(false)
    expect(
      AuditExportSchema.safeParse({ from: "2026-13-01", to: "2026-13-01", format: "csv" }).success
    ).toBe(false)
  })
  test("audit export: a malformed date string is refused", () => {
    expect(
      AuditExportSchema.safeParse({ from: "10/18/2026", to: "2026-10-18", format: "csv" }).success
    ).toBe(false)
  })
  test("audit export: an unknown format is refused", () => {
    expect(
      AuditExportSchema.safeParse({ from: "2026-10-18", to: "2026-10-18", format: "xml" }).success
    ).toBe(false)
  })
  test("audit export: filters are optional and coerced like audit list's", () => {
    expect(
      AuditExportSchema.parse({
        from: "2026-10-18",
        to: "2026-10-18",
        format: "csv",
        actorId: "3",
        targetType: "user",
        targetId: "9",
      })
    ).toEqual({
      from: "2026-10-18",
      to: "2026-10-18",
      format: "csv",
      actorId: 3,
      targetType: "user",
      targetId: "9",
    })
  })
  test("auditExportCapMessage: the production default matches AUDIT_EXPORT_CAP_MESSAGE exactly", () => {
    expect(auditExportCapMessage(100_000)).toBe(AUDIT_EXPORT_CAP_MESSAGE)
  })
  test("auditExportCapMessage: a small override reads its own number, unformatted", () => {
    expect(auditExportCapMessage(1)).toBe("Narrow the date range: more than 1 entries match.")
  })
  test("auditExportCapMessage: a mid-size cap gets one space thousands separator", () => {
    expect(auditExportCapMessage(12_345)).toBe(
      "Narrow the date range: more than 12 345 entries match."
    )
  })
})
