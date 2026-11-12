import { describe, expect, test } from "bun:test"
import {
  AdminGroupEventCreateSchema,
  BookingCreateSchema,
  BookingGroupEventsSchema,
  BookingRequestSchema,
  BookingReserveSchema,
  GROUP_OFFERING_KEYS,
  MEMBER_OFFERING_KEYS,
  OFFERINGS,
} from "./booking"
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
