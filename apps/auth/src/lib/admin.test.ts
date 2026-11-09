import { describe, expect, test } from "bun:test"
import type { Me } from "@repo/api-contract"
import {
  auditExportDateBounds,
  auditExportDefaultRange,
  canUseAdmin,
  formatDateTime,
  formatDay,
  formatStockholm,
  formatStockholmTime,
  parseCursor,
  parseDays,
  parseJob,
  parseSuspended,
  stockholmDay,
  suspendUntilBounds,
} from "./admin"

const me = (over: Partial<Me["user"]>, impersonation: Me["impersonation"] = null): Me => ({
  user: {
    id: 1,
    email: "root@example.com",
    name: "Root",
    createdAt: "2026-01-01T00:00:00.000Z",
    emailVerified: true,
    hasPassword: true,
    superadmin: true,
    avatarUrl: null,
    locale: "en" as const,
    deletionScheduledAt: null,
    passkeys: 0,
    twoFactorSatisfied: false,
    ...over,
  },
  session: { id: 1, expiresAt: "2027-01-01T00:00:00.000Z" },
  impersonation,
  localeChosen: false,
})

describe("canUseAdmin", () => {
  test("superadmin and not impersonating", () => {
    expect(canUseAdmin(me({}))).toBe(true)
    expect(canUseAdmin(me({ superadmin: false }))).toBe(false)
    expect(canUseAdmin(null)).toBe(false)
    expect(
      canUseAdmin(
        me(
          {},
          {
            by: { id: 2, name: "", email: "x@example.com" },
            reason: "r",
            expiresAt: "2027-01-01T00:00:00.000Z",
          }
        )
      )
    ).toBe(false)
  })
})

test("parseCursor accepts positive integers only", () => {
  expect(parseCursor("12")).toBe(12)
  expect(parseCursor("0")).toBeUndefined()
  expect(parseCursor("x")).toBeUndefined()
  expect(parseCursor(undefined)).toBeUndefined()
  expect(parseCursor(["3", "4"])).toBeUndefined()
})

test("formatDateTime is fixed to en/UTC", () => {
  expect(formatDateTime("2026-06-01T13:05:00.000Z")).toBe("Jun 1, 2026, 13:05 UTC")
  expect(formatDateTime("2026-12-31T00:05:00.000Z")).toBe("Dec 31, 2026, 00:05 UTC")
})

test("formatStockholm shows Europe/Stockholm wall-clock time, en-GB order", () => {
  // CEST (UTC+2) in June, CET (UTC+1) in December.
  expect(formatStockholm("2026-06-01T13:05:00.000Z")).toBe("Mon 1 Jun 2026, 15:05")
  expect(formatStockholm("2026-12-31T00:05:00.000Z")).toBe("Thu 31 Dec 2026, 01:05")
  expect(formatStockholmTime("2026-06-01T13:05:00.000Z")).toBe("15:05")
})

test("stockholmDay is the Stockholm calendar date, which can differ from the UTC one", () => {
  expect(stockholmDay("2026-06-01T22:30:00.000Z")).toBe("2026-06-02")
  expect(stockholmDay("2026-12-31T23:30:00.000Z")).toBe("2027-01-01")
  expect(stockholmDay(new Date("2026-06-01T10:00:00.000Z"))).toBe("2026-06-01")
})

test("formatDay prints a YYYY-MM-DD date without a zone shift", () => {
  expect(formatDay("2026-06-01")).toBe("Mon 1 Jun 2026")
  expect(formatDay("2026-12-31")).toBe("Thu 31 Dec 2026")
})

test("parseJob trims and clamps to the contract's 100-character max", () => {
  expect(parseJob("designer")).toBe("designer")
  expect(parseJob("  designer  ")).toBe("designer")
  expect(parseJob("")).toBeUndefined()
  expect(parseJob("   ")).toBeUndefined()
  expect(parseJob(undefined)).toBeUndefined()
  expect(parseJob(["a", "b"])).toBe("a")
  expect(parseJob("x".repeat(100))).toBe("x".repeat(100))
  expect(parseJob("x".repeat(101))).toBeUndefined()
})

test("parseDays accepts only 7, 30 or 90, falling back to 7 for anything else", () => {
  expect(parseDays("7")).toBe(7)
  expect(parseDays("30")).toBe(30)
  expect(parseDays("90")).toBe(90)
  expect(parseDays("14")).toBe(7)
  expect(parseDays("abc")).toBe(7)
  expect(parseDays(undefined)).toBe(7)
  expect(parseDays(["30", "90"])).toBe(30)
})

test("parseSuspended: only the literal 'true' filters; anything else is no filter", () => {
  expect(parseSuspended("true")).toBe(true)
  expect(parseSuspended("false")).toBeUndefined()
  expect(parseSuspended("")).toBeUndefined()
  expect(parseSuspended(undefined)).toBeUndefined()
  expect(parseSuspended(["true", "false"])).toBe(true)
})

test("suspendUntilBounds: tomorrow through the last day whose end stays within 365 days, UTC", () => {
  // 365 days on is 2027-06-01T13:00Z; picking 2027-06-01 would end at 2027-06-02T00:00Z, past it.
  expect(suspendUntilBounds(new Date("2026-06-01T13:00:00.000Z"))).toEqual({
    min: "2026-06-02",
    max: "2027-05-31",
  })
  // Crossing a UTC day/month boundary rolls over correctly (native Date arithmetic).
  expect(suspendUntilBounds(new Date("2026-12-31T23:59:00.000Z"))).toEqual({
    min: "2027-01-01",
    max: "2027-12-30",
  })
  // At midnight the last day ends exactly 365 days on, which the api accepts (inclusive).
  expect(suspendUntilBounds(new Date("2026-06-01T00:00:00.000Z")).max).toBe("2027-05-31")
})

describe("auditExportDefaultRange", () => {
  test("the last 30 UTC days: today-29 through today", () => {
    expect(auditExportDefaultRange(new Date("2026-10-18T13:00:00.000Z"))).toEqual({
      from: "2026-09-19",
      to: "2026-10-18",
    })
  })

  test("crosses a UTC year boundary correctly", () => {
    expect(auditExportDefaultRange(new Date("2026-01-05T00:00:00.000Z"))).toEqual({
      from: "2025-12-07",
      to: "2026-01-05",
    })
  })

  test("the time of day never changes the UTC date", () => {
    expect(auditExportDefaultRange(new Date("2026-10-18T23:59:59.000Z")).to).toBe("2026-10-18")
    expect(auditExportDefaultRange(new Date("2026-10-18T00:00:00.000Z")).to).toBe("2026-10-18")
  })
})

describe("auditExportDateBounds", () => {
  test("min is the oldest day an entry can still exist (today − rowDays), max tomorrow (UTC)", () => {
    expect(auditExportDateBounds(new Date("2026-10-18T13:00:00.000Z"), 365)).toEqual({
      min: "2025-10-18",
      max: "2026-10-19",
    })
  })

  test("crosses month and year boundaries, and the time of day never moves the UTC date", () => {
    expect(auditExportDateBounds(new Date("2026-12-31T23:59:59.000Z"), 180)).toEqual({
      min: "2026-07-04",
      max: "2027-01-01",
    })
  })
})
