import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { BOOKING_CANCEL_LATE_MESSAGE, BOOKING_RATE_MESSAGE } from "@repo/api-contract"
import {
  bookingCancelledSubject,
  bookingConfirmedSubject,
  bookingDeclinedSubject,
  bookingNewSubject,
  bookingRequestReceivedSubject,
} from "@repo/email"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { clientFor, mailsTo, signUpVerified, start } from "./test-server"

const ROOT = "booking-root@example.com"
const INBOX = "yasmina@example.com"
// A Monday 08:00 UTC. Default rules: Mon–Fri 09:00–16:00 Stockholm (CET in January = 08:00–15:00 UTC).
const NOW = new Date("2026-01-05T08:00:00.000Z")
const customer = { name: "Ada Lovelace", email: "Ada@Example.com", phone: "+46 70 000 00 00" }

let app: Awaited<ReturnType<typeof start>>
let clock = NOW
beforeAll(async () => {
  app = await start({
    bookingEmail: INBOX,
    superadminEmails: [ROOT],
    now: () => clock,
    bookingLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    bookingRecipientLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    bookingGlobalLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
  })
})
afterAll(() => app.stop())
beforeEach(() => {
  clock = NOW
})

const anon = () => clientFor(app)
const idOf = (reference: string) => Number(reference.replace(/^BK-/, ""))
const tokenOf = (manageUrl: string) => decodeURIComponent(manageUrl.split("/book/manage/")[1] ?? "")

let rootClient: ReturnType<typeof clientFor> | undefined
/** The superadmin's client, signed up once (a second sign-up of the same address is refused). */
async function admin() {
  rootClient ??= (await signUpVerified(app, ROOT)).client
  return rootClient
}

describe("booking.availability", () => {
  test("offers Stockholm office hours as UTC slots, from tomorrow, inside the horizon", async () => {
    const result = await anon().booking.availability({
      offering: "session",
      from: "2026-01-05",
      to: "2026-01-11",
    })
    expect(result.timezone).toBe("Europe/Stockholm")
    expect(result.durationMinutes).toBe(60)
    expect(result.days.map((d) => d.date)).toHaveLength(7)
    // Monday is today: every slot is inside the 24-hour lead time.
    expect(result.days[0]?.slots).toEqual([])
    // Tuesday 09:00–16:00 CET → 08:00–15:00 UTC, one-hour slots on the half hour: 13 starts.
    const tuesday = result.days[1]
    expect(tuesday?.date).toBe("2026-01-06")
    expect(tuesday?.slots[0]).toEqual({
      startsAt: "2026-01-06T08:00:00.000Z",
      endsAt: "2026-01-06T09:00:00.000Z",
    })
    expect(tuesday?.slots).toHaveLength(13)
    // The weekend has no rule.
    expect(result.days[5]?.slots).toEqual([])
    expect(result.days[6]?.slots).toEqual([])
  })

  test("refuses a range over 62 days", async () => {
    const [error] = await safeCall(() =>
      anon().booking.availability({ offering: "session", from: "2026-01-05", to: "2026-04-01" })
    )
    expect(error?.code).toBe("BAD_REQUEST")
  })
})

