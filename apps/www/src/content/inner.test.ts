import { describe, expect, test } from "bun:test"
import { MEMBER_OFFERING_KEYS, OFFERING_KEYS } from "@repo/api-contract/booking-limits"
import { LOCALES } from "@repo/i18n/locales"
import { BOOKING } from "./booking"
import { HOME } from "./home"
import { INNER, INNER_HREF, INNER_SERVICE_IDS, innerFor } from "./inner"
import { formatKr, INNER_PRICES } from "./inner-pricing"

/** Every string in a value, functions called with sample numbers. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (typeof value === "function") return strings((value as (...args: number[]) => unknown)(2, 6))
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === "object") return Object.values(value).flatMap(strings)
  return []
}

/** Every leaf by path (array items by index), so both languages must share keys and lengths. */
function leaves(value: unknown, path = ""): Map<string, unknown> {
  const out = new Map<string, unknown>()
  if (typeof value === "function") {
    out.set(path, (value as (...args: number[]) => unknown)(2, 6))
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => {
      for (const [k, v] of leaves(item, `${path}[${i}]`)) out.set(k, v)
    })
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      for (const [k, v] of leaves(item, path ? `${path}.${key}` : key)) out.set(k, v)
    }
  } else {
    out.set(path, value)
  }
  return out
}

const INNER_KEYS = OFFERING_KEYS.filter((key) => key.startsWith("inner_"))

/** All the track's copy in one language: the content module, the home teaser, the booking cards. */
function trackCopy(locale: (typeof LOCALES)[number]): string[] {
  const booking = BOOKING[locale]
  return [
    ...strings(INNER[locale]),
    ...strings(HOME[locale].inner),
    ...INNER_KEYS.flatMap((key) => strings(booking.offerings[key])),
    ...strings(booking.catalogGroups),
  ]
}

describe("Ledarskap inifrån: both languages, one shape", () => {
  test("every Swedish leaf exists in English with the same type, and back", () => {
    const sv = leaves(INNER.sv)
    const en = leaves(INNER.en)
    expect([...en.keys()].sort()).toEqual([...sv.keys()].sort())
    for (const [key, value] of sv) {
      expect(typeof en.get(key), key).toBe(typeof value)
      if (typeof value === "string") {
        expect(value.length, `${key} (sv)`).toBeGreaterThan(0)
        expect((en.get(key) as string).length, `${key} (en)`).toBeGreaterThan(0)
      }
    }
  })

  test("slugs, offerings, images and reference links are the same in both languages", () => {
    for (const id of INNER_SERVICE_IDS) {
      const { sv, en } = { sv: INNER.sv.services[id], en: INNER.en.services[id] }
      for (const field of [
        "slug",
        "startOffering",
        "memberOffering",
        "groupOffering",
        "image",
      ] as const) {
        expect(en[field], `${id}.${field}`).toBe(sv[field])
      }
    }
    expect(INNER.en.research.references.map((r) => [r.n, r.url])).toEqual(
      INNER.sv.research.references.map((r) => [r.n, r.url])
    )
    expect(INNER.en.research.findings.map((f) => f.sources)).toEqual(
      INNER.sv.research.findings.map((f) => f.sources)
    )
  })
})

describe("Ledarskap inifrån: services", () => {
  test("each service has its Swedish slug and its booking keys", () => {
    const services = innerFor("sv").services
    expect(INNER_SERVICE_IDS.map((id) => services[id].slug)).toEqual([
      "coachning",
      "mentorskap",
      "livsstil",
      "grupp",
    ])
    expect(services.coaching).toMatchObject({
      startOffering: "inner_start_coaching",
      memberOffering: "inner_session",
    })
    expect(services.mentoring).toMatchObject({
      startOffering: "inner_start_mentoring",
      memberOffering: "inner_mentoring_session",
    })
    expect(services.lifestyle).toMatchObject({
      startOffering: "inner_start_lifestyle",
      memberOffering: "inner_session",
    })
    expect(services.group.groupOffering).toBe("inner_group")
    expect(services.group.startOffering).toBeUndefined()
    expect(services.group.package.start).toBeUndefined()
  })

  for (const locale of LOCALES) {
    test(`${locale}: every offering a service names is a real offering key`, () => {
      const keys: readonly string[] = OFFERING_KEYS
      const members: readonly string[] = MEMBER_OFFERING_KEYS
      for (const service of Object.values(INNER[locale].services)) {
        for (const key of [service.startOffering, service.groupOffering]) {
          if (key) expect(keys).toContain(key)
        }
        if (service.memberOffering) expect(members).toContain(service.memberOffering)
      }
    })

    test(`${locale}: the price answer quotes the price model, never a hand-written figure`, () => {
      const { services } = INNER[locale]
      for (const id of INNER_SERVICE_IDS) {
        const prices = INNER_PRICES[id]
        const text = strings(services[id].faq).join(" ")
        for (const amount of [prices.start, prices.monthly, prices.quarter]) {
          if (amount !== undefined) expect(text).toContain(formatKr(amount, locale))
        }
      }
    })
  }
})

