import { describe, expect, test } from "bun:test"
import { translatorFor } from "@repo/i18n/translate"
import { emails, leadNewSubject, leadReceivedSubject } from "./index"

const sv = translatorFor("sv", "email")

describe("leadNew", () => {
  const props = {
    reference: "LEAD-12",
    audience: "Organisation",
    need: "Team development or supervision",
    timeline: "Within three months",
    contactMethod: "Phone",
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+46 70 123 45 67",
    organisation: "Analytical Engines AB",
    role: "Head of unit",
    message: "Our management team needs to work as one again.\n\nThanks.",
    newsletter: true,
    page: "/kontakt",
    adminUrl: "https://auth.example.com/admin/leads/12",
  }

  test("renders the subject, every answer and the admin link", async () => {
    const mail = await emails.leadNew(props)
    expect(mail.subject).toBe("New contact request LEAD-12: Team development or supervision")
    expect(leadNewSubject("LEAD-12", props.need)).toBe(mail.subject)
    for (const part of [mail.html, mail.text]) {
      for (const value of [
        "LEAD-12",
        "Organisation",
        "Team development or supervision",
        "Within three months",
        "Ada Lovelace",
        "ada@example.com",
        "+46 70 123 45 67",
        "Analytical Engines AB",
        "Head of unit",
        "Our management team needs to work as one again.",
        "/kontakt",
        props.adminUrl,
      ]) {
        expect(part).toContain(value)
      }
    }
    expect(mail.text).toContain("Prefers to be contacted by: Phone")
    expect(mail.text).toContain("Newsletter: Yes")
    expect(mail.html).toContain("white-space:pre-wrap")
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("leaves out the optional answers that were not given", async () => {
    const mail = await emails.leadNew({
      reference: "LEAD-13",
      audience: "Private person",
      need: "Not sure yet",
      timeline: "Just exploring",
      contactMethod: "Email",
      name: "Bo",
      email: "bo@example.com",
      newsletter: false,
      adminUrl: props.adminUrl,
    })
    for (const label of ["Phone:", "Organisation:", "Role:", "Message:", "Page:"]) {
      expect(mail.text).not.toContain(label)
    }
    expect(mail.text).toContain("Newsletter: No")
  })

  test("a <script> in a typed field is escaped in html and verbatim in text", async () => {
    const mail = await emails.leadNew({ ...props, name: "Ada <script>alert(1)</script>" })
    expect(mail.html).not.toContain("<script>")
    expect(mail.html).toContain("&lt;script&gt;")
    expect(mail.text).toContain("Ada <script>alert(1)</script>")
  })
})

describe("leadReceived", () => {
  const props = {
    reference: "LEAD-12",
    nextStep: "inner" as const,
    nextStepUrl: "https://www.example.com/book/inner_start_coaching",
  }

  test("the reference, the reply time and one next step, nothing the visitor typed", async () => {
    const mail = await emails.leadReceived(props)
    expect(mail.subject).toBe("Thank you for getting in touch (LEAD-12)")
    expect(leadReceivedSubject("LEAD-12")).toBe(mail.subject)
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain("LEAD-12")
      expect(part).toContain("within two working days")
      expect(part).toContain(props.nextStepUrl)
    }
    expect(mail.text).toContain("Book a start call")
  })

  test("each kind has its own wording and button", async () => {
    const button = {
      inner: "Book a start call",
      coaching: "Book a coaching session",
      proposal: "Suggest dates",
      explore: "Read about Ledarskap inifrån",
    } as const
    for (const [kind, label] of Object.entries(button)) {
      const mail = await emails.leadReceived({
        ...props,
        nextStep: kind as keyof typeof button,
      })
      expect(mail.text).toContain(label)
    }
    const coaching = await emails.leadReceived({ ...props, nextStep: "coaching" })
    expect(coaching.text).toContain("free intro call")
    const proposal = await emails.leadReceived({ ...props, nextStep: "proposal" })
    expect(proposal.text).toContain("proposal")
  })

  test("Swedish: subject, body and button follow the visitor's language", async () => {
    const mail = await emails.leadReceived({ ...props, nextStep: "coaching" }, "sv")
    expect(mail.subject).toBe(sv("leadReceived.subject", { reference: "LEAD-12" }))
    expect(mail.subject).toContain("LEAD-12")
    expect(mail.subject).not.toBe(leadReceivedSubject("LEAD-12"))
    expect(mail.text).toContain("inom två arbetsdagar")
    expect(mail.text).toContain(sv("leadReceived.next", { kind: "coaching" }))
    expect(mail.text).toContain(props.nextStepUrl)
    for (const text of [mail.subject, mail.text]) expect(text).not.toContain("!")
  })
})