describe("booking.book", () => {
  test("a session: stores it confirmed, mails the customer (in their language) and Yasmina", async () => {
    const result = await clientFor(app, undefined, "sv").booking.book({
      offering: "session",
      slots: ["2026-01-06T08:00:00.000Z"],
      audience: "private",
      customer,
      location: "video",
      notes: "Looking forward to it.",
    })
    expect(result.reference).toMatch(/^BK-\d+$/)
    expect(result.package).toBeNull()
    expect(result.bookings).toHaveLength(1)
    expect(result.bookings[0]).toMatchObject({
      offering: "session",
      status: "confirmed",
      startsAt: "2026-01-06T08:00:00.000Z",
      endsAt: "2026-01-06T09:00:00.000Z",
      location: "video",
      cancellable: true,
    })
    const row = await app.db.booking.find(idOf(result.reference))
    expect(row).toMatchObject({
      kind: "instant",
      customer_email: "ada@example.com",
      customer_name: "Ada Lovelace",
      locale: "sv",
      ip_hash: "test-client",
    })

    const [toYasmina] = await mailsTo(
      app,
      INBOX,
      bookingNewSubject(result.reference, "Coaching session", "instant")
    )
    expect(toYasmina?.replyTo).toBe("ada@example.com")
    expect(toYasmina?.text).toContain("Looking forward to it.")
    expect(toYasmina?.text).toContain(`/admin/bookings/${idOf(result.reference)}`)
    expect(toYasmina?.text).toContain("Tuesday 6 January 2026, 09:00–10:00")

    await app.drain()
    const toCustomer = app.mailer.sent.filter((m) => m.to === "ada@example.com")
    expect(toCustomer).toHaveLength(1)
    // Swedish subject, Swedish time, the manage link, reply-to Yasmina.
    expect(toCustomer[0]?.subject).not.toBe(bookingConfirmedSubject(result.reference))
    expect(toCustomer[0]?.subject).toContain(result.reference)
    expect(toCustomer[0]?.text).toContain("tisdag 6 januari 2026, kl. 09.00–10.00")
    expect(toCustomer[0]?.text).toContain(result.manageUrl)
    expect(toCustomer[0]?.replyTo).toBe(INBOX)
  })

  test("the slot is gone afterwards, and booking it again is a CONFLICT", async () => {
    const day = (
      await anon().booking.availability({
        offering: "session",
        from: "2026-01-06",
        to: "2026-01-06",
      })
    ).days[0]
    const starts = day?.slots.map((s) => s.startsAt) ?? []
    // The booked hour plus the 15-minute buffer on each side: 07:30 (ends 08:30) and 09:00 go too.
    expect(starts).not.toContain("2026-01-06T08:00:00.000Z")
    expect(starts).not.toContain("2026-01-06T08:30:00.000Z")
    expect(starts).not.toContain("2026-01-06T09:00:00.000Z")
    expect(starts).toContain("2026-01-06T09:30:00.000Z")

    const [error] = await safeCall(() =>
      anon().booking.book({
        offering: "session",
        slots: ["2026-01-06T08:00:00.000Z"],
        audience: "private",
        customer,
        location: "video",
      })
    )
    expect(error?.code).toBe("CONFLICT")
    expect(error?.message).toBe("That time is no longer available. Pick another slot.")
  })

  test("a hand-crafted slot off the grid, in the past or on a weekend is a CONFLICT", async () => {
    for (const slot of [
      "2026-01-06T10:10:00.000Z",
      "2026-01-04T10:00:00.000Z",
      "2026-01-10T10:00:00.000Z",
    ]) {
      const [error] = await safeCall(() =>
        anon().booking.book({
          offering: "session",
          slots: [slot],
          audience: "private",
          customer,
          location: "varberg",
        })
      )
      expect(error?.code).toBe("CONFLICT")
    }
  })

  test("a package books several slots at once, creates the package and lists the rest later", async () => {
    const result = await anon().booking.book({
      offering: "package_6",
      slots: ["2026-01-07T08:00:00.000Z", "2026-01-14T08:00:00.000Z"],
      audience: "organisation",
      customer: { ...customer, organisation: "Varbergs kommun" },
      location: "varberg",
    })
    expect(result.package).toMatchObject({
      offering: "package_6",
      sessionsTotal: 6,
      sessionsBooked: 2,
    })
    expect(result.bookings.map((b) => b.startsAt)).toEqual([
      "2026-01-07T08:00:00.000Z",
      "2026-01-14T08:00:00.000Z",
    ])
    const [mail] = await mailsTo(app, "ada@example.com", bookingConfirmedSubject(result.reference))
    expect(mail?.text).toContain("Wednesday 14 January 2026")

    const manage = await anon().booking.manage.get({ token: tokenOf(result.manageUrl) })
    expect(manage.customer.organisation).toBe("Varbergs kommun")
    expect(manage.bookings).toHaveLength(2)
    expect(manage.package?.sessionsBooked).toBe(2)
  })

  test("two slots of one order that overlap each other are refused together", async () => {
    const [error] = await safeCall(() =>
      anon().booking.book({
        offering: "package_6",
        slots: ["2026-01-08T08:00:00.000Z", "2026-01-08T08:30:00.000Z"],
        audience: "private",
        customer,
        location: "video",
      })
    )
    expect(error?.code).toBe("CONFLICT")
    expect(await app.db.booking.inRange("2026-01-08T00:00:00Z", "2026-01-09T00:00:00Z")).toEqual([])
  })

  test("the contract refuses a location the offering does not list, and too many slots", async () => {
    const [wrongPlace] = await safeCall(() =>
      anon().booking.book({
        offering: "session",
        slots: ["2026-01-06T12:00:00.000Z"],
        audience: "private",
        customer,
        location: "on_site",
      })
    )
    expect(wrongPlace?.code).toBe("BAD_REQUEST")
    const [tooMany] = await safeCall(() =>
      anon().booking.book({
        offering: "session",
        slots: ["2026-01-06T12:00:00.000Z", "2026-01-06T13:30:00.000Z"],
        audience: "private",
        customer,
        location: "video",
      })
    )
    expect(tooMany?.code).toBe("BAD_REQUEST")
  })
})

