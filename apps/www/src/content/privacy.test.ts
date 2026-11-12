import { describe, expect, test } from "bun:test"
import { PRIVACY, privacy } from "./privacy"
import { TERMS } from "./terms"

const auditText = () =>
  (privacy.sections.find((s) => s.id === "audit-logs")?.paragraphs ?? []).join(" ")

describe("privacy template: Audit logs", () => {
  test("says the log covers a user's own account changes, not only staff and admin actions", () => {
    const text = auditText()
    // Admin tools and our team, including acting while signed in as a user.
    expect(text).toContain("admin tools")
    expect(text).toContain("signed in as you")
    // apps/api writes these rows without any staff involvement.
    expect(text).toContain("email address")
    expect(text).toContain("masked")
    expect(text).toContain("deletion of your account")
  })

  test("says workspace administrative changes are always recorded and who can see them", () => {
    const text = auditText()
    expect(text).toContain("every administrative change made to a workspace, whoever makes it")
    for (const item of [
      "membership",
      "roles",
      "invitations",
      "name and logo",
      "ownership",
      "plan",
      "API keys and webhooks",
      "whether it requires two-step verification",
    ]) {
      expect(text).toContain(item)
    }
    expect(text).toContain("last 90 days")
    expect(text).toContain("the member's name")
    expect(text).toContain("while they are still a member of the workspace, their email address")
    expect(text).toContain('marked "by support"')
    expect(text).toContain("never includes an IP address or browser")
    expect(text).toContain("has two-step verification or a passkey — yes or no only")
  })

  test("names the default periods", () => {
    expect(auditText()).toContain("90 days")
    expect(auditText()).toContain("365 days")
  })

  test("updatedAt moved with the Audit logs section", () => {
    expect(privacy.updatedAt >= "2026-10-18").toBe(true)
  })
})

const apiText = () =>
  (privacy.sections.find((s) => s.id === "api-access")?.paragraphs ?? []).join(" ")

describe("privacy template: API access", () => {
  test("names everything /v1 exposes: the slug, user ids, join dates and notes' authors", () => {
    const text = apiText()
    expect(text).toContain("name, slug and plan")
    expect(text).toContain("user ids, names, roles and when they joined")
    expect(text).toContain("authors' names and ids")
    expect(text).toContain("never given access to email addresses")
  })

  test("says a short prefix of the key is kept, not only a hash", () => {
    const text = apiText()
    expect(text).toContain("one-way hash")
    expect(text).toContain("short prefix")
  })
})

const section = (id: string) =>
  (privacy.sections.find((s) => s.id === id)?.paragraphs ?? []).join(" ")

describe("privacy template: contact requests", () => {
  test("names what the contact form stores, who sees it and the 12-month deletion", () => {
    const text = section("what-we-collect")
    for (const item of [
      "/kontakt",
      "what you want help with and how soon",
      "optional phone number",
      "organisation and role",
      "consent to be contacted",
      "separate newsletter box",
      "hash of your IP address",
      "deleted 12 months after it arrived",
      "we do not send a newsletter today",
      "if you ask us to delete it",
    ]) {
      expect(text).toContain(item)
    }
    expect(section("retention")).toContain("Contact requests")
    expect(section("retention")).toContain("12 months")
  })

  test("the analytics section says the contact form's event carries the choices only", () => {
    const text = section("analytics")
    expect(text).toContain("sending the contact form")
    expect(text).toContain("never your name, email address, message or any account")
  })

  test("updatedAt moved with the contact section", () => {
    expect(privacy.updatedAt >= "2026-11-11").toBe(true)
  })
})

describe("the legal pages in Swedish and English", () => {
  for (const [name, doc] of [
    ["privacy", PRIVACY],
    ["terms", TERMS],
  ] as const) {
    test(`${name}: the same sections, in the same order, with as many paragraphs`, () => {
      expect(doc.sv.sections.map((s) => s.id)).toEqual(doc.en.sections.map((s) => s.id))
      for (const [i, section] of doc.sv.sections.entries()) {
        expect(section.paragraphs.length).toBe(doc.en.sections[i]?.paragraphs.length ?? -1)
      }
      expect(doc.sv.updatedAt).toBe(doc.en.updatedAt)
      expect(doc.sv.title).not.toBe(doc.en.title)
    })

    test(`${name}: every placeholder is kept in both languages`, () => {
      const placeholders = (text: string) =>
        [...text.matchAll(/\[(Company|Contact email|Jurisdiction)\]/g)].length
      const all = (l: "sv" | "en") => doc[l].sections.flatMap((s) => s.paragraphs).join(" ")
      expect(placeholders(all("sv"))).toBe(placeholders(all("en")))
      expect(placeholders(all("sv"))).toBeGreaterThan(0)
    })
  }

  test("the Swedish privacy policy uses Swedish GDPR terms and says the contact form's facts", () => {
    const text = PRIVACY.sv.sections.flatMap((s) => s.paragraphs).join(" ")
    for (const term of [
      "Personuppgiftsansvarig är [Company]",
      "rättslig grund",
      "berättigade intresse",
      "samtycke",
      "registrerad",
      "Integritetsskyddsmyndigheten (IMY)",
      "personuppgiftsbiträden",
      "/kontakt",
      "raderas 12 månader efter att den kom in",
      "om du ber oss radera den",
      "vi skickar inget nyhetsbrev i dag",
      "bara de tre val du gjorde",
    ]) {
      expect(text).toContain(term)
    }
    expect(PRIVACY.sv.sections.find((s) => s.id === "retention")?.title).toBe("Lagringstid")
  })

  test("English names the controller, the legal basis and IMY as well", () => {
    const text = PRIVACY.en.sections.flatMap((s) => s.paragraphs).join(" ")
    expect(text).toContain("The data controller is [Company]")
    expect(text).toContain("The legal basis for each purpose is [legal basis")
    expect(text).toContain("Swedish Authority for Privacy Protection (IMY)")
  })
})
