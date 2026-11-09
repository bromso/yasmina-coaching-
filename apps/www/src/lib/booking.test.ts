import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import type { GroupEvent } from "@repo/api-contract"
import {
  bookCore,
  bookingFieldErrors,
  CONFIRM_REQUIRED,
  cancelBookingCore,
  DATE_TOO_SOON,
  doneUrl,
  GENERIC_FAILURE,
  isOwnManageUrl,
  parseAvailabilityQuery,
  requestBookingCore,
  reserveSeatsCore,
} from "./booking"
import { groupBySeries } from "./group-events"

const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const v of value) fd.append(key, v)
    else fd.set(key, value)
  }
  return fd
}

const customer = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  organisation: "Varbergs kommun",
  phone: "",
}

const created = {
  reference: "BK-7",
  manageUrl: "https://www.example.com/book/manage/tok",
  bookings: [],
  package: null,
}

const conflict = (message: string) => new ORPCError("CONFLICT", { defined: true, message })
const limited = new ORPCError("TOO_MANY_REQUESTS", {
  defined: true,
  message: "Too many booking attempts, try again later.",
})

describe("bookCore", () => {
  const good = form({
    ...customer,
    offering: "session",
    audience: "organisation",
    location: "video",
    slots: ["2026-03-02T09:00:00.000Z"],
    notes: "First time",
  })

  test("happy path redirects to the done page with the reference and manage link", async () => {
    let sent: unknown
    const out = await bookCore(
      {
        api: {
          book: async (input) => {
            sent = input
            return created
          },
        },
      },
      good
    )
    expect(out).toEqual({ ok: true, redirectTo: doneUrl("BK-7", created.manageUrl) })
    expect(sent).toMatchObject({
      offering: "session",
      slots: ["2026-03-02T09:00:00.000Z"],
      customer: { name: "Ada Lovelace", email: "ada@example.com", organisation: "Varbergs kommun" },
      location: "video",
      notes: "First time",
    })
    // An empty phone is left out, not sent as "".
    expect((sent as { customer: { phone?: string } }).customer.phone).toBeUndefined()
  })

  test("validation → one message per flat field, nothing sent", async () => {
    let calls = 0
    const out = await bookCore(
      {
        api: {
          book: async () => {
            calls++
            return created
          },
        },
      },
      form({ offering: "session", audience: "private", location: "on_site", name: "A", email: "x" })
    )
    expect(calls).toBe(0)
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error("unreachable")
    expect(out.fieldErrors).toMatchObject({
      name: expect.any(String),
      email: expect.any(String),
      slots: expect.any(String),
      location: "Not offered there",
    })
    expect(out.values).toMatchObject({ name: "A", email: "x", offering: "session" })
  })

  test("more slots than the offering covers is a slots error", async () => {
    const out = await bookCore(
      { api: { book: async () => created } },
      form({
        ...customer,
        offering: "session",
        audience: "private",
        location: "video",
        slots: ["2026-03-02T09:00:00.000Z", "2026-03-09T09:00:00.000Z"],
      })
    )
    expect(out).toMatchObject({ ok: false, fieldErrors: { slots: expect.stringContaining("1") } })
  })

  test("CONFLICT shows the api's message with its code so the calendar reopens", async () => {
    const out = await bookCore(
      {
        api: {
          book: async () => {
            throw conflict("That time is no longer available. Pick another slot.")
          },
        },
      },
      good
    )
    expect(out).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: "That time is no longer available. Pick another slot.",
      values: { email: "ada@example.com", slots: "2026-03-02T09:00:00.000Z" },
    })
  })

  test("TOO_MANY_REQUESTS shows the api's message; anything undeclared is the generic failure", async () => {
    expect(
      await bookCore(
        {
          api: {
            book: async () => {
              throw limited
            },
          },
        },
        good
      )
    ).toMatchObject({ ok: false, code: "TOO_MANY_REQUESTS", message: limited.message })
    expect(
      await bookCore(
        {
          api: {
            book: async () => {
              throw new Error("down")
            },
          },
        },
        good
      )
    ).toMatchObject({ ok: false, message: GENERIC_FAILURE.sv })
    expect(
      await bookCore(
        {
          api: {
            book: async () => {
              throw new ORPCError("BAD_REQUEST", { defined: false, message: "nope" })
            },
          },
        },
        good
      )
    ).toMatchObject({ ok: false, message: GENERIC_FAILURE.sv })
  })
})

