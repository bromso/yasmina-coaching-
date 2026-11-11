import { describe, expect, test } from "bun:test"
import {
  LEAD_NEEDS,
  LEAD_STATUSES,
  LEAD_TIMELINES,
  leadNextStep,
  leadPage,
  leadReference,
} from "./leads"
import { AdminLeadUpdateSchema, LeadCreateSchema } from "./leads-schema"

const valid = {
  audience: "private",
  need: "coaching",
  timeline: "month",
  name: " Ada ",
  email: " Ada@Example.com ",
  contactMethod: "email",
  consent: true,
} as const

describe("LeadCreateSchema", () => {
  test("normalises the email, trims text and defaults the newsletter to off", () => {
    expect(LeadCreateSchema.parse({ ...valid, message: "  Hej  " })).toEqual({
      audience: "private",
      need: "coaching",
      timeline: "month",
      name: "Ada",
      email: "ada@example.com",
      message: "Hej",
      phone: undefined,
      organisation: undefined,
      role: undefined,
      contactMethod: "email",
      consent: true,
      newsletter: false,
      page: undefined,
    })
  })

  test("an empty optional field is the same as leaving it out", () => {
    const parsed = LeadCreateSchema.parse({ ...valid, message: "   ", phone: "", role: " " })
    expect(parsed.message).toBeUndefined()
    expect(parsed.phone).toBeUndefined()
    expect(parsed.role).toBeUndefined()
  })

  test("each field's bounds", () => {
    const ok = (patch: Record<string, unknown>) =>
      LeadCreateSchema.safeParse({ ...valid, ...patch }).success
    expect(ok({ email: "nope" })).toBe(false)
    expect(ok({ audience: "company" })).toBe(false)
    expect(ok({ need: "sales" })).toBe(false)
    expect(ok({ timeline: "never" })).toBe(false)
    expect(ok({ contactMethod: "fax" })).toBe(false)
    expect(ok({ name: "  " })).toBe(false)
    expect(ok({ name: "x".repeat(101) })).toBe(false)
    expect(ok({ name: "x".repeat(100) })).toBe(true)
    expect(ok({ message: "x".repeat(2001) })).toBe(false)
    expect(ok({ message: "x".repeat(2000) })).toBe(true)
    expect(ok({ phone: "1".repeat(41) })).toBe(false)
    expect(ok({ role: "x".repeat(101) })).toBe(false)
  })

  test("consent to be contacted is required; the newsletter box is not", () => {
    expect(LeadCreateSchema.safeParse({ ...valid, consent: false }).success).toBe(false)
    const { consent: _, ...withoutConsent } = valid
    expect(LeadCreateSchema.safeParse(withoutConsent).success).toBe(false)
    expect(LeadCreateSchema.parse({ ...valid, newsletter: true }).newsletter).toBe(true)
  })

  test("an organisation must name itself; a phone call needs a number", () => {
    const org = LeadCreateSchema.safeParse({ ...valid, audience: "organisation" })
    expect(org.success).toBe(false)
    expect(org.error?.issues.map((i) => i.path)).toEqual([["organisation"]])
    expect(
      LeadCreateSchema.safeParse({ ...valid, audience: "organisation", organisation: "Acme" })
        .success
    ).toBe(true)
    const phone = LeadCreateSchema.safeParse({ ...valid, contactMethod: "phone" })
    expect(phone.error?.issues.map((i) => i.path)).toEqual([["phone"]])
    expect(
      LeadCreateSchema.safeParse({ ...valid, contactMethod: "phone", phone: "070-123 45 67" })
        .success
    ).toBe(true)
  })

  test("a bad page is caught to undefined, never a refusal", () => {
    const page = (value: unknown) => LeadCreateSchema.parse({ ...valid, page: value }).page
    expect(page("/kontakt")).toBe("/kontakt")
    expect(page("https://evil.example")).toBeUndefined()
    expect(page(`/${"a".repeat(200)}`)).toBeUndefined()
    expect(page(42)).toBeUndefined()
  })
})

describe("leadPage and leadReference", () => {
  test("leadPage keeps a root-relative www path and drops anything else", () => {
    expect(leadPage("/inifran/coachning")).toBe("/inifran/coachning")
    for (const bad of ["//evil.example", "kontakt", "/Kontakt", "/a?b=1", null, undefined]) {
      expect(leadPage(bad)).toBeNull()
    }
  })

  test("the reference is LEAD-<id>", () => {
    expect(leadReference(7)).toBe("LEAD-7")
  })
})

describe("leadNextStep", () => {
  const step = (
    need: (typeof LEAD_NEEDS)[number],
    timeline = "month" as const,
    audience = "private" as const
  ) => leadNextStep({ need, timeline, audience })

  test("Ledarskap inifrån points at the matching start call", () => {
    expect(step("inner_coaching")).toEqual({ kind: "inner", path: "/book/inner_start_coaching" })
    expect(step("inner_mentoring")).toEqual({ kind: "inner", path: "/book/inner_start_mentoring" })
    expect(step("inner_lifestyle")).toEqual({ kind: "inner", path: "/book/inner_start_lifestyle" })
  })

  test("leadership coaching offers the intro call and a session", () => {
    expect(step("coaching")).toEqual({ kind: "coaching", path: "/book/session" })
    expect(
      leadNextStep({ need: "coaching", timeline: "quarter", audience: "organisation" })
    ).toEqual({ kind: "coaching", path: "/book/session" })
  })

  test("team, workshop and talk get a proposal and the matching request form", () => {
    for (const timeline of LEAD_TIMELINES) {
      expect(leadNextStep({ need: "team", timeline, audience: "organisation" })).toEqual({
        kind: "proposal",
        path: "/book/workshop",
      })
      expect(leadNextStep({ need: "talk", timeline, audience: "organisation" })).toEqual({
        kind: "proposal",
        path: "/book/keynote",
      })
    }
  })

  test("not sure, or only exploring coaching or the inifrån track, reads first", () => {
    expect(step("unsure")).toEqual({ kind: "explore", path: "/inifran" })
    expect(step("coaching", "exploring" as "month")).toEqual({ kind: "explore", path: "/inifran" })
    expect(step("inner_mentoring", "exploring" as "month").kind).toBe("explore")
  })

  test("every combination has a next step on a www path", () => {
    for (const need of LEAD_NEEDS) {
      for (const timeline of LEAD_TIMELINES) {
        for (const audience of ["private", "organisation"] as const) {
          expect(leadNextStep({ need, timeline, audience }).path).toMatch(/^\/[a-z_/]+$/)
        }
      }
    }
  })
})

describe("AdminLeadUpdateSchema", () => {
  test("takes a status, notes or both, never neither", () => {
    expect(AdminLeadUpdateSchema.safeParse({ id: "3", status: "won" }).success).toBe(true)
    expect(AdminLeadUpdateSchema.safeParse({ id: 3, notes: "Called back" }).success).toBe(true)
    expect(AdminLeadUpdateSchema.safeParse({ id: 3 }).success).toBe(false)
    expect(AdminLeadUpdateSchema.safeParse({ id: 3, status: "maybe" }).success).toBe(false)
    expect(AdminLeadUpdateSchema.safeParse({ id: 3, notes: "x".repeat(5001) }).success).toBe(false)
    expect(LEAD_STATUSES[0]).toBe("new")
  })
})