describe("Ledarskap inifrån: research", () => {
  for (const locale of LOCALES) {
    test(`${locale}: every finding cites at least one reference that exists`, () => {
      const { findings, references } = INNER[locale].research
      const numbers = references.map((r) => r.n)
      expect(new Set(numbers).size).toBe(numbers.length)
      expect(findings.length).toBeGreaterThan(0)
      for (const finding of findings) {
        expect(finding.sources.length, finding.claim).toBeGreaterThan(0)
        for (const n of finding.sources) expect(numbers).toContain(n)
      }
    })

    test(`${locale}: every reference is cited and links to its DOI`, () => {
      const { findings, limits, references } = INNER[locale].research
      const cited = new Set(findings.flatMap((f) => f.sources))
      expect(limits.length).toBeGreaterThan(0)
      for (const ref of references) {
        expect(cited.has(ref.n), ref.text).toBe(true)
        expect(ref.url).toMatch(/^https:\/\/doi\.org\/10\./)
      }
    })
  }
})

describe("Ledarskap inifrån: Yasmina's voice", () => {
  for (const locale of LOCALES) {
    test(`${locale}: no exclamation marks`, () => {
      const copy = trackCopy(locale)
      expect(copy.length).toBeGreaterThan(100)
      for (const text of copy) expect(text).not.toContain("!")
    })

    test(`${locale}: no cure or treatment words, except where the copy points to healthcare`, () => {
      const referrals = trackCopy(locale).filter((text) => /bota|cure|behandl|treat/i.test(text))
      expect(referrals.length, "the healthcare referral itself").toBeGreaterThan(0)
      for (const text of referrals) expect(text).toMatch(/vården|healthcare/i)
    })
  }

  test("the hub's headline and the home page's way in", () => {
    expect(INNER.sv.hub.hero.title).toBe("Starkt ledarskap börjar från insidan")
    expect(INNER.en.hub.hero.title).toBe("Strong leadership starts on the inside")
    expect(HOME.sv.nav).toContainEqual({ label: "Inifrån", href: INNER_HREF })
    expect(HOME.en.nav).toContainEqual({ label: "From within", href: INNER_HREF })
    expect(HOME.sv.inner.link.href).toBe(INNER_HREF)
    expect(HOME.en.inner.link.href).toBe(INNER_HREF)
  })

  test("the yoga certification is listed word for word", () => {
    expect(HOME.sv.credentials.education.map((c) => c.title)).toContain(
      "Certifierad yogalärare, registrerad hos Yoga Alliance (200 timmar), med 50 timmar fördjupning i yin yoga"
    )
    expect(HOME.en.credentials.education.map((c) => c.title)).toContain(
      "Certified yoga teacher, registered with Yoga Alliance (200 hours), with 50 hours of further training in yin yoga"
    )
  })
})

describe("the booking catalog's groups", () => {
  for (const locale of LOCALES) {
    test(`${locale}: leadership and inner keys, each once, member sessions in neither`, () => {
      const groups = BOOKING[locale].catalogGroups
      expect(groups.map((g) => g.id)).toEqual(["leadership", "inner"])
      const listed = groups.flatMap((g) => [...g.keys])
      expect(new Set(listed).size).toBe(listed.length)
      const members: readonly string[] = MEMBER_OFFERING_KEYS
      expect(listed.sort()).toEqual(OFFERING_KEYS.filter((k) => !members.includes(k)).sort())
      for (const key of groups[1]?.keys ?? []) expect(key.startsWith("inner_")).toBe(true)
      for (const key of groups[0]?.keys ?? []) expect(key.startsWith("inner_")).toBe(false)
    })
  }
})