describe("reserveSeatsCore", () => {
  const good = form({ ...customer, audience: "private", eventIds: ["3", "4"] })

  test("happy path sends numeric event ids and redirects", async () => {
    let sent: unknown
    const out = await reserveSeatsCore(
      {
        api: {
          reserve: async (input) => {
            sent = input
            return created
          },
        },
      },
      good
    )
    expect(out).toEqual({ ok: true, redirectTo: doneUrl("BK-7", created.manageUrl) })
    expect(sent).toMatchObject({ eventIds: [3, 4], audience: "private" })
  })

  test("no event ticked is an eventIds error", async () => {
    const out = await reserveSeatsCore(
      { api: { reserve: async () => created } },
      form({ ...customer, audience: "private" })
    )
    expect(out).toMatchObject({ ok: false, fieldErrors: { eventIds: expect.any(String) } })
  })

  test("a non-numeric id never reaches the api", async () => {
    let calls = 0
    const out = await reserveSeatsCore(
      {
        api: {
          reserve: async () => {
            calls++
            return created
          },
        },
      },
      form({ ...customer, audience: "private", eventIds: ["abc"] })
    )
    expect(calls).toBe(0)
    expect(out).toMatchObject({ ok: false, fieldErrors: { eventIds: expect.any(String) } })
  })

  test("CONFLICT (seats full) shows the api's message", async () => {
    const out = await reserveSeatsCore(
      {
        api: {
          reserve: async () => {
            throw conflict("That session is fully booked.")
          },
        },
      },
      good
    )
    expect(out).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: "That session is fully booked.",
    })
  })
})

describe("requestBookingCore", () => {
  const now = () => new Date("2026-03-01T10:00:00Z")
  const good = form({
    ...customer,
    offering: "workshop",
    location: "on_site",
    date_1: "2026-03-10",
    part_1: "full_day",
    date_2: "",
    part_2: "morning",
    date_3: "2026-03-12",
    part_3: "afternoon",
    attendees: "12",
    venue: "Town hall, room 3",
    message: "A team day for the management group before the reorganisation.",
  })

  test("happy path: empty dates are skipped, attendees is a number, kind=request on the way out", async () => {
    let sent: unknown
    const out = await requestBookingCore(
      {
        api: {
          request: async (input) => {
            sent = input
            return { reference: "BK-9", manageUrl: created.manageUrl }
          },
        },
        now,
      },
      good
    )
    expect(out).toEqual({ ok: true, redirectTo: doneUrl("BK-9", created.manageUrl, "request") })
    expect(sent).toMatchObject({
      offering: "workshop",
      preferredDates: [
        { date: "2026-03-10", part: "full_day" },
        { date: "2026-03-12", part: "afternoon" },
      ],
      attendees: 12,
      venue: "Town hall, room 3",
      customer: { organisation: "Varbergs kommun" },
    })
  })

  test("validation: organisation and message required, no dates lands on date_1, a bad part on its own field", async () => {
    const out = await requestBookingCore(
      { api: { request: async () => ({ reference: "", manageUrl: "" }) }, now },
      form({
        offering: "keynote",
        location: "video",
        name: "Ada Lovelace",
        email: "ada@example.com",
        organisation: "",
        message: "short",
      })
    )
    expect(out).toMatchObject({
      ok: false,
      fieldErrors: {
        organisation: expect.any(String),
        message: expect.any(String),
        date_1: expect.any(String),
      },
    })
    const bad = await requestBookingCore(
      { api: { request: async () => ({ reference: "", manageUrl: "" }) }, now },
      form({
        ...customer,
        offering: "keynote",
        location: "video",
        date_1: "2026-03-10",
        part_1: "evening",
        message: "A talk for the whole administration's management day.",
      })
    )
    expect(bad).toMatchObject({ ok: false, fieldErrors: { part_1: expect.any(String) } })
  })

  test("a date before tomorrow (booking zone) is refused on its own field", async () => {
    let calls = 0
    const out = await requestBookingCore(
      {
        api: {
          request: async () => {
            calls++
            return { reference: "", manageUrl: "" }
          },
        },
        now,
      },
      form({
        ...customer,
        offering: "workshop",
        location: "video",
        date_1: "2026-03-01",
        part_1: "morning",
        date_2: "2026-03-02",
        part_2: "morning",
        message: "A team day for the management group before the reorganisation.",
      })
    )
    expect(calls).toBe(0)
    expect(out).toMatchObject({ ok: false, fieldErrors: { date_1: DATE_TOO_SOON.sv } })
    if (out.ok) throw new Error("unreachable")
    expect(out.fieldErrors).not.toHaveProperty("date_2")
  })

  test("TOO_MANY_REQUESTS shows the api's message; a crash is generic", async () => {
    expect(
      await requestBookingCore(
        {
          api: {
            request: async () => {
              throw limited
            },
          },
          now,
        },
        good
      )
    ).toMatchObject({ ok: false, message: limited.message })
    expect(
      await requestBookingCore(
        {
          api: {
            request: async () => {
              throw new TypeError("fetch failed")
            },
          },
          now,
        },
        good
      )
    ).toMatchObject({ ok: false, message: GENERIC_FAILURE.sv })
  })
})

