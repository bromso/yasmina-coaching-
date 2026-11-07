import { describe, expect, test } from "bun:test"
import {
  AdminGroupEventCreateSchema,
  BookingGroupEventsSchema,
  GROUP_OFFERING_KEYS,
  MEMBER_OFFERING_KEYS,
  OFFERINGS,
} from "./booking"

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