describe("booking.manage", () => {
  test("cancel: allowed until 24 h before, mails both sides; late or wrong token is refused", async () => {
    const result = await anon().booking.book({
      offering: "session",
      slots: ["2026-01-09T10:00:00.000Z"],
      audience: "private",
      customer,
      location: "video",
    })
    const token = tokenOf(result.manageUrl)
    const id = result.bookings[0]?.id as number

    const [wrong] = await safeCall(() =>
      anon().booking.manage.cancel({ token: `${token}x`, bookingId: id })
    )
    expect(wrong?.code).toBe("NOT_FOUND")

    clock = new Date("2026-01-08T12:00:00.000Z") // 22 h before: too late online
    const [late] = await safeCall(() => anon().booking.manage.cancel({ token, bookingId: id }))
    expect(late?.code).toBe("CONFLICT")
    expect(late?.message).toBe(BOOKING_CANCEL_LATE_MESSAGE)

    clock = new Date("2026-01-07T12:00:00.000Z")
    expect(await anon().booking.manage.cancel({ token, bookingId: id })).toEqual({ ok: true })
    expect((await app.db.booking.find(id))?.status).toBe("cancelled")
    const [mail] = await mailsTo(app, "ada@example.com", bookingCancelledSubject(result.reference))
    expect(mail?.text).toMatch(/As requested/)
    const manage = await anon().booking.manage.get({ token })
    expect(manage.bookings[0]).toMatchObject({ status: "cancelled", cancellable: false })
  })

  test("an unknown token is NOT_FOUND with the translated message", async () => {
    const [error] = await safeCall(() =>
      clientFor(app, undefined, "sv").booking.manage.get({ token: "a".repeat(43) })
    )
    expect(error?.code).toBe("NOT_FOUND")
    expect(error?.message).toBe("Vi hittade inte den bokningslänken.")
  })
})

describe("booking.request and the admin decision", () => {
  const request = {
    offering: "workshop" as const,
    customer: { ...customer, organisation: "Falkenbergs kommun" },
    location: "on_site" as const,
    preferredDates: [
      { date: "2026-02-10", part: "full_day" as const },
      { date: "2026-02-12", part: "morning" as const },
    ],
    attendees: 14,
    venue: "Stadshuset",
    message: "A team day for our new unit, focus on preventive work.",
  }

  test("stores a pending request and mails both sides", async () => {
    const result = await anon().booking.request(request)
    const row = await app.db.booking.find(idOf(result.reference))
    expect(row).toMatchObject({
      kind: "request",
      status: "pending",
      audience: "organisation",
      organisation: "Falkenbergs kommun",
      starts_at: null,
      attendees: 14,
      venue: "Stadshuset",
    })
    expect(JSON.parse(row?.preferred_dates ?? "[]")).toEqual(request.preferredDates)
    const [toYasmina] = await mailsTo(
      app,
      INBOX,
      bookingNewSubject(result.reference, "Workshop or team day", "request")
    )
    expect(toYasmina?.text).toContain("10 February 2026 (full day)")
    expect(toYasmina?.text).toContain("Stadshuset")
    await mailsTo(app, "ada@example.com", bookingRequestReceivedSubject(result.reference))
  })

  test("admin: pending lists it, confirm sets a time, rotates the manage link and mails; the old link dies", async () => {
    const result = await anon().booking.request(request)
    const id = idOf(result.reference)
    const oldToken = tokenOf(result.manageUrl)
    const root = await admin()
    const pending = await root.admin.bookings.pending()
    expect(pending.items.some((b) => b.id === id)).toBe(true)

    expect(
      await root.admin.bookings.confirm({
        id,
        startsAt: "2026-02-10T08:00:00.000Z",
        note: "See you at 9.",
      })
    ).toEqual({ ok: true })
    const row = await app.db.booking.find(id)
    expect(row).toMatchObject({
      status: "confirmed",
      starts_at: "2026-02-10T08:00:00.000Z",
      ends_at: "2026-02-10T12:00:00.000Z",
      admin_note: "See you at 9.",
    })
    const [mail] = await mailsTo(app, "ada@example.com", bookingConfirmedSubject(result.reference))
    expect(mail?.text).toContain("Tuesday 10 February 2026, 09:00–13:00")
    const newToken = tokenOf(mail?.text.match(/\/book\/manage\/[^\s)]+/)?.[0] ?? "")
    expect(newToken).not.toBe(oldToken)
    const [dead] = await safeCall(() => anon().booking.manage.get({ token: oldToken }))
    expect(dead?.code).toBe("NOT_FOUND")
    const alive = await anon().booking.manage.get({ token: newToken })
    expect(alive.bookings[0]?.status).toBe("confirmed")

    // It is now on the calendar, and busy for a session that would overlap.
    const calendar = await root.admin.bookings.calendar({ from: "2026-02-10", to: "2026-02-10" })
    expect(calendar.bookings.map((b) => b.id)).toContain(id)
    const [overlap] = await safeCall(() =>
      anon().booking.book({
        offering: "session",
        slots: ["2026-02-10T09:00:00.000Z"],
        audience: "private",
        customer,
        location: "video",
      })
    )
    expect(overlap?.code).toBe("CONFLICT")
    // Confirming another request on top of it is a CONFLICT too.
    const other = await anon().booking.request(request)
    const [clash] = await safeCall(() =>
      root.admin.bookings.confirm({
        id: idOf(other.reference),
        startsAt: "2026-02-10T10:00:00.000Z",
      })
    )
    expect(clash?.code).toBe("CONFLICT")
  })

  test("admin: decline and cancel mail the customer with the note; a non-admin sees NOT_FOUND", async () => {
    const declined = await anon().booking.request(request)
    const root = await admin()
    expect(
      await root.admin.bookings.decline({
        id: idOf(declined.reference),
        note: "Fully booked in February.",
      })
    ).toEqual({ ok: true })
    const [mail] = await mailsTo(app, "ada@example.com", bookingDeclinedSubject(declined.reference))
    expect(mail?.text).toContain("Fully booked in February.")

    const booked = await anon().booking.book({
      offering: "session",
      slots: ["2026-01-13T08:00:00.000Z"],
      audience: "private",
      customer,
      location: "video",
    })
    expect(await root.admin.bookings.cancel({ id: idOf(booked.reference), note: "Ill." })).toEqual({
      ok: true,
    })
    const [cancelled] = await mailsTo(
      app,
      "ada@example.com",
      bookingCancelledSubject(booked.reference)
    )
    expect(cancelled?.text).toMatch(/had to cancel/)
    expect(cancelled?.text).toContain("Ill.")

    const { client: user } = await signUpVerified(app)
    const [error] = await safeCall(() => user.admin.bookings.pending())
    expect(error?.code).toBe("NOT_FOUND")
  })
})

