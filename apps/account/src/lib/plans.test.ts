import { describe, expect, test } from "bun:test"
import { entitlementsFor, PLANS } from "@repo/api-contract"
import { accountTranslator, scoped } from "./i18n"
import {
  formatDate,
  formatPrice,
  intervalLabel,
  seatLimitLabel,
  seatsLine,
  statusLabel,
} from "./plans"

const en = scoped(accountTranslator("en"), "plans")
const sv = scoped(accountTranslator("sv"), "plans")
const END = "2026-11-02T00:00:00.000Z"
const paid = (extra: object = {}) => ({
  ...entitlementsFor({
    subscription: {
      plan: "pro",
      interval: "month",
      status: "active",
      currentPeriodEnd: END,
      cancelAtPeriodEnd: false,
    },
    memberCount: 2,
    portalAvailable: false,
  }),
  ...extra,
})

describe("formatPrice", () => {
  test("English is unchanged: whole dollars without decimals", () => {
    expect(formatPrice(1900, "en")).toBe("$19")
    expect(formatPrice(19000, "en")).toBe("$190")
    expect(formatPrice(950, "en")).toBe("$9.50")
    expect(formatPrice(0, "en")).toBe("$0")
  })
  test("Swedish formats the same USD amount its own way (a no-break space before US$)", () => {
    expect(formatPrice(1900, "sv")).toBe("19\u00a0US$")
    expect(formatPrice(950, "sv")).toBe("9,50\u00a0US$")
    expect(formatPrice(4900, "sv")).toBe("49\u00a0US$")
    expect(formatPrice(49000, "sv")).toBe("490\u00a0US$")
  })
})

describe("dates", () => {
  test("in the locale, in UTC", () => {
    expect(formatDate(END, "en")).toBe("Nov 2, 2026")
    expect(formatDate(END, "sv")).toBe("2 nov. 2026")
  })
})

describe("labels", () => {
  test("intervals and seat limits", () => {
    expect(intervalLabel("month", en)).toBe("Monthly")
    expect(intervalLabel("year", sv)).toBe("Årsvis")
    expect(seatLimitLabel(PLANS.pro, en)).toBe("Up to 10 members")
    expect(seatLimitLabel(PLANS.team, en)).toBe("Unlimited members")
    expect(seatLimitLabel(PLANS.pro, sv)).toBe("Upp till 10 medlemmar")
    expect(seatLimitLabel(PLANS.team, sv)).toBe("Obegränsat antal medlemmar")
  })

  test("the seats line", () => {
    expect(seatsLine({ seatLimit: 3, seatsUsed: 2 }, en)).toBe("2 of 3 seats used")
    expect(seatsLine({ seatLimit: null, seatsUsed: 12 }, en)).toBe("12 seats")
    // The one intended English change: a real plural rather than "1 seats".
    expect(seatsLine({ seatLimit: null, seatsUsed: 1 }, en)).toBe("1 seat")
    // No digit grouping in the used/limit line, as before.
    expect(seatsLine({ seatLimit: 1000, seatsUsed: 1000 }, en)).toBe("1000 of 1000 seats used")
    expect(seatsLine({ seatLimit: 3, seatsUsed: 2 }, sv)).toBe("2 av 3 platser används")
    expect(seatsLine({ seatLimit: null, seatsUsed: 1 }, sv)).toBe("1 plats")
    expect(seatsLine({ seatLimit: null, seatsUsed: 12 }, sv)).toBe("12 platser")
  })

  test("the status badge, English unchanged and Swedish dated in Swedish", () => {
    const free = entitlementsFor({ subscription: null, memberCount: 1, portalAvailable: false })
    expect(statusLabel(free, en, "en")).toBe("Free plan")
    expect(statusLabel(paid(), en, "en")).toBe("Active")
    expect(statusLabel(paid({ cancelAtPeriodEnd: true }), en, "en")).toBe(
      "Canceled, ends Nov 2, 2026"
    )
    expect(statusLabel(paid({ status: "past_due" }), en, "en")).toBe(
      "Past due — update your payment method"
    )
    expect(statusLabel(free, sv, "sv")).toBe("Gratisplan")
    expect(statusLabel(paid({ cancelAtPeriodEnd: true }), sv, "sv")).toBe(
      "Uppsagd, upphör 2 nov. 2026"
    )
    expect(statusLabel(paid({ cancelAtPeriodEnd: true, currentPeriodEnd: null }), sv, "sv")).toBe(
      "Uppsagd"
    )
    expect(statusLabel(paid({ status: "trialing" }), sv, "sv")).toBe("Provperiod")
  })
})