describe("cancelBookingCore", () => {
  const token = "t".repeat(32)

  test("happy path sends the token and a numeric id, then reloads the manage page", async () => {
    let sent: unknown
    const out = await cancelBookingCore(
      {
        api: {
          cancel: async (input) => {
            sent = input
            return { ok: true as const }
          },
        },
      },
      form({ token, bookingId: "42", confirm: "yes" })
    )
    expect(sent).toEqual({ token, bookingId: 42 })
    expect(out).toEqual({ ok: true, redirectTo: `/book/manage/${token}?cancelled=42` })
  })

  test("without the confirm box nothing is sent", async () => {
    let calls = 0
    const out = await cancelBookingCore(
      {
        api: {
          cancel: async () => {
            calls++
            return { ok: true as const }
          },
        },
      },
      form({ token, bookingId: "42" })
    )
    expect(calls).toBe(0)
    expect(out).toMatchObject({ ok: false, fieldErrors: { confirm: CONFIRM_REQUIRED.sv } })
  })

  test("a malformed token or id is a field error", async () => {
    const out = await cancelBookingCore(
      { api: { cancel: async () => ({ ok: true as const }) } },
      form({ token: "short", bookingId: "x", confirm: "yes" })
    )
    expect(out).toMatchObject({
      ok: false,
      fieldErrors: { token: expect.any(String), bookingId: expect.any(String) },
    })
  })

  test("CONFLICT (inside the cutoff) and NOT_FOUND show the api's message; a crash is generic", async () => {
    const late = "Sessions can be cancelled online until 24 hours before they start."
    expect(
      await cancelBookingCore(
        {
          api: {
            cancel: async () => {
              throw conflict(late)
            },
          },
        },
        form({ token, bookingId: "42", confirm: "yes" })
      )
    ).toMatchObject({ ok: false, code: "CONFLICT", message: late })
    expect(
      await cancelBookingCore(
        {
          api: {
            cancel: async () => {
              throw new ORPCError("NOT_FOUND", { defined: true, message: "Not found" })
            },
          },
        },
        form({ token, bookingId: "42", confirm: "yes" })
      )
    ).toMatchObject({ ok: false, code: "NOT_FOUND", message: "Not found" })
    expect(
      await cancelBookingCore(
        {
          api: {
            cancel: async () => {
              throw new Error("down")
            },
          },
        },
        form({ token, bookingId: "42", confirm: "yes" })
      )
    ).toMatchObject({ ok: false, message: GENERIC_FAILURE.sv })
  })
})

describe("parseAvailabilityQuery", () => {
  test("a well-formed query parses", () => {
    const out = parseAvailabilityQuery(
      new URLSearchParams({ offering: "package_6", from: "2026-03-01", to: "2026-03-31" })
    )
    expect(out).toEqual({
      ok: true,
      data: { offering: "package_6", from: "2026-03-01", to: "2026-03-31" },
    })
  })

  test("a request-kind offering, a bad date or a reversed range is refused per field", () => {
    expect(
      parseAvailabilityQuery(
        new URLSearchParams({ offering: "workshop", from: "2026-03-01", to: "2026-03-31" })
      )
    ).toMatchObject({ ok: false, errors: { offering: expect.any(String) } })
    expect(
      parseAvailabilityQuery(
        new URLSearchParams({ offering: "session", from: "1 March", to: "2026-03-31" })
      )
    ).toMatchObject({ ok: false, errors: { from: expect.any(String) } })
    expect(
      parseAvailabilityQuery(
        new URLSearchParams({ offering: "session", from: "2026-04-01", to: "2026-03-31" })
      )
    ).toMatchObject({ ok: false, errors: { to: expect.any(String) } })
    expect(parseAvailabilityQuery(new URLSearchParams())).toMatchObject({
      ok: false,
      errors: { offering: expect.any(String), from: expect.any(String), to: expect.any(String) },
    })
  })
})