describe("availability admin", () => {
  test("rules replace the week; a block hides its days; unblocking restores them", async () => {
    const root = await admin()
    const before = await root.admin.bookings.availability.get()
    expect(before.rules).toHaveLength(5)

    await root.admin.bookings.availability.set({
      rules: [{ weekday: 2, start: "10:00", end: "12:00" }],
    })
    const tuesday = (
      await anon().booking.availability({
        offering: "session",
        from: "2026-01-20",
        to: "2026-01-21",
      })
    ).days
    expect(tuesday[0]?.slots.map((s) => s.startsAt)).toEqual([
      "2026-01-20T09:00:00.000Z",
      "2026-01-20T09:30:00.000Z",
      "2026-01-20T10:00:00.000Z",
    ])
    expect(tuesday[1]?.slots).toEqual([])

    await root.admin.bookings.availability.block({
      from: "2026-01-20",
      to: "2026-01-20",
      reason: "Away",
    })
    const blocked = await root.admin.bookings.availability.get()
    expect(blocked.blocks).toHaveLength(1)
    expect(
      (
        await anon().booking.availability({
          offering: "session",
          from: "2026-01-20",
          to: "2026-01-20",
        })
      ).days[0]?.slots
    ).toEqual([])
    await root.admin.bookings.availability.unblock({ id: blocked.blocks[0]?.id as number })
    expect(
      (
        await anon().booking.availability({
          offering: "session",
          from: "2026-01-20",
          to: "2026-01-20",
        })
      ).days[0]?.slots
    ).toHaveLength(3)

    // Restore the default week for the tests after this one.
    await root.admin.bookings.availability.set({ rules: before.rules })
  })
})

