import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { BOOKING_CONFLICT_MESSAGE } from "@repo/api-contract"
import { UNAVAILABLE } from "./admin-actions"
import {
  type AvailabilityDeps,
  type BookingDecisionDeps,
  blockDaysCore,
  CONFIRM_BOX_MESSAGE,
  cancelBookingCore,
  cancelGroupEventCore,
  confirmBookingCore,
  createGroupEventCore,
  DATETIME_MESSAGE,
  declineBookingCore,
  type GroupEventDeps,
  setAvailabilityCore,
  stockholmLocalToUtc,
  unblockDaysCore,
} from "./admin-booking-actions"

let logged: Mock<typeof console.error>
beforeEach(() => {
  logged = spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => logged.mockRestore())

const defined = (code: string, message: string) => new ORPCError(code, { message, defined: true })
const notFound = () => defined("NOT_FOUND", "Not found")
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const unreachable = async () => {
  throw new Error("unreachable")
}

function decisionDeps(over: Partial<BookingDecisionDeps["api"]["bookings"]> = {}) {
  const calls: unknown[] = []
  const record =
    <T>(name: string) =>
    async (input: T) => {
      calls.push({ name, input })
      return { ok: true as const }
    }
  const d: BookingDecisionDeps & { calls: unknown[] } = {
    api: {
      bookings: {
        confirm: record("confirm"),
        decline: record("decline"),
        cancel: record("cancel"),
        ...over,
      },
    },
    calls,
  }
  return d
}

describe("stockholmLocalToUtc", () => {
  test("converts a Stockholm wall-clock time to the UTC instant, across DST", () => {
    expect(stockholmLocalToUtc("2026-06-10T09:00")).toBe("2026-06-10T07:00:00.000Z") // CEST
    expect(stockholmLocalToUtc("2026-12-10T09:00")).toBe("2026-12-10T08:00:00.000Z") // CET
    expect(stockholmLocalToUtc("2026-12-10T09:00:30")).toBe("2026-12-10T08:00:30.000Z")
  })

  test("rejects anything that is not a datetime-local value", () => {
    expect(stockholmLocalToUtc("")).toBeNull()
    expect(stockholmLocalToUtc("2026-06-10")).toBeNull()
    expect(stockholmLocalToUtc("2026-06-10T07:00:00.000Z")).toBeNull()
    expect(stockholmLocalToUtc("2026-13-40T09:00")).toBeNull()
  })
})

describe("confirmBookingCore", () => {
  test("a valid form calls the api with the UTC-converted start and trimmed extras", async () => {
    const d = decisionDeps()
    const out = await confirmBookingCore(
      d,
      form({
        id: "7",
        startsAt: "2026-06-10T09:00",
        durationMinutes: "90",
        location: "video",
        note: "  See you then ",
      })
    )
    expect(out).toEqual({ ok: true, message: "Booking confirmed." })
    expect(d.calls).toEqual([
      {
        name: "confirm",
        input: {
          id: 7,
          startsAt: "2026-06-10T07:00:00.000Z",
          durationMinutes: 90,
          location: "video",
          note: "See you then",
        },
      },
    ])
  })

  test("blank optional fields are left out so the api applies its defaults", async () => {
    const d = decisionDeps()
    await confirmBookingCore(
      d,
      form({ id: "7", startsAt: "2026-06-10T09:00", durationMinutes: "", location: "", note: "" })
    )
    expect(d.calls).toEqual([
      { name: "confirm", input: { id: 7, startsAt: "2026-06-10T07:00:00.000Z" } },
    ])
  })

  test("a missing or malformed start is a field error and never calls the api", async () => {
    const d = decisionDeps({ confirm: unreachable })
    const out = await confirmBookingCore(d, form({ id: "7", startsAt: "", location: "video" }))
    expect(out).toMatchObject({
      ok: false,
      fieldErrors: { startsAt: DATETIME_MESSAGE },
      values: { startsAt: "", location: "video" },
    })
  })

  test("an out-of-range duration or unknown location is a field error", async () => {
    const d = decisionDeps({ confirm: unreachable })
    const out = await confirmBookingCore(
      d,
      form({ id: "7", startsAt: "2026-06-10T09:00", durationMinutes: "5", location: "moon" })
    )
    expect(out).toMatchObject({
      ok: false,
      fieldErrors: { durationMinutes: expect.any(String), location: expect.any(String) },
    })
  })

  test("CONFLICT and NOT_FOUND are shown verbatim; anything else is 'unavailable'", async () => {
    const conflict = decisionDeps({
      confirm: async () => {
        throw defined("CONFLICT", BOOKING_CONFLICT_MESSAGE)
      },
    })
    expect(
      await confirmBookingCore(conflict, form({ id: "7", startsAt: "2026-06-10T09:00" }))
    ).toMatchObject({ ok: false, message: BOOKING_CONFLICT_MESSAGE })
    const missing = decisionDeps({
      confirm: async () => {
        throw notFound()
      },
    })
    expect(
      await confirmBookingCore(missing, form({ id: "7", startsAt: "2026-06-10T09:00" }))
    ).toMatchObject({ ok: false, message: "Not found" })
    const down = decisionDeps({
      confirm: async () => {
        throw new Error("ECONNREFUSED")
      },
    })
    expect(
      await confirmBookingCore(down, form({ id: "7", startsAt: "2026-06-10T09:00" }))
    ).toMatchObject({ ok: false, message: UNAVAILABLE })
    expect(logged).toHaveBeenCalledTimes(1)
  })

  test("a bad id is 'Not found' without an api call", async () => {
    const d = decisionDeps({ confirm: unreachable })
    expect(
      await confirmBookingCore(d, form({ id: "x", startsAt: "2026-06-10T09:00" }))
    ).toMatchObject({ ok: false, message: "Not found" })
  })
})

describe("declineBookingCore and cancelBookingCore", () => {
  test("decline passes the id and an optional note", async () => {
    const d = decisionDeps()
    expect(await declineBookingCore(d, form({ id: "3", note: "" }))).toEqual({
      ok: true,
      message: "Request declined.",
    })
    expect(await declineBookingCore(d, form({ id: "3", note: " Sorry " }))).toMatchObject({
      ok: true,
    })
    expect(d.calls).toEqual([
      { name: "decline", input: { id: 3 } },
      { name: "decline", input: { id: 3, note: "Sorry" } },
    ])
  })

  test("cancel needs the box ticked, then calls the api", async () => {
    const d = decisionDeps()
    expect(await cancelBookingCore(d, form({ id: "3" }))).toMatchObject({
      ok: false,
      message: CONFIRM_BOX_MESSAGE,
    })
    expect(d.calls).toEqual([])
    expect(await cancelBookingCore(d, form({ id: "3", confirm: "yes", note: "Ill" }))).toEqual({
      ok: true,
      message: "Booking cancelled.",
    })
    expect(d.calls).toEqual([{ name: "cancel", input: { id: 3, note: "Ill" } }])
  })

  test("NOT_FOUND reads 'Not found'; an unknown failure is 'unavailable'", async () => {
    const missing = decisionDeps({
      decline: async () => {
        throw notFound()
      },
      cancel: async () => {
        throw new Error("boom")
      },
    })
    expect(await declineBookingCore(missing, form({ id: "3" }))).toMatchObject({
      ok: false,
      message: "Not found",
    })
    expect(await cancelBookingCore(missing, form({ id: "3", confirm: "yes" }))).toMatchObject({
      ok: false,
      message: UNAVAILABLE,
    })
  })
})

function availabilityDeps(over: Partial<AvailabilityDeps["api"]["bookings"]["availability"]> = {}) {
  const calls: unknown[] = []
  const record =
    <T>(name: string) =>
    async (input: T) => {
      calls.push({ name, input })
      return { ok: true as const }
    }
  const d: AvailabilityDeps & { calls: unknown[] } = {
    api: {
      bookings: {
        availability: {
          set: record("set"),
          block: record("block"),
          unblock: record("unblock"),
          ...over,
        },
      },
    },
    calls,
  }
  return d
}

describe("setAvailabilityCore", () => {
  test("ticked weekdays become rules; unticked ones are dropped", async () => {
    const d = availabilityDeps()
    const out = await setAvailabilityCore(
      d,
      form({
        "available-1": "on",
        "start-1": "09:00",
        "end-1": "17:00",
        "start-2": "09:00",
        "end-2": "17:00",
        "available-5": "on",
        "start-5": "08:30",
        "end-5": "12:00",
      })
    )
    expect(out).toEqual({ ok: true, message: "Weekly availability saved." })
    expect(d.calls).toEqual([
      {
        name: "set",
        input: {
          rules: [
            { weekday: 1, start: "09:00", end: "17:00" },
            { weekday: 5, start: "08:30", end: "12:00" },
          ],
        },
      },
    ])
  })

  test("no ticked weekday replaces the rules with none", async () => {
    const d = availabilityDeps()
    expect(await setAvailabilityCore(d, form({}))).toEqual({
      ok: true,
      message: "Saved: no weekly availability.",
    })
    expect(d.calls).toEqual([{ name: "set", input: { rules: [] } }])
  })

  test("a bad window is an error on that weekday's own cell", async () => {
    const d = availabilityDeps({ set: unreachable })
    const out = await setAvailabilityCore(
      d,
      form({
        "available-1": "on",
        "start-1": "17:00",
        "end-1": "09:00",
        "available-3": "on",
        "start-3": "",
        "end-3": "25:00",
      })
    )
    expect(out).toMatchObject({
      ok: false,
      fieldErrors: {
        "end-1": "End must be after start.",
        "start-3": "Enter a time.",
        "end-3": "Enter a time.",
      },
      values: { "available-1": "on", "start-1": "17:00", "available-2": "" },
    })
  })

  test("an unknown failure is 'unavailable'", async () => {
    const d = availabilityDeps({
      set: async () => {
        throw new Error("boom")
      },
    })
    expect(await setAvailabilityCore(d, form({}))).toMatchObject({
      ok: false,
      message: UNAVAILABLE,
    })
  })
})

describe("blockDaysCore and unblockDaysCore", () => {
  test("a range with a reason is blocked; a blank `to` blocks the one day", async () => {
    const d = availabilityDeps()
    expect(
      await blockDaysCore(d, form({ from: "2026-07-06", to: "2026-07-24", reason: " Holiday " }))
    ).toEqual({ ok: true, message: "Days blocked." })
    expect(await blockDaysCore(d, form({ from: "2026-07-06", to: "", reason: "" }))).toMatchObject({
      ok: true,
    })
    expect(d.calls).toEqual([
      { name: "block", input: { from: "2026-07-06", to: "2026-07-24", reason: "Holiday" } },
      { name: "block", input: { from: "2026-07-06", to: "2026-07-06" } },
    ])
  })

  test("a malformed date or a reversed range is a field error", async () => {
    const d = availabilityDeps({ block: unreachable })
    expect(await blockDaysCore(d, form({ from: "6/7/2026", to: "" }))).toMatchObject({
      ok: false,
      fieldErrors: { from: expect.any(String) },
    })
    expect(await blockDaysCore(d, form({ from: "2026-07-24", to: "2026-07-06" }))).toMatchObject({
      ok: false,
      fieldErrors: { to: expect.any(String) },
    })
  })

  test("unblock passes the id; NOT_FOUND reads 'Not found'", async () => {
    const d = availabilityDeps()
    expect(await unblockDaysCore(d, form({ id: "4" }))).toEqual({ ok: true, message: "Unblocked." })
    expect(d.calls).toEqual([{ name: "unblock", input: { id: 4 } }])
    expect(await unblockDaysCore(d, form({ id: "" }))).toMatchObject({ message: "Not found" })
    const missing = availabilityDeps({
      unblock: async () => {
        throw notFound()
      },
    })
    expect(await unblockDaysCore(missing, form({ id: "4" }))).toMatchObject({
      ok: false,
      message: "Not found",
    })
  })
})

function groupDeps(over: Partial<GroupEventDeps["api"]["bookings"]["groupEvents"]> = {}) {
  const calls: unknown[] = []
  const d: GroupEventDeps & { calls: unknown[] } = {
    api: {
      bookings: {
        groupEvents: {
          create: async (input) => {
            calls.push({ name: "create", input })
            return { ids: [1, 2, 3] }
          },
          cancel: async (input) => {
            calls.push({ name: "cancel", input })
            return { ok: true as const }
          },
          ...over,
        },
      },
    },
    calls,
  }
  return d
}

describe("createGroupEventCore", () => {
  test("a valid form creates the series with the UTC-converted start", async () => {
    const d = groupDeps()
    const out = await createGroupEventCore(
      d,
      form({
        title: " Breathing basics ",
        description: "",
        startsAt: "2026-09-01T18:00",
        durationMinutes: "120",
        capacity: "8",
        location: "varberg",
        repeatWeeks: "3",
      })
    )
    expect(out).toEqual({ ok: true, message: "Created 3 group events." })
    expect(d.calls).toEqual([
      {
        name: "create",
        input: {
          title: "Breathing basics",
          startsAt: "2026-09-01T16:00:00.000Z",
          durationMinutes: 120,
          capacity: 8,
          location: "varberg",
          repeatWeeks: 3,
          offering: "group",
        },
      },
    ])
  })

  test("createGroupEventCore forwards the offering", async () => {
    const base = {
      title: "Inifrån",
      startsAt: "2026-09-01T18:00",
      durationMinutes: "120",
      capacity: "8",
      location: "varberg",
      repeatWeeks: "1",
    }
    const d = groupDeps()
    await createGroupEventCore(d, form({ ...base, offering: "inner_group" }))
    expect((d.calls[0] as { input: { offering: string } }).input.offering).toBe("inner_group")
    const bad = groupDeps({ create: unreachable })
    expect(await createGroupEventCore(bad, form({ ...base, offering: "coaching" }))).toMatchObject({
      ok: false,
      fieldErrors: { offering: expect.any(String) },
    })
  })

  test("one id reads as a single event; a blank repeat defaults to 1", async () => {
    const d = groupDeps({ create: async () => ({ ids: [9] }) })
    const out = await createGroupEventCore(
      d,
      form({
        title: "Solo",
        startsAt: "2026-09-01T18:00",
        durationMinutes: "60",
        capacity: "4",
        location: "video",
        repeatWeeks: "",
      })
    )
    expect(out).toEqual({ ok: true, message: "Group event created." })
  })

  test("invalid fields are field errors, a bad start first", async () => {
    const d = groupDeps({ create: unreachable })
    expect(
      await createGroupEventCore(d, form({ title: "x", startsAt: "soon", capacity: "0" }))
    ).toMatchObject({ ok: false, fieldErrors: { startsAt: DATETIME_MESSAGE } })
    expect(
      await createGroupEventCore(
        d,
        form({
          title: "x",
          startsAt: "2026-09-01T18:00",
          durationMinutes: "10",
          capacity: "0",
          location: "video",
          repeatWeeks: "99",
        })
      )
    ).toMatchObject({
      ok: false,
      fieldErrors: {
        title: expect.any(String),
        durationMinutes: expect.any(String),
        capacity: expect.any(String),
        repeatWeeks: expect.any(String),
      },
    })
    expect(d.calls).toEqual([])
  })

  test("CONFLICT is shown verbatim", async () => {
    const d = groupDeps({
      create: async () => {
        throw defined("CONFLICT", BOOKING_CONFLICT_MESSAGE)
      },
    })
    expect(
      await createGroupEventCore(
        d,
        form({
          title: "Clash",
          startsAt: "2026-09-01T18:00",
          durationMinutes: "60",
          capacity: "4",
          location: "video",
        })
      )
    ).toMatchObject({ ok: false, message: BOOKING_CONFLICT_MESSAGE })
  })
})

describe("cancelGroupEventCore", () => {
  test("needs the box ticked, then cancels with the note", async () => {
    const d = groupDeps()
    expect(await cancelGroupEventCore(d, form({ id: "2" }))).toMatchObject({
      ok: false,
      message: CONFIRM_BOX_MESSAGE,
    })
    expect(
      await cancelGroupEventCore(d, form({ id: "2", confirm: "yes", note: "Venue closed" }))
    ).toEqual({
      ok: true,
      message: "Group event cancelled.",
    })
    expect(d.calls).toEqual([{ name: "cancel", input: { id: 2, note: "Venue closed" } }])
  })

  test("NOT_FOUND reads 'Not found'; anything else is 'unavailable'", async () => {
    const missing = groupDeps({
      cancel: async () => {
        throw notFound()
      },
    })
    expect(await cancelGroupEventCore(missing, form({ id: "2", confirm: "yes" }))).toMatchObject({
      message: "Not found",
    })
    const down = groupDeps({
      cancel: async () => {
        throw new Error("boom")
      },
    })
    expect(await cancelGroupEventCore(down, form({ id: "2", confirm: "yes" }))).toMatchObject({
      message: UNAVAILABLE,
    })
  })
})
