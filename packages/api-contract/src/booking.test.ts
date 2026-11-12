import { describe, expect, test } from "bun:test"
import {
  AdminGroupEventCreateSchema,
  BOOKING_WITHDRAWAL_DAYS,
  BookingCreateSchema,
  BookingGroupEventsSchema,
  BookingRequestSchema,
  BookingReserveSchema,
  GROUP_OFFERING_KEYS,
  MEMBER_OFFERING_KEYS,
  OFFERINGS,
} from "./booking"
import { earlyStartRequired, startsWithinWithdrawal } from "./booking-limits"
import { TERMS_VERSION } from "./legal"

describe("Ledarskap inifrån offerings", () => {
  test("the start calls are 90-minute instant offerings", () => {
    for (const key of [
      "inner_start_coaching",
      "inner_start_mentoring",
      "inner_start_lifestyle",
    ] as const) {
      expect(OFFERINGS[key].kind).toBe("instant")
      expect(OFFERINGS[key].durationMinutes).toBe(90)
      expect(OFFERINGS[key].sessions).toBe(1)
    }
  })
  test("the mentoring session is a 90-minute instant offering", () => {
    expect(OFFERINGS.inner_mentoring_session.kind).toBe("instant")
    expect(OFFERINGS.inner_mentoring_session.durationMinutes).toBe(90)
  })
  test("the inner group is a two-hour group offering", () => {
    expect(OFFERINGS.inner_group.kind).toBe("group")
    expect(OFFERINGS.inner_group.durationMinutes).toBe(120)
  })
  test("group and member key lists", () => {
    expect([...GROUP_OFFERING_KEYS]).toEqual(["group", "inner_group"])
    expect([...MEMBER_OFFERING_KEYS]).toEqual(["inner_session", "inner_mentoring_session"])
  })
  test("groupEvents input defaults to the plain group", () => {
    expect(BookingGroupEventsSchema.parse({})).toEqual({ offering: "group" })
    expect(BookingGroupEventsSchema.parse({ offering: "inner_group" }).offering).toBe("inner_group")
  })
  test("admin group event create takes only group offerings", () => {
    const base = {
      title: "Träff",
      startsAt: "2027-01-12T09:00:00.000Z",
      durationMinutes: 120,
      capacity: 8,
      location: "video",
    }
    expect(AdminGroupEventCreateSchema.parse(base).offering).toBe("group")
    expect(AdminGroupEventCreateSchema.safeParse({ ...base, offering: "session" }).success).toBe(
      false
    )
    expect(AdminGroupEventCreateSchema.parse({ ...base, offering: "inner_group" }).offering).toBe(
      "inner_group"
    )
  })
})

describe("consent to the terms", () => {
  const customer = { name: "Ada Lovelace", email: "ada@example.com", organisation: "SKR" }
  const inputs = [
    [
      BookingCreateSchema,
      {
        offering: "session",
        slots: ["2026-03-02T09:00:00.000Z"],
        audience: "private",
        customer,
        location: "video",
      },
    ],
    [BookingReserveSchema, { eventIds: [3], audience: "private", customer }],
    [
      BookingRequestSchema,
      {
        offering: "keynote",
        customer,
        location: "on_site",
        preferredDates: [{ date: "2026-04-01", part: "morning" }],
        message: "Opening keynote at our conference.",
      },
    ],
  ] as const

  test("every booking write needs termsAccepted: true, and nothing else counts", () => {
    for (const [schema, input] of inputs) {
      expect(schema.safeParse({ ...input, termsAccepted: true }).success).toBe(true)
      expect(schema.safeParse(input).success).toBe(false)
      for (const termsAccepted of [false, "on", "true", 1]) {
        expect(schema.safeParse({ ...input, termsAccepted }).success).toBe(false)
      }
    }
  })

  test("a version from the client is not part of the input", () => {
    for (const [schema, input] of inputs) {
      const parsed = schema.parse({ ...input, termsAccepted: true, termsVersion: "1999-01-01" })
      expect(parsed).not.toHaveProperty("termsVersion")
    }
  })

  test("TERMS_VERSION is a calendar date", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("a start within the withdrawal period", () => {
  // 12:00 in Stockholm on 12 November; the period's last day is 26 November.
  const now = new Date("2026-11-12T11:00:00.000Z")

  test("the period is 14 days", () => {
    expect(BOOKING_WITHDRAWAL_DAYS).toBe(14)
  })

  test("counts calendar days in Europe/Stockholm, the 14th day included", () => {
    expect(startsWithinWithdrawal("2026-11-13T09:00:00.000Z", now)).toBe(true)
    // 23:30 on the 26th in Stockholm is still the 14th day, though it is the 26th in UTC too.
    expect(startsWithinWithdrawal("2026-11-26T22:30:00.000Z", now)).toBe(true)
    // 00:30 on the 27th in Stockholm is the 15th day, though it is still the 26th in UTC.
    expect(startsWithinWithdrawal("2026-11-26T23:30:00.000Z", now)).toBe(false)
    expect(startsWithinWithdrawal("2026-12-10T09:00:00.000Z", now)).toBe(false)
  })

  test("a start before today is not within the period", () => {
    expect(startsWithinWithdrawal("2026-11-11T09:00:00.000Z", now)).toBe(false)
  })

  test("only a private booking with a start within the period needs the consent", () => {
    const soon = "2026-11-20T09:00:00.000Z"
    const later = "2026-12-01T09:00:00.000Z"
    expect(earlyStartRequired("private", [later, soon], now)).toBe(true)
    expect(earlyStartRequired("private", [later], now)).toBe(false)
    expect(earlyStartRequired("organisation", [soon], now)).toBe(false)
    expect(earlyStartRequired("private", [], now)).toBe(false)
  })

  test("create and reserve take an optional earlyStart boolean; request has none", () => {
    const customer = { name: "Ada Lovelace", email: "ada@example.com" }
    const create = {
      offering: "session",
      slots: ["2026-11-20T09:00:00.000Z"],
      audience: "private",
      customer,
      location: "video",
      termsAccepted: true,
    }
    const reserve = { eventIds: [3], audience: "private", customer, termsAccepted: true }
    for (const [schema, input] of [
      [BookingCreateSchema, create],
      [BookingReserveSchema, reserve],
    ] as const) {
      expect(schema.parse(input)).not.toHaveProperty("earlyStart")
      expect(schema.parse({ ...input, earlyStart: true }).earlyStart).toBe(true)
      expect(schema.safeParse({ ...input, earlyStart: "on" }).success).toBe(false)
    }
    const request = BookingRequestSchema.parse({
      offering: "keynote",
      customer: { ...customer, organisation: "SKR" },
      location: "on_site",
      preferredDates: [{ date: "2026-12-01", part: "morning" }],
      message: "Opening keynote at our conference.",
      termsAccepted: true,
      earlyStart: true,
    })
    expect(request).not.toHaveProperty("earlyStart")
  })
})
