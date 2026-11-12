import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import type { GroupEvent } from "@repo/api-contract"
import { BOOKING_NOTES_MAX, MEMBER_OFFERING_KEYS } from "@repo/api-contract/booking-limits"
import { BOOKING_FORMS } from "@/content/booking-forms"
import type { Locale } from "@/lib/site-locale"
import {
  type BookingOutcome,
  bookCore,
  bookingFieldErrors,
  CONFIRM_REQUIRED,
  cancelBookingCore,
  DATE_TOO_SOON,
  doneUrl,
  GENERIC_FAILURE,
  INVOICE_ADDRESS_MAX,
  isOwnManageUrl,
  notesWithBilling,
  parseAvailabilityQuery,
  paymentOf,
  requestBookingCore,
  reserveSeatsCore,
} from "./booking"
import { groupBySeries } from "./group-events"
import { PAYMENT_METHODS } from "./mock-payment"

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
  // The terms checkbox, ticked: every booking form posts it with the customer's details.
  terms: "on",
}

const created = {
  reference: "BK-7",
  manageUrl: "https://www.example.com/book/manage/tok",
  bookings: [],
  package: null,
}

/** An organisation paying by invoice: its billing details, as the payment step posts them. */
const orgInvoice = {
  paymentMethod: "invoice",
  invoiceOrgNumber: "2120001355",
  invoiceReference: "Ref 4711",
  invoiceAddress: "faktura@varberg.se",
}
const SV_BILLING =
  "[Betalning]\nBetalsätt: Faktura\nOrganisationsnummer: 212000-1355\nFakturareferens: Ref 4711\nFakturan skickas till: faktura@varberg.se"