describe("group events", () => {
  test("a weekly series, seats, a full event, and cancelling the event mails every holder", async () => {
    const root = await admin()
    const { ids } = await root.admin.bookings.groupEvents.create({
      title: "Leading through change",
      description: "Four Thursday evenings.",
      startsAt: "2026-01-22T16:00:00.000Z",
      durationMinutes: 120,
      capacity: 2,
      location: "varberg",
      repeatWeeks: 2,
    })
    expect(ids).toHaveLength(2)
    const events = (await anon().booking.groupEvents({})).events.filter((e) => ids.includes(e.id))
    expect(events.map((e) => e.startsAt)).toEqual([
      "2026-01-22T16:00:00.000Z",
      "2026-01-29T16:00:00.000Z",
    ])
    expect(events[0]?.seriesKey).toBe(events[1]?.seriesKey as string)
    expect(events[0]?.seatsLeft).toBe(2)

    const first = await anon().booking.reserve({ eventIds: ids, audience: "private", customer })
    expect(first.bookings).toHaveLength(2)
    expect(first.bookings[0]?.groupEvent).toEqual({
      id: ids[0] as number,
      title: "Leading through change",
    })
    const [mail] = await mailsTo(app, "ada@example.com", bookingConfirmedSubject(first.reference))
    expect(mail?.text).toContain("Thursday 22 January 2026, 17:00–19:00")
    expect(mail?.text).toContain("Thursday 29 January 2026")

    const bob = { name: "Bob", email: "bob@example.com" }
    const bobSeat = await anon().booking.reserve({
      eventIds: [ids[0] as number],
      audience: "private",
      customer: bob,
    })
    expect(
      (await anon().booking.groupEvents({})).events.find((e) => e.id === ids[0])?.seatsLeft
    ).toBe(0)
    const [full] = await safeCall(() =>
      anon().booking.reserve({
        eventIds: [ids[0] as number],
        audience: "private",
        customer: { name: "Cy", email: "cy@example.com" },
      })
    )
    expect(full?.code).toBe("CONFLICT")
    expect(full?.message).toBe("That session is fully booked.")

    // The series is busy on the calendar: a session overlapping it is refused…
    const [clash] = await safeCall(() =>
      root.admin.bookings.groupEvents.create({
        title: "Clash",
        startsAt: "2026-01-22T17:00:00.000Z",
        durationMinutes: 60,
        capacity: 5,
        location: "video",
        repeatWeeks: 1,
      })
    )
    expect(clash?.code).toBe("CONFLICT")

    // …and cancelling the first date cancels both seats and mails both holders.
    expect(
      await root.admin.bookings.groupEvents.cancel({ id: ids[0] as number, note: "Snow." })
    ).toEqual({ ok: true })
    await mailsTo(app, "ada@example.com", bookingCancelledSubject(first.reference))
    const [bobMail] = await mailsTo(
      app,
      "bob@example.com",
      bookingCancelledSubject(bobSeat.reference)
    )
    expect(bobMail?.text).toContain("Snow.")
    const cancelledSeats = await app.db.booking.inRange(
      "2026-01-22T00:00:00Z",
      "2026-01-23T00:00:00Z"
    )
    expect(cancelledSeats.every((b) => b.status === "cancelled")).toBe(true)
    expect(cancelledSeats).toHaveLength(2)
    expect((await anon().booking.groupEvents({})).events.map((e) => e.id)).not.toContain(ids[0])
    // The second date is untouched.
    expect(
      (await anon().booking.groupEvents({})).events.find((e) => e.id === ids[1])?.seatsLeft
    ).toBe(1)
  })
})

describe("limits", () => {
  test("the per-client limiter refuses with the translated message", async () => {
    const strict = await start({
      bookingEmail: INBOX,
      now: () => NOW,
      bookingLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    try {
      await clientFor(strict).booking.request({
        offering: "keynote",
        customer: { ...customer, organisation: "SKR" },
        location: "on_site",
        preferredDates: [{ date: "2026-03-01", part: "morning" }],
        message: "Opening keynote at our conference.",
      })
      const [error] = await safeCall(() =>
        clientFor(strict, undefined, "sv").booking.request({
          offering: "keynote",
          customer: { ...customer, organisation: "SKR" },
          location: "on_site",
          preferredDates: [{ date: "2026-03-01", part: "morning" }],
          message: "Opening keynote at our conference.",
        })
      )
      expect(error?.code).toBe("TOO_MANY_REQUESTS")
      expect(error?.message).toBe("För många bokningsförsök, försök igen senare.")
      expect(BOOKING_RATE_MESSAGE).toBe("Too many booking attempts, try again later.")
    } finally {
      await strict.stop()
    }
  })
})

async function safeCall<T>(
  fn: () => Promise<T>
): Promise<[ORPCError<string, unknown> | undefined, T | undefined]> {
  try {
    return [undefined, await fn()]
  } catch (error) {
    if (error instanceof ORPCError) return [error, undefined]
    throw error
  }
}
