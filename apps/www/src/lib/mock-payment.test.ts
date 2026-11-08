import { describe, expect, test } from "bun:test"
import { MEMBER_OFFERING_KEYS, OFFERING_KEYS, OFFERINGS } from "@repo/api-contract/booking-limits"
import { amountFor, priceFor } from "@/content/booking"
import { vatBreakdown } from "@/content/inner-pricing"
import { flowFor, parseFlow, paysIn } from "./booking-flow"
import {
  isOrgNumber,
  methodsFor,
  normaliseSwishNumber,
  PAYMENT_METHODS,
  paidFor,
  runMockPayment,
} from "./mock-payment"

const instantly = { apple_pay: 0, google_pay: 0, swish: 0, invoice: 0 }

describe("payment methods", () => {
  test("priced offerings take all four, the rest invoice only", () => {
    expect(methodsFor(true)).toEqual(["apple_pay", "google_pay", "swish", "invoice"])
    expect(methodsFor(false)).toEqual(["invoice"])
  })

  test("paidFor trusts only a known key the offering allows", () => {
    for (const method of PAYMENT_METHODS) expect(paidFor(method, true)).toBe(method)
    expect(paidFor("swish", false)).toBeUndefined()
    expect(paidFor("invoice", false)).toBe("invoice")
    for (const junk of ["", "card", "Swish", null, 3, undefined]) {
      expect(paidFor(junk, true)).toBeUndefined()
    }
  })

  test("Swish numbers: Swedish mobiles in their usual spellings", () => {
    expect(normaliseSwishNumber("070 123 45 67")).toBe("+46701234567")
    expect(normaliseSwishNumber("+46 70-123 45 67")).toBe("+46701234567")
    expect(normaliseSwishNumber("0046731234567")).toBe("+46731234567")
    for (const bad of ["", "08 123 456 78", "070 123 45", "+4570123456", "07012345678"]) {
      expect(normaliseSwishNumber(bad)).toBeNull()
    }
  })

  test("organisation numbers carry a Luhn check digit", () => {
    expect(isOrgNumber("212000-1355")).toBe(true)
    expect(isOrgNumber("5567037485")).toBe(true)
    expect(isOrgNumber("212000-1356")).toBe(false)
    expect(isOrgNumber("21200-1355")).toBe(false)
  })

  test("the mock approves after its delay, and a cancel charges nothing", async () => {
    expect(await runMockPayment("swish", { delays: instantly })).toBe("approved")
    const controller = new AbortController()
    const pending = runMockPayment("apple_pay", { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toThrow("Payment cancelled")
  })
})

describe("booking flows", () => {
  test("each kind has its journey; members and programme extras skip payment", () => {
    for (const key of OFFERING_KEYS) {
      const flow = flowFor(key)
      if ((MEMBER_OFFERING_KEYS as readonly string[]).includes(key)) expect(flow).toBe("member")
      else expect(flow).toBe(OFFERINGS[key].kind)
    }
    expect(flowFor("package_6", "42")).toBe("member")
    expect(paysIn("instant")).toBe(true)
    expect(paysIn("group")).toBe(true)
    expect(paysIn("request")).toBe(false)
    expect(paysIn("member")).toBe(false)
  })

  test("the done page's kind falls back to instant", () => {
    expect(parseFlow("group")).toBe("group")
    expect(parseFlow("member")).toBe("member")
    expect(parseFlow("nope")).toBe("instant")
    expect(parseFlow(undefined)).toBe("instant")
  })
})

describe("prices", () => {
  test("VAT is derived: inside a private price, on top of an organisation's", () => {
    expect(vatBreakdown(2250, "private")).toEqual({ net: 1800, vat: 450, total: 2250 })
    expect(vatBreakdown(2250, "organisation")).toEqual({ net: 2250, vat: 563, total: 2813 })
  })

  test("only the Inifrån start calls and group have a fixed price", () => {
    expect(amountFor("inner_start_coaching")).toEqual({ amount: 2250, per: "session" })
    expect(amountFor("inner_group")).toEqual({ amount: 1980, per: "month" })
    for (const key of ["session", "package_6", "group", "workshop", ...MEMBER_OFFERING_KEYS]) {
      expect(amountFor(key as (typeof OFFERING_KEYS)[number])).toBeNull()
    }
    expect(priceFor("inner_group", "organisation")).toEqual({
      amount: 1980,
      per: "month",
      net: 1980,
      vat: 495,
      total: 2475,
    })
  })
})