/** `booking.groupEvents` with nothing listed: the core cannot date the ticked events. */
const noEvents = async () => ({ events: [] })

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
    ...orgInvoice,
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
    expect(out).toEqual({
      ok: true,
      redirectTo: doneUrl("BK-7", created.manageUrl, undefined, "invoice_quote"),
    })
    expect(sent).toMatchObject({
      offering: "session",
      slots: ["2026-03-02T09:00:00.000Z"],
      customer: { name: "Ada Lovelace", email: "ada@example.com", organisation: "Varbergs kommun" },
      location: "video",
      // The organisation's billing details follow the visitor's own note, for Yasmina's mail.
      notes: `First time\n\n${SV_BILLING}`,
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

describe("bookCore and payment", () => {
  let sent: { notes?: string } = {}
  const api = {
    book: async (input: { notes?: string }) => {
      sent = input
      return created
    },
  }
  const fields = (offering: string, extra: Record<string, string> = {}) =>
    form({
      ...customer,
      offering,
      audience: "private",
      location: "video",
      slots: ["2026-03-02T09:00:00.000Z"],
      ...extra,
    })

  test("a priced start call keeps any of the four methods, named in the notes", async () => {
    const done = {
      apple_pay: "apple_pay",
      google_pay: "google_pay",
      swish: "swish",
      invoice: "invoice",
    } as const
    for (const method of PAYMENT_METHODS) {
      const out = await bookCore({ api }, fields("inner_start_coaching", { paymentMethod: method }))
      expect(out).toEqual({
        ok: true,
        redirectTo: doneUrl("BK-7", created.manageUrl, undefined, done[method]),
      })
      expect(sent.notes).toStartWith("[Betalning]\nBetalsätt: ")
    }
    expect(sent.notes).toBe("[Betalning]\nBetalsätt: Faktura")
  })

  test("an organisation's priced invoice goes to its address", async () => {
    const out = await bookCore(
      { api },
      fields("inner_start_coaching", { ...orgInvoice, audience: "organisation" })
    )
    expect(out).toEqual({
      ok: true,
      redirectTo: doneUrl("BK-7", created.manageUrl, undefined, "invoice_org"),
    })
    expect(sent.notes).toBe(SV_BILLING)
  })

  test("an offering priced in writing refuses anything but an invoice", async () => {
    let calls = 0
    const counting = {
      book: async () => {
        calls++
        return created
      },
    }
    const swish = await bookCore({ api: counting }, fields("session", { paymentMethod: "swish" }))
    expect(swish).toMatchObject({
      ok: false,
      fieldErrors: { paymentMethod: BOOKING_FORMS.sv.check.method },
    })
    const none = await bookCore({ api: counting }, fields("session"))
    expect(none).toMatchObject({ ok: false, fieldErrors: { paymentMethod: expect.any(String) } })
    const junk = await bookCore({ api: counting }, fields("session", { paymentMethod: "<b>" }))
    expect(junk.ok).toBe(false)
    expect(calls).toBe(0)
    const invoice = await bookCore({ api }, fields("session", { paymentMethod: "invoice" }))
    expect(invoice).toEqual({
      ok: true,
      redirectTo: doneUrl("BK-7", created.manageUrl, undefined, "invoice_quote"),
    })
  })

  test("with the mock off (NEXT_PUBLIC_BOOKING_PAYMENTS unset in production), invoice only", async () => {
    const saved = process.env.NEXT_PUBLIC_BOOKING_PAYMENTS
    process.env.NEXT_PUBLIC_BOOKING_PAYMENTS = "off"
    try {
      const swish = await bookCore(
        { api },
        fields("inner_start_coaching", { paymentMethod: "swish" })
      )
      expect(swish).toMatchObject({ ok: false, fieldErrors: { paymentMethod: expect.any(String) } })
      const invoice = await bookCore(
        { api },
        fields("inner_start_coaching", { paymentMethod: "invoice" })
      )
      expect(invoice.ok).toBe(true)
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_BOOKING_PAYMENTS
      else process.env.NEXT_PUBLIC_BOOKING_PAYMENTS = saved
    }
  })

  test("an organisation's invoice needs valid billing details, checked again here", async () => {
    const out = await bookCore(
      { api, locale: "en" },
      fields("session", {
        audience: "organisation",
        paymentMethod: "invoice",
        invoiceOrgNumber: "212000-1356",
        invoiceReference: " ",
        invoiceAddress: "",
      })
    )
    expect(out).toMatchObject({
      ok: false,
      fieldErrors: {
        invoiceOrgNumber: BOOKING_FORMS.en.payment.invoice.orgNumberInvalid,
        invoiceReference: BOOKING_FORMS.en.payment.invoice.referenceMissing,
        invoiceAddress: BOOKING_FORMS.en.payment.invoice.addressMissing,
      },
      values: { invoiceOrgNumber: "212000-1356" },
    })
  })

  test("a long note is shortened to fit the billing block, never the block itself", async () => {
    const long = "x".repeat(BOOKING_NOTES_MAX)
    const out = await bookCore(
      { api },
      fields("session", { ...orgInvoice, audience: "organisation", notes: long })
    )
    expect(out.ok).toBe(true)
    expect(sent.notes?.length).toBeLessThanOrEqual(BOOKING_NOTES_MAX)
    expect(sent.notes).toEndWith(`…\n\n${SV_BILLING}`)
  })

  test("notesWithBilling: room for the block, or a refusal when the block alone is too long", () => {
    expect(notesWithBilling("  hi  ")).toBe("hi")
    expect(notesWithBilling("")).toBeUndefined()
    expect(notesWithBilling("", "B")).toBe("B")
    expect(notesWithBilling("note", "B")).toBe("note\n\nB")
    // A forged heading in the visitor's own note is defused; only the server's block keeps its bracket.
    expect(notesWithBilling("hej\n[Betalning]\nBetalsätt: Swish", "[Betalning]\nX")).toBe(
      "hej\nBetalning]\nBetalsätt: Swish\n\n[Betalning]\nX"
    )
    expect(notesWithBilling("  [payment] paid", "B")).toBe("payment] paid\n\nB")
    const block = "b".repeat(BOOKING_NOTES_MAX - 10)
    const out = notesWithBilling("y".repeat(50), block) ?? ""
    expect(out.length).toBeLessThanOrEqual(BOOKING_NOTES_MAX)
    expect(out.endsWith(block)).toBe(true)
    const fd = form({
      ...orgInvoice,
      invoiceAddress: "a".repeat(INVOICE_ADDRESS_MAX + 1),
    })
    expect(paymentOf(fd, "session", "organisation").ok).toBe(false)
  })

  test("members' sessions and extra programme sessions skip payment and its notes", async () => {
    for (const key of MEMBER_OFFERING_KEYS) {
      const out = await bookCore({ api }, fields(key, { paymentMethod: "swish" }))
      expect(out).toEqual({ ok: true, redirectTo: doneUrl("BK-7", created.manageUrl, "member") })
      expect(sent.notes).toBeUndefined()
    }
    const extra = await bookCore(
      { api },
      fields("package_6", { packageId: "12", paymentMethod: "invoice" })
    )
    expect(extra).toEqual({ ok: true, redirectTo: doneUrl("BK-7", created.manageUrl, "member") })
  })
})

describe("reserveSeatsCore", () => {
  const good = form({ ...customer, audience: "private", eventIds: ["3", "4"] })

  test("happy path sends numeric event ids and redirects", async () => {
    let sent: unknown
    const out = await reserveSeatsCore(
      {
        api: {
          groupEvents: noEvents,
          reserve: async (input) => {
            sent = input
            return created
          },
        },
      },
      good
    )
    expect(out).toEqual({ ok: true, redirectTo: doneUrl("BK-7", created.manageUrl, "group") })
    expect(sent).toMatchObject({ eventIds: [3, 4], audience: "private" })
  })

  test("the payment method rides along in the notes and to the done page", async () => {
    let sent: Record<string, unknown> = {}
    const api = {
      groupEvents: noEvents,
      reserve: async (input: Record<string, unknown>) => {
        sent = input
        return created
      },
    }
    const inner = form({
      ...customer,
      audience: "private",
      eventIds: ["3"],
      offering: "inner_group",
      paymentMethod: "swish",
    })
    expect(await reserveSeatsCore({ api }, inner)).toEqual({
      ok: true,
      redirectTo: doneUrl("BK-7", created.manageUrl, "group", "swish"),
    })
    expect(sent).not.toHaveProperty("paymentMethod")
    expect(sent).not.toHaveProperty("offering")
    expect(sent.notes).toBe("[Betalning]\nBetalsätt: Swish (testläge)")
    // The leadership group is priced in writing: only an invoice is accepted.
    const plain = form({
      ...customer,
      audience: "private",
      eventIds: ["3"],
      offering: "group",
      paymentMethod: "swish",
    })
    expect(await reserveSeatsCore({ api }, plain)).toMatchObject({
      ok: false,
      fieldErrors: { paymentMethod: expect.any(String) },
    })
  })

  test("no event ticked is an eventIds error", async () => {
    const out = await reserveSeatsCore(
      { api: { groupEvents: noEvents, reserve: async () => created } },
      form({ ...customer, audience: "private" })
    )
    expect(out).toMatchObject({ ok: false, fieldErrors: { eventIds: expect.any(String) } })
  })

  test("a non-numeric id never reaches the api", async () => {
    let calls = 0
    const out = await reserveSeatsCore(
      {
        api: {
          groupEvents: noEvents,
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
          groupEvents: noEvents,
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
    expect(doneUrl("BK-7", "x", "group", "swish")).toBe(
      "/book/done?ref=BK-7&manage=x&kind=group&paid=swish"
    )
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
        ...orgInvoice,
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

describe("the terms", () => {
  const { terms: _ticked, ...unticked } = customer
  type Case = {
    name: string
    run: (locale: Locale, fd: FormData, onCall: (input: unknown) => void) => Promise<BookingOutcome>
    fields: Record<string, string | string[]>
  }
  const cases: Case[] = [
    {
      name: "bookCore",
      run: (locale, fd, onCall) =>
        bookCore(
          {
            locale,
            api: {
              book: async (input) => {
                onCall(input)
                return created
              },
            },
          },
          fd
        ),
      fields: {
        offering: "session",
        audience: "organisation",
        location: "video",
        slots: ["2026-03-02T09:00:00.000Z"],
        notes: "First time",
        ...orgInvoice,
      },
    },
    {
      name: "reserveSeatsCore",
      run: (locale, fd, onCall) =>
        reserveSeatsCore(
          {
            locale,
            api: {
              groupEvents: noEvents,
              reserve: async (input) => {
                onCall(input)
                return created
              },
            },
          },
          fd
        ),
      fields: { audience: "private", eventIds: ["3", "4"], notes: "First time" },
    },
    {
      name: "requestBookingCore",
      run: (locale, fd, onCall) =>
        requestBookingCore(
          {
            locale,
            now: () => new Date("2026-03-01T10:00:00Z"),
            api: {
              request: async (input) => {
                onCall(input)
                return { reference: "BK-9", manageUrl: created.manageUrl }
              },
            },
          },
          fd
        ),
      fields: {
        offering: "workshop",
        location: "on_site",
        date_1: "2026-03-10",
        part_1: "full_day",
        message: "A team day for the management group before the reorganisation.",
      },
    },
  ]

  for (const { name, run, fields } of cases) {
    for (const locale of ["sv", "en"] as const) {
      test(`${name} (${locale}): without the box nothing is sent, the rest is kept`, async () => {
        let calls = 0
        const out = await run(locale, form({ ...unticked, ...fields }), () => calls++)
        expect(calls).toBe(0)
        expect(out).toMatchObject({
          ok: false,
          fieldErrors: { terms: BOOKING_FORMS[locale].check.terms },
        })
        if (out.ok) throw new Error("unreachable")
        expect(Object.keys(out.fieldErrors ?? {})).toEqual(["terms"])
        expect(out.values).toMatchObject({ name: "Ada Lovelace", email: "ada@example.com" })
      })

      test(`${name} (${locale}): a ticked box sends termsAccepted, never a version`, async () => {
        let sent: unknown
        const out = await run(locale, form({ ...customer, ...fields }), (input) => {
          sent = input
        })
        expect(out.ok).toBe(true)
        expect(sent).toMatchObject({ termsAccepted: true })
        expect(JSON.stringify(sent)).not.toContain("termsVersion")
      })
    }

    test(`${name}: a box posted with anything but "on" is not a consent`, async () => {
      let calls = 0
      const out = await run("sv", form({ ...unticked, ...fields, terms: "yes" }), () => calls++)
      expect(calls).toBe(0)
      expect(out).toMatchObject({ ok: false, fieldErrors: { terms: BOOKING_FORMS.sv.check.terms } })
    })
  }

  test("the message is the page's own, in both languages", () => {
    expect(BOOKING_FORMS.sv.check.terms).toBe("Du behöver godkänna villkoren för att boka.")
    expect(BOOKING_FORMS.en.check.terms).toBe("You need to accept the terms to book.")
  })
})

describe("a start within the withdrawal period", () => {
  // 12:00 in Stockholm on Thursday 12 November; the period's last day is 26 November.
  const now = () => new Date("2026-11-12T11:00:00.000Z")
  const SOON = "2026-11-26T09:00:00.000Z"
  const LATER = "2026-11-27T09:00:00.000Z"
  const groupEvent = (id: number, startsAt: string): GroupEvent => ({
    id,
    reference: `GE-${id}`,
    title: "Group",
    description: null,
    offering: "group",
    startsAt,
    endsAt: startsAt,
    location: "varberg",
    capacity: 8,
    seatsLeft: 3,
    seriesKey: null,
  })
  type Run = (
    locale: Locale,
    fd: FormData,
    onCall: (input: unknown) => void
  ) => Promise<BookingOutcome>
  const book: Run = (locale, fd, onCall) =>
    bookCore(
      {
        locale,
        now,
        api: {
          book: async (input) => {
            onCall(input)
            return created
          },
        },
      },
      fd
    )
  const reserve =
    (startsAt: string): Run =>
    (locale, fd, onCall) =>
      reserveSeatsCore(
        {
          locale,
          now,
          api: {
            groupEvents: async () => ({ events: [groupEvent(3, startsAt), groupEvent(4, LATER)] }),
            reserve: async (input) => {
              onCall(input)
              return created
            },
          },
        },
        fd
      )
  const cases = [
    {
      name: "bookCore",
      // The slot is in the form: the same api for every date.
      run: (_slot: string) => book,
      fields: (slot: string, audience: string) => ({
        offering: "session",
        audience,
        location: "video",
        slots: [slot],
        notes: "First time",
        ...(audience === "organisation" ? orgInvoice : { paymentMethod: "invoice" }),
      }),
    },
    {
      name: "reserveSeatsCore",
      run: reserve,
      fields: (_startsAt: string, audience: string) => ({
        audience,
        eventIds: ["3", "4"],
        notes: "First time",
        ...(audience === "organisation" ? orgInvoice : {}),
      }),
    },
  ]

  for (const { name, run, fields } of cases) {
    for (const locale of ["sv", "en"] as const) {
      test(`${name} (${locale}): a private booking inside the period needs the box; nothing is sent`, async () => {
        let calls = 0
        const out = await run(SOON)(
          locale,
          form({ ...customer, ...fields(SOON, "private") }),
          () => calls++
        )
        expect(calls).toBe(0)
        expect(out).toMatchObject({
          ok: false,
          fieldErrors: { earlyStart: BOOKING_FORMS[locale].check.earlyStart },
        })
        if (out.ok) throw new Error("unreachable")
        expect(Object.keys(out.fieldErrors ?? {})).toEqual(["earlyStart"])
        expect(out.values).toMatchObject({
          name: "Ada Lovelace",
          email: "ada@example.com",
          notes: "First time",
          terms: "on",
          earlyStart: "",
        })
      })

      test(`${name} (${locale}): with the box ticked it books and sends earlyStart`, async () => {
        let sent: unknown
        const out = await run(SOON)(
          locale,
          form({ ...customer, ...fields(SOON, "private"), earlyStart: "on" }),
          (input) => {
            sent = input
          }
        )
        expect(out.ok).toBe(true)
        expect(sent).toMatchObject({ earlyStart: true, termsAccepted: true })
      })

      test(`${name} (${locale}): 15 days away needs no box`, async () => {
        let sent: unknown
        const out = await run(LATER)(
          locale,
          form({ ...customer, ...fields(LATER, "private") }),
          (input) => {
            sent = input
          }
        )
        expect(out.ok).toBe(true)
        expect((sent as { earlyStart?: boolean }).earlyStart).toBeUndefined()
      })

      test(`${name} (${locale}): an organisation never needs it`, async () => {
        const out = await run(SOON)(
          locale,
          form({ ...customer, ...fields(SOON, "organisation") }),
          () => {}
        )
        expect(out.ok).toBe(true)
      })
    }
  }

  test("a member's session inside the period needs no box: it opens no new contract", async () => {
    let sent: unknown
    const out = await book(
      "sv",
      form({
        ...customer,
        offering: "inner_session",
        audience: "private",
        location: "video",
        slots: [SOON],
      }),
      (input) => {
        sent = input
      }
    )
    expect(out.ok).toBe(true)
    expect((sent as { earlyStart?: boolean }).earlyStart).toBeUndefined()
  })

  test("a further session of a programme is sent with its package and needs no box", async () => {
    let sent: unknown
    const out = await book(
      "sv",
      form({
        ...customer,
        offering: "package_6",
        audience: "private",
        location: "video",
        slots: [SOON],
        packageId: "12",
      }),
      (input) => {
        sent = input
      }
    )
    // The api checks the package is this customer's; if not, it refuses the box like any order.
    expect(out.ok).toBe(true)
    expect(sent).toMatchObject({ packageId: 12 })
    expect((sent as { earlyStart?: boolean }).earlyStart).toBeUndefined()
  })

  test("a group form with other errors is refused without reading the events", async () => {
    let reads = 0
    const out = await reserveSeatsCore(
      {
        locale: "sv",
        now,
        api: {
          groupEvents: async () => {
            reads++
            return { events: [groupEvent(3, SOON)] }
          },
          reserve: async () => created,
        },
      },
      form({ ...customer, terms: "", audience: "private", eventIds: ["3"] })
    )
    expect(reads).toBe(0)
    expect(out).toMatchObject({ ok: false, fieldErrors: { terms: BOOKING_FORMS.sv.check.terms } })
  })

  test("an unticked box is refused alongside the other answers' errors", async () => {
    const out = await book(
      "sv",
      form({ ...customer, ...cases[0]?.fields(SOON, "private"), name: "A", terms: "" }),
      () => {}
    )
    expect(out).toMatchObject({
      ok: false,
      fieldErrors: {
        name: expect.any(String),
        terms: BOOKING_FORMS.sv.check.terms,
        earlyStart: BOOKING_FORMS.sv.check.earlyStart,
      },
    })
  })

  test("when the events cannot be listed, the api decides, and its field error is shown", async () => {
    let calls = 0
    const out = await reserveSeatsCore(
      {
        locale: "en",
        now,
        api: {
          groupEvents: async () => {
            throw new Error("down")
          },
          reserve: async () => {
            calls++
            throw new ORPCError("BAD_REQUEST", {
              defined: true,
              message: "Confirm that the session may take place within the withdrawal period.",
              data: { field: "earlyStart" },
            })
          },
        },
      },
      form({ ...customer, audience: "private", eventIds: ["3"] })
    )
    expect(calls).toBe(1)
    expect(out).toMatchObject({
      ok: false,
      fieldErrors: { earlyStart: BOOKING_FORMS.en.check.earlyStart },
      values: { name: "Ada Lovelace", eventIds: "3" },
    })
  })

  test("the label and the message are the brief's, in both languages", () => {
    expect(BOOKING_FORMS.sv.earlyStart).toBe(
      "Jag vill att tjänsten börjar inom ångerfristen och förstår att ångerrätten upphör när tjänsten har fullgjorts."
    )
    expect(BOOKING_FORMS.en.earlyStart).toBe(
      "I want the service to start within the withdrawal period, and I understand the right of withdrawal ends once the service has been fully performed."
    )
    expect(BOOKING_FORMS.sv.check.earlyStart).toBe(
      "Bekräfta att tillfället får äga rum inom ångerfristen, eller välj en tid längre fram."
    )
    expect(BOOKING_FORMS.en.check.earlyStart).toBe(
      "Confirm that the session may take place within the withdrawal period, or choose a later time."
    )
  })
})
