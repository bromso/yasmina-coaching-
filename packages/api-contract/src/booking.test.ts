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
import {
  earlyStartRequired,
  opensNewContract,
  startsWithinWithdrawal,
  withdrawalLastDay,
  zonedDay,
} from "./booking-limits"
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
  // 12:00 in Stockholm on Thursday 12 November 2026; day 14 is Thursday 26 November, a weekday.
  const now = new Date("2026-11-12T11:00:00.000Z")

  test("the period is 14 days", () => {
    expect(BOOKING_WITHDRAWAL_DAYS).toBe(14)
  })

  test("counts calendar days in Europe/Stockholm, the last day included", () => {
    expect(withdrawalLastDay(now)).toBe("2026-11-26")
    expect(startsWithinWithdrawal("2026-11-13T09:00:00.000Z", now)).toBe(true)
    // 23:30 on the 26th in Stockholm is still the last day.
    expect(startsWithinWithdrawal("2026-11-26T22:30:00.000Z", now)).toBe(true)
    // 00:30 on the 27th in Stockholm is past it, though it is still the 26th in UTC.
    expect(startsWithinWithdrawal("2026-11-26T23:30:00.000Z", now)).toBe(false)
    expect(startsWithinWithdrawal("2026-12-10T09:00:00.000Z", now)).toBe(false)
  })

  test("the booking day is Stockholm's, around midnight", () => {
    // 23:30 on 12 November in Stockholm, and 00:30 on 13 November (still the 12th in UTC).
    expect(withdrawalLastDay(new Date("2026-11-12T22:30:00.000Z"))).toBe("2026-11-26")
    expect(withdrawalLastDay(new Date("2026-11-12T23:30:00.000Z"))).toBe("2026-11-27")
  })

  test("a last day on a weekend moves to the next working day (lag (1930:173))", () => {
    // Booked Saturday 14 November: day 14 is Saturday 28 November → Monday 30 November.
    const saturday = new Date("2026-11-14T10:00:00.000Z")
    expect(withdrawalLastDay(saturday)).toBe("2026-11-30")
    expect(startsWithinWithdrawal("2026-11-30T09:00:00.000Z", saturday)).toBe(true)
    expect(startsWithinWithdrawal("2026-12-01T09:00:00.000Z", saturday)).toBe(false)
    // Booked Sunday 15 November: day 14 is Sunday 29 November → Monday 30 November.
    expect(withdrawalLastDay(new Date("2026-11-15T10:00:00.000Z"))).toBe("2026-11-30")
  })

  test("a last day on a holiday or an afton moves past every day that is not a working day", () => {
    // Day 14 is julafton (Thursday): juldagen, annandag jul (a Saturday) and Sunday follow.
    expect(withdrawalLastDay(new Date("2026-12-10T10:00:00.000Z"))).toBe("2026-12-28")
    // Day 14 is långfredagen: Saturday, påskdagen and annandag påsk follow.
    expect(withdrawalLastDay(new Date("2026-03-20T10:00:00.000Z"))).toBe("2026-04-07")
    // Day 14 is nationaldagen 6 June 2027, a Sunday.
    expect(withdrawalLastDay(new Date("2027-05-23T10:00:00.000Z"))).toBe("2027-06-07")
  })

  test("across a DST change the Stockholm day still decides", () => {
    // Booked 20 March 2026; DST starts 29 March; the period ends 7 April (see above).
    const spring = new Date("2026-03-20T10:00:00.000Z")
    expect(startsWithinWithdrawal("2026-04-07T21:30:00.000Z", spring)).toBe(true) // 23:30 CEST
    expect(startsWithinWithdrawal("2026-04-07T22:30:00.000Z", spring)).toBe(false) // 00:30 on the 8th
    // Booked Tuesday 20 October 2026; DST ends 25 October; day 14 is Tuesday 3 November.
    const autumn = new Date("2026-10-20T10:00:00.000Z")
    expect(withdrawalLastDay(autumn)).toBe("2026-11-03")
    expect(startsWithinWithdrawal("2026-11-03T22:30:00.000Z", autumn)).toBe(true) // 23:30 CET
    expect(startsWithinWithdrawal("2026-11-03T23:30:00.000Z", autumn)).toBe(false)
  })

  test("a start before today is not within the period", () => {
    expect(startsWithinWithdrawal("2026-11-11T09:00:00.000Z", now)).toBe(false)
  })

  test("only a private booking whose first session is within the period needs the consent", () => {
    const soon = "2026-11-20T09:00:00.000Z"
    const later = "2026-12-01T09:00:00.000Z"
    expect(earlyStartRequired("session", "private", [later, soon], now)).toBe(true)
    expect(earlyStartRequired("session", "private", [later], now)).toBe(false)
    expect(earlyStartRequired("session", "organisation", [soon], now)).toBe(false)
    expect(earlyStartRequired("session", "private", [], now)).toBe(false)
  })

  test("a member's session consumes the membership's contract: no new right, no consent", () => {
    const soon = "2026-11-20T09:00:00.000Z"
    for (const key of MEMBER_OFFERING_KEYS) {
      expect(opensNewContract(key)).toBe(false)
      expect(earlyStartRequired(key, "private", [soon], now)).toBe(false)
    }
    // The start call that begins a membership, and a programme's first order, are new purchases.
    expect(opensNewContract("inner_start_coaching")).toBe(true)
    expect(opensNewContract("package_6")).toBe(true)
    expect(earlyStartRequired("package_6", "private", [soon], now)).toBe(true)
  })

  test("create takes an optional manageToken: a further session of a programme already bought", () => {
    const create = {
      offering: "package_6",
      slots: ["2026-11-20T09:00:00.000Z"],
      audience: "private",
      customer: { name: "Ada Lovelace", email: "ada@example.com" },
      location: "video",
      termsAccepted: true,
    }
    const token = "t".repeat(43)
    expect(BookingCreateSchema.parse(create)).not.toHaveProperty("manageToken")
    expect(BookingCreateSchema.parse({ ...create, manageToken: token }).manageToken).toBe(token)
    for (const manageToken of ["short", 7, "t".repeat(201)]) {
      expect(BookingCreateSchema.safeParse({ ...create, manageToken }).success).toBe(false)
    }
    // A package id is no longer part of the contract, in or out.
    expect(BookingCreateSchema.parse({ ...create, packageId: 7 })).not.toHaveProperty("packageId")
  })

  test("zonedDay is the Stockholm calendar day of an instant", () => {
    expect(zonedDay(new Date("2026-11-12T23:30:00.000Z"))).toBe("2026-11-13")
    expect(zonedDay(new Date("2026-07-01T21:59:00.000Z"))).toBe("2026-07-01")
    expect(zonedDay(new Date("2026-07-01T22:00:00.000Z"))).toBe("2026-07-02")
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
