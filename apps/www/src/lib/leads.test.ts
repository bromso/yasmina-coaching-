import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import type { LeadCreateInput } from "@repo/api-contract"
import { CONTACT } from "@/content/contact"
import { contactFrom } from "@/content/contact-links"
import {
  doneHref,
  GENERIC_FAILURE,
  parseDone,
  sendLeadCore,
  sourcePage,
  TOO_MANY_REQUESTS,
} from "./leads"

/** A filled-in form, as the browser posts it; `patch` overrides or (with "") clears a field. */
function form(patch: Record<string, string> = {}): FormData {
  const fields: Record<string, string> = {
    audience: "private",
    need: "coaching",
    timeline: "month",
    message: "Jag har nyss blivit chef.",
    name: "Ada Lovelace",
    email: "Ada@Example.com",
    phone: "",
    organisation: "",
    role: "",
    contactMethod: "email",
    consent: "yes",
    page: "/kontakt",
    ...patch,
  }
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) if (value !== "") fd.set(key, value)
  return fd
}

/** An api stub recording what it was sent. */
function stub(
  answer: () => Promise<{ reference: string }> = async () => ({ reference: "LEAD-7" })
) {
  const sent: LeadCreateInput[] = []
  return {
    sent,
    api: {
      create: async (input: LeadCreateInput) => {
        sent.push(input)
        return answer()
      },
    },
  }
}

describe("sendLeadCore", () => {
  test("sends the answers and lands on the done page with the reference and the answers", async () => {
    const { api, sent } = stub()
    const out = await sendLeadCore({ api }, form({ newsletter: "yes" }))
    expect(out).toEqual({
      ok: true,
      redirectTo: "/kontakt/tack?ref=LEAD-7&for=private&need=coaching&when=month",
    })
    expect(sent).toEqual([
      {
        audience: "private",
        need: "coaching",
        timeline: "month",
        message: "Jag har nyss blivit chef.",
        name: "Ada Lovelace",
        email: "ada@example.com",
        phone: undefined,
        organisation: undefined,
        role: undefined,
        contactMethod: "email",
        consent: true,
        newsletter: true,
        page: "/kontakt",
      },
    ])
  })

  test("the newsletter is off unless its box was ticked; a private person's organisation is not sent", async () => {
    const { api, sent } = stub()
    await sendLeadCore({ api }, form({ organisation: "Acme", role: "Chef" }))
    expect(sent[0]).toMatchObject({ newsletter: false, organisation: undefined, role: undefined })
  })

  test("an organisation sends its name and role", async () => {
    const { api, sent } = stub()
    await sendLeadCore(
      { api },
      form({ audience: "organisation", organisation: "Acme AB", role: "HR-chef", need: "team" })
    )
    expect(sent[0]).toMatchObject({ organisation: "Acme AB", role: "HR-chef" })
  })

  test("every missing answer is a field error in the page's language, and nothing is sent", async () => {
    for (const locale of ["sv", "en"] as const) {
      const { api, sent } = stub()
      const check = CONTACT[locale].form.check
      const out = await sendLeadCore(
        { api, locale },
        form({ audience: "", need: "", timeline: "", name: "", email: "nope", consent: "" })
      )
      expect(out).toMatchObject({
        ok: false,
        fieldErrors: {
          audience: check.audience,
          need: check.need,
          timeline: check.timeline,
          name: check.name,
          email: check.email,
          consent: check.consent,
        },
      })
      expect(sent).toHaveLength(0)
    }
  })

  test("an organisation must name itself, and a phone call needs a number", async () => {
    const { api } = stub()
    const check = CONTACT.sv.form.check
    expect(
      await sendLeadCore({ api }, form({ audience: "organisation", contactMethod: "phone" }))
    ).toMatchObject({
      ok: false,
      fieldErrors: { organisation: check.organisation, phone: check.phone },
    })
  })

  test("a refusal keeps what was typed, so the form can show it again", async () => {
    const { api } = stub()
    const out = await sendLeadCore({ api }, form({ email: "nope", message: "Hej" }))
    expect(out).toMatchObject({
      ok: false,
      values: { email: "nope", message: "Hej", audience: "private", need: "coaching" },
    })
  })

  test("the limiter's refusal and a crash answer in the page's own words", async () => {
    for (const locale of ["sv", "en"] as const) {
      const limited = stub(async () => {
        throw new ORPCError("TOO_MANY_REQUESTS", { defined: true, message: "x" })
      })
      expect(await sendLeadCore({ api: limited.api, locale }, form())).toMatchObject({
        ok: false,
        message: TOO_MANY_REQUESTS[locale],
      })
      const down = stub(async () => {
        throw new Error("down")
      })
      expect(await sendLeadCore({ api: down.api, locale }, form())).toMatchObject({
        ok: false,
        message: GENERIC_FAILURE[locale],
      })
    }
  })

  test("a bad page is dropped; the api still gets the lead", async () => {
    const { api, sent } = stub()
    await sendLeadCore({ api }, form({ page: "https://evil.example" }))
    expect(sent[0]?.page).toBeUndefined()
  })
})

describe("the done page's query", () => {
  test("doneHref and parseDone round-trip the reference and the three answers", () => {
    const href = doneHref("LEAD-9", { audience: "organisation", need: "talk", timeline: "quarter" })
    const query = Object.fromEntries(new URL(href, "http://x").searchParams)
    expect(parseDone(query)).toEqual({
      reference: "LEAD-9",
      answers: { audience: "organisation", need: "talk", timeline: "quarter" },
    })
  })

  test("anything untrusted is dropped: a bad answer leaves no tailored step, a spoofed ref no reference", () => {
    expect(parseDone({ ref: "LEAD-1", for: "private", need: "sales", when: "month" })).toEqual({
      reference: "LEAD-1",
      answers: null,
    })
    expect(parseDone({}).reference).toBe("")
    for (const spoofed of [
      "x".repeat(100),
      "Ring 070-123 45 67 för att avsluta",
      "LEAD-",
      "LEAD-1 ",
      "lead-1",
      "LEAD-1234567890123",
      "BK-12",
    ]) {
      expect(parseDone({ ref: spoofed }).reference).toBe("")
    }
    expect(parseDone({ ref: "LEAD-123456789012" }).reference).toBe("LEAD-123456789012")
    expect(parseDone({ ref: ["LEAD-2", "LEAD-3"] }).reference).toBe("LEAD-2")
  })

  test("sourcePage keeps a www path from ?from= and falls back to /kontakt", () => {
    expect(sourcePage("/inifran/coachning")).toBe("/inifran/coachning")
    // What the site's own links send: the home teaser, the booking pages, a blog post.
    for (const from of ["/", "/book", "/blog/att-leda-genom-en-kris", "/blog/en/mentor-or-coach"]) {
      expect(
        sourcePage(new URL(contactFrom(from), "http://x").searchParams.get("from") ?? "")
      ).toBe(from)
    }
    expect(sourcePage("https://evil.example")).toBe("/kontakt")
    expect(sourcePage(undefined)).toBe("/kontakt")
  })
})

describe("the messages", () => {
  test("exist in both languages, without an exclamation mark", () => {
    for (const messages of [GENERIC_FAILURE, TOO_MANY_REQUESTS]) {
      for (const text of [messages.sv, messages.en]) {
        expect(text.length).toBeGreaterThan(0)
        expect(text).not.toContain("!")
      }
    }
  })
})