describe("isOwnManageUrl", () => {
  const origin = "https://www.example.com"
  test("only a manage link on the site's own www origin", () => {
    expect(isOwnManageUrl(`${origin}/book/manage/abc`, origin)).toBe(true)
    expect(isOwnManageUrl(`${origin}/book/manage/abc?x=1`, origin)).toBe(true)
    expect(isOwnManageUrl("https://evil.example/book/manage/abc", origin)).toBe(false)
    expect(isOwnManageUrl(`${origin}.evil.example/book/manage/abc`, origin)).toBe(false)
    expect(isOwnManageUrl(`${origin}/privacy`, origin)).toBe(false)
    expect(isOwnManageUrl("javascript:alert(1)", origin)).toBe(false)
    expect(isOwnManageUrl("", origin)).toBe(false)
  })
})

describe("doneUrl", () => {
  test("encodes the reference and manage link, adds kind only for a request", () => {
    expect(doneUrl("BK-7", "https://www.example.com/book/manage/a b")).toBe(
      "/book/done?ref=BK-7&manage=https%3A%2F%2Fwww.example.com%2Fbook%2Fmanage%2Fa+b"
    )
    expect(doneUrl("BK-7", "x", "request")).toBe("/book/done?ref=BK-7&manage=x&kind=request")
  })
})

describe("bookingFieldErrors", () => {
  test("flattens customer.*, keeps list names, maps preferredDates.n.field to field_n+1", () => {
    expect(
      bookingFieldErrors([
        { path: ["customer", "email"], message: "bad email" },
        { path: ["slots", 0], message: "bad slot" },
        { path: ["preferredDates", 1, "date"], message: "bad date" },
        { path: ["preferredDates", 0, "part"], message: "bad part" },
        { path: [], message: "whole form" },
      ])
    ).toEqual({
      email: "bad email",
      slots: "bad slot",
      date_2: "bad date",
      part_1: "bad part",
      form: "whole form",
    })
  })
})

describe("groupBySeries", () => {
  const event = (id: number, startsAt: string, seriesKey: string | null): GroupEvent => ({
    id,
    reference: `GE-${id}`,
    title: seriesKey ? "Tuesday group" : `Single ${id}`,
    description: null,
    offering: "group",
    startsAt,
    endsAt: startsAt,
    location: "video",
    capacity: 8,
    seatsLeft: 3,
    seriesKey,
  })

  test("one group per series, singles on their own, ordered by first date", () => {
    const groups = groupBySeries([
      event(5, "2026-04-14T08:00:00Z", "s1"),
      event(9, "2026-03-20T08:00:00Z", null),
      event(4, "2026-04-07T08:00:00Z", "s1"),
      event(7, "2026-05-01T08:00:00Z", null),
    ])
    expect(groups.map((g) => [g.key, g.events.map((e) => e.id)])).toEqual([
      ["event:9", [9]],
      ["series:s1", [4, 5]],
      ["event:7", [7]],
    ])
    expect(groups[1]?.title).toBe("Tuesday group")
  })
})

describe("the cores in English", () => {
  test("every message the cores write themselves exists in both languages and differs", () => {
    for (const messages of [GENERIC_FAILURE, DATE_TOO_SOON, CONFIRM_REQUIRED]) {
      expect(messages.sv.length).toBeGreaterThan(0)
      expect(messages.en.length).toBeGreaterThan(0)
      expect(messages.en).not.toBe(messages.sv)
    }
  })

  test("a crash is the English generic failure on an English page", async () => {
    const out = await bookCore(
      {
        locale: "en",
        api: {
          book: async () => {
            throw new Error("down")
          },
        },
      },
      form({
        ...customer,
        offering: "session",
        audience: "organisation",
        location: "video",
        slots: ["2026-03-02T09:00:00.000Z"],
      })
    )
    expect(out).toMatchObject({ ok: false, message: GENERIC_FAILURE.en })
  })

  test("a date too soon and a missing confirmation are refused in English", async () => {
    const early = await requestBookingCore(
      {
        locale: "en",
        now: () => new Date("2026-03-01T10:00:00Z"),
        api: { request: async () => ({ reference: "", manageUrl: "" }) },
      },
      form({
        ...customer,
        offering: "workshop",
        location: "video",
        date_1: "2026-03-01",
        part_1: "morning",
        message: "A team day for the management group before the reorganisation.",
      })
    )
    expect(early).toMatchObject({ ok: false, fieldErrors: { date_1: DATE_TOO_SOON.en } })

    const unconfirmed = await cancelBookingCore(
      { locale: "en", api: { cancel: async () => ({ ok: true as const }) } },
      form({ token: "t".repeat(32), bookingId: "42" })
    )
    expect(unconfirmed).toMatchObject({
      ok: false,
      fieldErrors: { confirm: CONFIRM_REQUIRED.en },
    })
  })
})
