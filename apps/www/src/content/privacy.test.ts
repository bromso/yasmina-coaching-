import { describe, expect, test } from "bun:test"
import { privacy } from "./privacy"

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
