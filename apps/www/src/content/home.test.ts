import { describe, expect, test } from "bun:test"
import { LOCALES } from "@repo/i18n/locales"
import { BOOKING, bookingFor } from "./booking"
import { BOOKING_FORMS } from "./booking-forms"
import { CONTACT } from "./contact"
import { BOOK_HREF, HOME, homeFor, SECTION_IDS } from "./home"
import { INNER_HREF } from "./inner"
import { MEDIA_TEXT, mediaFor } from "./media"
import { SITE } from "./site"
import { STATUS } from "./status"

const ids: readonly string[] = SECTION_IDS

for (const locale of LOCALES) {
  describe(`the landing page in ${locale}`, () => {
    const home = homeFor(locale)

    test("every header link scrolls to a section the page renders, or opens the booking catalog or the Inifrån hub", () => {
      for (const link of home.nav) {
        if (link.href === BOOK_HREF || link.href === INNER_HREF) continue
        expect(ids).toContain(link.href.replace("/#", ""))
      }
      expect(home.nav.map((l) => l.href)).toContain(BOOK_HREF)
    })

    test("the hero books, and its other calls to action point at sections on the page", () => {
      expect(home.hero.primary.href).toBe(BOOK_HREF)
      for (const { href } of [home.hero.secondary, home.statement.link]) {
        expect(ids).toContain(href.replace("#", ""))
      }
    })

    test("offers and steps are numbered in order, so the serif numerals read as a sequence", () => {
      expect(home.offers.items.map((o) => o.number)).toEqual(["01", "02", "03", "04"])
      expect(home.steps.items.map((s) => s.number)).toEqual(["01", "02", "03"])
    })

    test("the hero shows exactly three stats, the row the layout is built for", () => {
      expect(home.hero.stats).toHaveLength(3)
      for (const stat of home.hero.stats) {
        expect(stat.value.length).toBeGreaterThan(0)
        expect(stat.label.length).toBeGreaterThan(0)
      }
    })

    test("every FAQ answer is a plain string, so the block can emit FAQPage structured data", () => {
      for (const item of home.faq.items) expect(typeof item.answer).toBe("string")
    })

    test("the experience timeline runs newest first", () => {
      const starts = home.credentials.experience.map((r) => Number(r.period.slice(0, 4)))
      for (let i = 1; i < starts.length; i++) {
        expect(starts[i - 1]).toBeGreaterThanOrEqual(starts[i] as number)
      }
    })
  })
}

/** Every string in a content object, functions called with sample numbers. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (typeof value === "function") return strings((value as (...args: number[]) => unknown)(2, 6))
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === "object") return Object.values(value).flatMap(strings)
  return []
}

/**
 * Every leaf of a content object by path, functions called with sample numbers: the shape both
 * languages must share (array items by index, so a list keeps its length too).
 */
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

/** Each content module as `{ sv, en }`. */
const MODULES = {
  home: HOME,
  booking: BOOKING,
  bookingForms: BOOKING_FORMS,
  contact: CONTACT,
  media: {
    sv: { alt: mediaFor("sv"), text: MEDIA_TEXT.sv },
    en: { alt: mediaFor("en"), text: MEDIA_TEXT.en },
  },
  site: SITE,
  status: STATUS,
}

describe("both languages, one shape", () => {
  for (const [name, byLocale] of Object.entries(MODULES)) {
    test(`${name}: every Swedish key exists in English as a non-empty string, and back`, () => {
      const sv = leaves(byLocale.sv)
      const en = leaves(byLocale.en)
      expect([...en.keys()].sort()).toEqual([...sv.keys()].sort())
      for (const [key, value] of sv) {
        const other = en.get(key)
        expect(typeof other).toBe(typeof value)
        if (typeof value === "string") {
          expect(value.length, `${name}.${key} (sv)`).toBeGreaterThan(0)
          expect((other as string).length, `${name}.${key} (en)`).toBeGreaterThan(0)
        }
      }
    })
  }

  test("ids, links and numbers are the same in both languages; only the words differ", () => {
    for (const [sv, en] of [
      [HOME.sv.nav, HOME.en.nav],
      [HOME.sv.offers.items, HOME.en.offers.items],
      [HOME.sv.steps.items, HOME.en.steps.items],
    ] as const) {
      expect(en.map((i) => ("href" in i ? i.href : i.number))).toEqual(
        sv.map((i) => ("href" in i ? i.href : i.number))
      )
    }
    expect(HOME.en.hero.secondary.href).toBe(HOME.sv.hero.secondary.href)
    expect(Object.keys(BOOKING.en.offerings)).toEqual(Object.keys(BOOKING.sv.offerings))
  })
})

describe("Yasmina's voice", () => {
  for (const locale of LOCALES) {
    test(`${locale}: no exclamation marks anywhere`, () => {
      const copy = Object.values(MODULES).flatMap((m) => strings(m[locale]))
      expect(copy.length).toBeGreaterThan(100)
      for (const text of copy) expect(text).not.toContain("!")
    })
  }

  test("Swedish, du-tilltal: spot checks on what the header, hero and booking say", () => {
    expect(HOME.sv.nav.map((l) => l.label)).toEqual([
      "Coaching",
      "Om Yasmina",
      "Så går det till",
      "Frågor",
      "Inifrån",
      "Boka",
    ])
    expect(HOME.sv.hero.primary.label).toBe("Boka ett samtal")
    expect(bookingFor("sv").kindLines.instant).toBe("Välj en tid")
    expect(bookingFor("sv").form.steps.instant).toEqual([
      "Välj tid",
      "Dina uppgifter",
      "Betalning",
      "Klart",
    ])
    expect(bookingFor("sv").form.steps.member).toEqual(["Välj tid", "Dina uppgifter", "Klart"])
  })

  test("English: spot checks on the same places", () => {
    expect(HOME.en.nav.map((l) => l.label)).toEqual([
      "Coaching",
      "About",
      "How it works",
      "Questions",
      "From within",
      "Book",
    ])
    expect(HOME.en.hero.title).toBe("Lead the way you would want to be led")
    expect(HOME.en.statement.title).toBe("Your team can tell when you see them.")
    expect(HOME.en.manifesto.lead).toBe("Most leaders get help after something breaks.")
    expect(HOME.en.why.heading.title).toBe("She has sat in your chair.")
    expect(HOME.en.steps.items.map((s) => s.title)).toEqual(["Listen", "Clarify", "Act"])
    expect(HOME.en.contact.title).toBe("Start with a conversation")
    expect(HOME.en.contact.link).toEqual({ label: "Contact Yasmina", href: "/kontakt" })
    expect(bookingFor("en").kindLines).toEqual({
      instant: "Pick a time",
      group: "Reserve a seat",
      request: "Request dates",
    })
    expect(bookingFor("en").form.steps).toEqual({
      instant: ["Pick a time", "Your details", "Payment", "Done"],
      group: ["Pick a session", "Your details", "Payment", "Done"],
      request: ["Your request", "Your details", "Review and send", "Done"],
      member: ["Pick a time", "Your details", "Done"],
    })
    expect(bookingFor("en").form.instant.submit).toBe("Confirm booking")
    expect(bookingFor("en").form.group.submit).toBe("Reserve seats")
    expect(bookingFor("en").form.request.submit).toBe("Send request")
    expect(bookingFor("en").manage.cancelLegend).toBe("Cancel this session")
    expect(bookingFor("en").form.cancel).toMatchObject({
      confirm: "Yes, cancel this session",
      submit: "Cancel session",
    })
    expect(SITE.en.nav.explore).toBe("Explore")
  })
})
