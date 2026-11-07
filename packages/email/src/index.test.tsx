import { describe, expect, test } from "bun:test"
import { translatorFor } from "@repo/i18n/translate"
import englishSnapshots from "./__fixtures__/english-snapshots.json"
import {
  accountDeletedSubject,
  accountDeletionScheduledSubject,
  accountResetSubject,
  accountSuspendedSubject,
  accountUnsuspendedSubject,
  BRAND,
  bookingCancelledSubject,
  bookingConfirmedSubject,
  bookingDeclinedSubject,
  bookingNewSubject,
  bookingRequestReceivedSubject,
  dataExportReadySubject,
  emailChangeConfirmSubject,
  emailChangedSubject,
  emailChangeRequestedSubject,
  emailChangeRevertedSubject,
  emails,
  invitationSubject,
  jobApplicationReceivedSubject,
  jobApplicationSubject,
  magicLinkSubject,
  passkeyAddedSubject,
  passkeyRemovedSubject,
  passkeysRemovedSubject,
  planChangedSubject,
  removedFromWorkspaceSubject,
  roleChangedSubject,
  supportReceivedSubject,
  supportRequestSubject,
  twoFactorDisabledSubject,
  twoFactorEnabledSubject,
  twoFactorResetSubject,
  waitlistWelcomeSubject,
  webhookDisabledSubject,
  workspaceTwoFactorRequiredSubject,
} from "./index"

const link = "https://auth.example.com/verify-email?token=abc"
const sv = translatorFor("sv", "email")

describe("verifyEmail", () => {
  test("renders subject, html and text containing the link", async () => {
    const mail = await emails.verifyEmail({ name: "Ada", link })
    expect(mail.subject).toBe("Verify your email")
    expect(mail.html).toContain(link)
    expect(mail.html).toContain("Ada")
    expect(mail.text).toContain(link)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("escapes HTML in the name", async () => {
    const mail = await emails.verifyEmail({ name: "<script>alert(1)</script>", link })
    expect(mail.html).not.toContain("<script>")
    expect(mail.html).toContain("&lt;script&gt;")
  })

  test("uses the brand name in the footer", async () => {
    const mail = await emails.verifyEmail({ link, brand: "Acme" })
    expect(mail.html).toContain("Acme")
    expect(mail.text).toContain("Acme")
  })
})

describe("resetPassword", () => {
  test("renders the one-hour notice and the link", async () => {
    const mail = await emails.resetPassword({ link })
    expect(mail.subject).toBe("Reset your password")
    expect(mail.html).toContain(link)
    expect(mail.text).toMatch(/within an hour/i)
  })
})

describe("magicLink", () => {
  test("renders the subject, the 15-minute notice and the link in html and text", async () => {
    const magic = "https://auth.example.com/magic?token=abc"
    const mail = await emails.magicLink({ link: magic })
    expect(mail.subject).toBe("Your sign-in link")
    expect(magicLinkSubject).toBe("Your sign-in link")
    expect(mail.html).toContain(magic)
    expect(mail.text).toContain(magic)
    expect(mail.text).toMatch(/15 minutes/)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("uses the brand name", async () => {
    const mail = await emails.magicLink({ link, brand: "Acme" })
    expect(mail.html).toContain("Sign in to Acme")
  })

  test("escapes the brand name in html, keeps it literal in text, and the subject never carries it", async () => {
    const magic = "https://auth.example.com/magic?token=t"
    const mail = await emails.magicLink({ link: magic, brand: "Ada & Bob's" })
    expect(mail.html).toContain("Sign in to Ada &amp; Bob")
    expect(mail.html).not.toContain("Ada & Bob")
    // The plain-text renderer upper-cases the <Heading>, but the ampersand and apostrophe stay
    // literal there (never HTML-entity-escaped, unlike the html render).
    expect(mail.text).toMatch(/SIGN IN TO ADA & BOB'S/)
    expect(mail.subject).toBe(magicLinkSubject)

    const defaultMail = await emails.magicLink({ link: magic })
    expect(defaultMail.html).toContain(BRAND)
  })
})

describe("passwordChanged", () => {
  test("renders the UTC time, the reset link and the account link", async () => {
    const mail = await emails.passwordChanged({
      name: "Ada",
      at: "2026-10-01T18:00:00.000Z",
      accountUrl: "https://account.example.com/security",
      resetUrl: "https://auth.example.com/forgot-password",
    })
    expect(mail.subject).toBe("Your password was changed")
    expect(mail.html).toContain("https://account.example.com/security")
    expect(mail.html).toContain("https://auth.example.com/forgot-password")
    expect(mail.text).toContain("Thu, 01 Oct 2026 18:00:00 GMT")
    expect(mail.text).toMatch(/If it was not you, reset your password now at/)
    expect(mail.text).toContain("https://auth.example.com/forgot-password")
  })
})

describe("accountReset", () => {
  test("renders the subject, the reason and the security link in html and text", async () => {
    const mail = await emails.accountReset({
      name: "Ada",
      accountUrl: "https://account.example.com",
    })
    expect(mail.subject).toBe("Your account was reset")
    expect(accountResetSubject).toBe("Your account was reset")
    expect(mail.html).toContain("https://account.example.com/security")
    expect(mail.text).toContain("https://account.example.com/security")
    expect(mail.text).toMatch(/had not verified its email/)
    expect(mail.text).toMatch(/a connected account or a sign-in link/)
    expect(mail.text).toMatch(/every device was signed out/)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })
})

describe("waitlistWelcome", () => {
  test("renders the subject and the site link in html and text, with no tags in text", async () => {
    const site = "https://www.example.com"
    const mail = await emails.waitlistWelcome({ siteUrl: site })
    expect(mail.subject).toBe("You're on the list")
    expect(waitlistWelcomeSubject).toBe("You're on the list")
    expect(mail.html).toContain(site)
    expect(mail.text).toContain(site)
    expect(mail.text).toMatch(/we'll email you/i)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("uses the brand name", async () => {
    const mail = await emails.waitlistWelcome({ siteUrl: "https://www.example.com", brand: "Acme" })
    expect(mail.html).toContain("Acme")
  })
})

describe("invitation", () => {
  const invite = "https://app.example.com/invitations/abc"
  const props = { workspaceName: "Acme Ops", inviterName: "Ada", role: "member", link: invite }

  test("renders the subject, inviter, role, link and the 7-day notice", async () => {
    const mail = await emails.invitation(props)
    expect(mail.subject).toBe("You're invited to Acme Ops")
    expect(invitationSubject("Acme Ops")).toBe(mail.subject)
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain("Ada")
      expect(part).toContain("member")
      expect(part).toContain(invite)
      expect(part).toContain("7 days")
    }
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("escapes HTML in the inviter name", async () => {
    const mail = await emails.invitation({ ...props, inviterName: "<script>alert(1)</script>" })
    expect(mail.html).not.toContain("<script>")
    expect(mail.html).toContain("&lt;script&gt;")
  })
})

describe("twoFactorEnabled", () => {
  test("renders the subject and the security link in html and text", async () => {
    const mail = await emails.twoFactorEnabled({
      name: "Ada",
      accountUrl: "https://account.example.com",
    })
    expect(mail.subject).toBe("Two-step verification turned on")
    expect(twoFactorEnabledSubject).toBe("Two-step verification turned on")
    expect(mail.html).toContain("https://account.example.com/security")
    expect(mail.text).toContain("https://account.example.com/security")
    expect(mail.text).toMatch(/authenticator app/)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })
})

describe("twoFactorDisabled", () => {
  test("renders the subject and the security link in html and text", async () => {
    const mail = await emails.twoFactorDisabled({
      name: "Ada",
      accountUrl: "https://account.example.com",
    })
    expect(mail.subject).toBe("Two-step verification turned off")
    expect(twoFactorDisabledSubject).toBe("Two-step verification turned off")
    expect(mail.html).toContain("https://account.example.com/security")
    expect(mail.text).toContain("https://account.example.com/security")
    expect(mail.text).toMatch(/If this was you, nothing else to do/)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })
})

describe("twoFactorReset", () => {
  test("renders the subject and the security link in html and text", async () => {
    const mail = await emails.twoFactorReset({
      name: "Ada",
      accountUrl: "https://account.example.com",
    })
    expect(mail.subject).toBe("Two-step verification was reset")
    expect(twoFactorResetSubject).toBe("Two-step verification was reset")
    expect(mail.html).toContain("https://account.example.com/security")
    expect(mail.text).toContain("https://account.example.com/security")
    expect(mail.text).toMatch(/An administrator turned off two-step verification/)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })
})

describe("passkeyAdded", () => {
  test("renders the subject, the passkey's name and the security link in html and text", async () => {
    const mail = await emails.passkeyAdded({
      name: "Ada",
      passkeyName: "This device",
      accountUrl: "https://account.example.com",
    })
    expect(mail.subject).toBe("A new passkey was added to your account")
    expect(passkeyAddedSubject).toBe("A new passkey was added to your account")
    expect(mail.html).toContain("https://account.example.com/security")
    expect(mail.text).toContain("https://account.example.com/security")
    expect(mail.text).toContain("This device")
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("escapes HTML in the passkey's name", async () => {
    const mail = await emails.passkeyAdded({
      passkeyName: "<script>alert(1)</script>",
      accountUrl: "https://account.example.com",
    })
    expect(mail.html).not.toContain("<script>")
    expect(mail.html).toContain("&lt;script&gt;")
  })
})

describe("passkeyRemoved", () => {
  test("renders the subject, the passkey's name and the security link in html and text", async () => {
    const mail = await emails.passkeyRemoved({
      name: "Ada",
      passkeyName: "Security key",
      accountUrl: "https://account.example.com",
    })
    expect(mail.subject).toBe("A passkey was removed from your account")
    expect(passkeyRemovedSubject).toBe("A passkey was removed from your account")
    expect(mail.html).toContain("https://account.example.com/security")
    expect(mail.text).toContain("https://account.example.com/security")
    expect(mail.text).toContain("Security key")
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })
})

describe("passkeysRemoved", () => {
  test("renders the subject and the security link in html and text", async () => {
    const mail = await emails.passkeysRemoved({
      name: "Ada",
      accountUrl: "https://account.example.com",
    })
    expect(mail.subject).toBe("Your passkeys were removed")
    expect(passkeysRemovedSubject).toBe("Your passkeys were removed")
    expect(mail.html).toContain("https://account.example.com/security")
    expect(mail.text).toContain("https://account.example.com/security")
    expect(mail.text).toMatch(/An administrator removed every passkey/)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("says the password was not changed only to an account that has one", async () => {
    const accountUrl = "https://account.example.com"
    const withPassword = await emails.passkeysRemoved({ accountUrl, hasPassword: true })
    expect(withPassword.text).toContain(
      "signed it out of every device. Your password was not changed."
    )
    expect(withPassword.html).toContain("Your password was not changed.")
    for (const props of [{ accountUrl, hasPassword: false }, { accountUrl }]) {
      const mail = await emails.passkeysRemoved(props)
      expect(mail.text).toContain("signed it out of every device.")
      expect(mail.text).not.toContain("password")
      expect(mail.html).not.toContain("password")
    }
  })
})

describe("dataExportReady", () => {
  test("renders the subject, the 7-day notice and the link in html and text", async () => {
    const mail = await emails.dataExportReady({ name: "Ada", link })
    expect(mail.subject).toBe("Your data export is ready")
    expect(dataExportReadySubject).toBe("Your data export is ready")
    expect(mail.html).toContain(link)
    expect(mail.text).toContain(link)
    expect(mail.text).toMatch(/Data & privacy page/)
    expect(mail.text).toMatch(/7 days/)
    expect(mail.text).toMatch(/Download your data/)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })
})

describe("accountDeletionScheduled", () => {
  const link = "https://app.example.com/workspaces/new"

  test("renders the subject, the formatted date and the cancel link in html and text", async () => {
    const mail = await emails.accountDeletionScheduled({
      name: "Ada",
      date: "2026-10-01T18:00:00.000Z",
      link,
    })
    expect(mail.subject).toBe("Your account will be deleted")
    expect(accountDeletionScheduledSubject).toBe("Your account will be deleted")
    expect(mail.html).toContain(link)
    expect(mail.text).toContain(link)
    expect(mail.text).toContain("Oct 1, 2026")
    expect(mail.text).toMatch(/Sign in before then to cancel/)
    expect(mail.text).toMatch(/Cancel deletion/)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })
})

describe("accountDeleted", () => {
  test("renders the subject and the body in html and text", async () => {
    const mail = await emails.accountDeleted({ name: "Ada" })
    expect(mail.subject).toBe("Your account has been deleted")
    expect(accountDeletedSubject).toBe("Your account has been deleted")
    expect(mail.text).toMatch(/account and its data are gone/)
    expect(mail.text).toMatch(/shown as a deleted user/)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })
})

describe("accountSuspended", () => {
  test("an indefinite suspension names no end date", async () => {
    const mail = await emails.accountSuspended({ name: "Ada", until: null })
    expect(mail.subject).toBe("Your account has been suspended")
    expect(accountSuspendedSubject).toBe("Your account has been suspended")
    expect(mail.text).toMatch(/will not be able to sign in/)
    expect(mail.text).toMatch(/contact support/i)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("a timed suspension names the formatted end date", async () => {
    const mail = await emails.accountSuspended({
      name: "Ada",
      until: "2026-11-01T00:00:00.000Z",
    })
    expect(mail.text).toContain("Nov 1, 2026")
    expect(mail.text).toMatch(/until Nov 1, 2026/)
  })

  // The admin form stores "through the picked day" as the next UTC midnight, the instant the
  // suspension lifts: the date the mail names is the day sign-in works again, so the Swedish says
  // "fram till den" (until), never "till och med" (through, inclusive) — a day too late.
  test("in Swedish, the end date reads as 'until', not 'through'", async () => {
    const mail = await emails.accountSuspended(
      { name: "Ada", until: "2026-11-02T00:00:00.000Z" },
      "sv"
    )
    expect(mail.text).toContain("fram till den 2 nov. 2026")
    expect(mail.text).not.toContain("till och med")
  })

  // The internal admin reason and the admin's identity are never props this template can take —
  // nothing in its rendered output can name either.
  test("never mentions a reason or an admin", async () => {
    const mail = await emails.accountSuspended({ name: "Ada", until: null })
    expect(mail.text.toLowerCase()).not.toContain("reason")
    expect(mail.text.toLowerCase()).not.toContain("admin")
  })
})

describe("accountUnsuspended", () => {
  test("renders the subject and the body in html and text", async () => {
    const mail = await emails.accountUnsuspended({ name: "Ada" })
    expect(mail.subject).toBe("Your account is no longer suspended")
    expect(accountUnsuspendedSubject).toBe("Your account is no longer suspended")
    expect(mail.text).toMatch(/no longer suspended/)
    expect(mail.text).toMatch(/sign in as usual/)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })
})

describe("supportRequest", () => {
  const props = {
    reference: "req_123",
    topic: "Billing",
    email: "ada@example.com",
    name: "Ada",
    page: "/account/payments",
    message: "My invoice looks wrong.",
    adminUrl: "https://auth.example.com/admin/support/req_123",
  }

  test("renders the subject, reference, topic, from, page, message and admin link", async () => {
    const mail = await emails.supportRequest(props)
    expect(mail.subject).toBe("New support request req_123: Billing")
    expect(supportRequestSubject("req_123", "Billing")).toBe(mail.subject)
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain("req_123")
      expect(part).toContain("Billing")
      expect(part).toContain("Ada")
      expect(part).toContain("ada@example.com")
      expect(part).toContain("/account/payments")
      expect(part).toContain("My invoice looks wrong.")
      expect(part).toContain(props.adminUrl)
    }
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("omits the page line when no page is given", async () => {
    const mail = await emails.supportRequest({ ...props, page: undefined })
    expect(mail.text).not.toContain("/account/payments")
  })

  test("shows just the email when no name is given", async () => {
    const mail = await emails.supportRequest({ ...props, name: undefined })
    expect(mail.text).toContain("ada@example.com")
  })

  test("a <script> in the message is escaped in html and verbatim in text", async () => {
    const mail = await emails.supportRequest({
      ...props,
      message: "Hello <script>alert(1)</script> there",
    })
    expect(mail.html).not.toContain("<script>")
    expect(mail.html).toContain("&lt;script&gt;")
    expect(mail.text).toContain("<script>alert(1)</script>")
  })

  test("preserves line breaks in the html render via white-space: pre-wrap", async () => {
    const mail = await emails.supportRequest({ ...props, message: "line one\nline two" })
    expect(mail.html).toContain("white-space:pre-wrap")
    expect(mail.html).toContain("line one\nline two")
  })
})

describe("supportReceived", () => {
  test("renders the subject, the reference and a generic greeting, nothing the sender typed", async () => {
    const mail = await emails.supportReceived({ reference: "HELP-123" })
    expect(mail.subject).toBe("We've received your request (HELP-123)")
    expect(supportReceivedSubject("HELP-123")).toBe(mail.subject)
    for (const part of [mail.html, mail.text]) expect(part).toContain("HELP-123")
    expect(mail.text).toContain("Hi,")
    expect(mail.text).toMatch(/we've received your request HELP-123/i)
    expect(mail.text).toMatch(/reply to this email address/i)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("its props carry no message and no name (the recipient is any typed address)", async () => {
    // @ts-expect-error: the confirmation must not accept the submitter's text
    const mail = await emails.supportReceived({ reference: "HELP-1", message: "Buy pills" })
    expect(mail.text).not.toContain("Buy pills")
    // @ts-expect-error: nor a free-text name
    const named = await emails.supportReceived({ reference: "HELP-1", name: "Visit evil.example" })
    expect(named.text).not.toContain("evil.example")
  })
})

describe("bookingConfirmed", () => {
  const props = {
    reference: "BK-2041",
    offeringLabel: "coaching session",
    when: "Tuesday 12 May 2026, 10:00",
    where: "online",
    manageUrl: "https://www.example.com/bookings/BK-2041?token=abc",
    name: "Ada",
    cancelCutoffHours: 24,
  }

  test("renders the subject, greeting, booking line, link and cancel cutoff", async () => {
    const mail = await emails.bookingConfirmed(props)
    expect(mail.subject).toBe("Your booking is confirmed (BK-2041)")
    expect(bookingConfirmedSubject("BK-2041")).toBe(mail.subject)
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain("Tuesday 12 May 2026, 10:00")
      expect(part).toContain(props.manageUrl)
    }
    expect(mail.text).toContain("Hi Ada,")
    expect(mail.text).toContain(
      "Your coaching session is booked for Tuesday 12 May 2026, 10:00, online."
    )
    expect(mail.text).toContain("Manage your booking")
    expect(mail.text).toContain("You can cancel online until 24 hours before a session")
    expect(mail.text).toContain("Reply to this email to reschedule.")
    expect(mail.text).not.toContain("Further sessions")
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("lists further sessions under their own heading when given", async () => {
    const mail = await emails.bookingConfirmed({
      ...props,
      extraSessions: ["Tuesday 19 May 2026, 10:00", "Tuesday 26 May 2026, 10:00"],
    })
    expect(mail.text).toMatch(/Further sessions/i)
    expect(mail.text).toContain("Tuesday 19 May 2026, 10:00")
    expect(mail.text).toContain("Tuesday 26 May 2026, 10:00")
    const empty = await emails.bookingConfirmed({ ...props, extraSessions: [] })
    expect(empty.text).not.toMatch(/Further sessions/i)
  })

  test("greets generically without a name", async () => {
    const mail = await emails.bookingConfirmed({ ...props, name: undefined })
    expect(mail.text).toContain("Hi,")
    expect(mail.text).not.toContain("Ada")
  })
})

describe("bookingRequestReceived", () => {
  const props = {
    reference: "BK-2042",
    offeringLabel: "leadership programme",
    manageUrl: "https://www.example.com/bookings/BK-2042?token=abc",
    name: "Ada",
  }

  test("renders the subject, the promise of a reply and the link", async () => {
    const mail = await emails.bookingRequestReceived(props)
    expect(mail.subject).toBe("We've received your request (BK-2042)")
    expect(bookingRequestReceivedSubject("BK-2042")).toBe(mail.subject)
    for (const part of [mail.html, mail.text]) expect(part).toContain(props.manageUrl)
    expect(mail.text).toContain("Hi Ada,")
    expect(mail.text).toContain(
      "Yasmina will reply to this address within a few days with a proposed time for your leadership programme."
    )
    expect(mail.text).toContain("View your request")
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("its props carry no customer message (the recipient is any typed address)", async () => {
    // @ts-expect-error: the confirmation must not accept the customer's text
    const mail = await emails.bookingRequestReceived({ ...props, message: "Buy pills" })
    expect(mail.text).not.toContain("Buy pills")
  })
})

describe("bookingDeclined", () => {
  const props = { reference: "BK-2043", offeringLabel: "workshop", name: "Ada" }

  test("renders the subject, the decline and the footer", async () => {
    const mail = await emails.bookingDeclined(props)
    expect(mail.subject).toBe("About your request (BK-2043)")
    expect(bookingDeclinedSubject("BK-2043")).toBe(mail.subject)
    expect(mail.text).toContain("Hi Ada,")
    expect(mail.text).toContain(
      "Unfortunately Yasmina cannot take on your workshop at the dates you proposed."
    )
    expect(mail.text).toContain("Reply to this email if you would like to look at other dates.")
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("renders the admin's note as its own escaped paragraph when given", async () => {
    const mail = await emails.bookingDeclined({
      ...props,
      note: "I am fully booked in May.\nJune <b>works</b>.",
    })
    expect(mail.text).toContain("I am fully booked in May.")
    expect(mail.text).toContain("June <b>works</b>.")
    expect(mail.html).toContain("&lt;b&gt;works&lt;/b&gt;")
    expect(mail.html).not.toContain("<b>works</b>")
    expect(mail.html).toContain("white-space:pre-wrap")
    const without = await emails.bookingDeclined(props)
    expect(without.text).not.toContain("fully booked")
  })
})

describe("bookingCancelled", () => {
  const props = {
    reference: "BK-2044",
    offeringLabel: "coaching session",
    when: "Tuesday 12 May 2026, 10:00",
    byCustomer: true,
    name: "Ada",
  }

  test("renders the subject and the customer's own cancellation", async () => {
    const mail = await emails.bookingCancelled(props)
    expect(mail.subject).toBe("Your booking is cancelled (BK-2044)")
    expect(bookingCancelledSubject("BK-2044")).toBe(mail.subject)
    expect(mail.text).toContain("Hi Ada,")
    expect(mail.text).toContain(
      "As requested, your coaching session on Tuesday 12 May 2026, 10:00 is cancelled."
    )
    expect(mail.text).not.toContain("Yasmina has had to cancel")
    expect(mail.text).toContain("Reply to this email to find a new time.")
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("byCustomer false switches to Yasmina's cancellation", async () => {
    const mail = await emails.bookingCancelled({ ...props, byCustomer: false })
    expect(mail.text).toContain(
      "Yasmina has had to cancel your coaching session on Tuesday 12 May 2026, 10:00. She is sorry for the trouble."
    )
    expect(mail.text).not.toContain("As requested")
  })

  test("renders the admin's note as its own escaped paragraph when given", async () => {
    const mail = await emails.bookingCancelled({
      ...props,
      byCustomer: false,
      note: "Yasmina is unwell <script>alert(1)</script>",
    })
    expect(mail.text).toContain("Yasmina is unwell <script>alert(1)</script>")
    expect(mail.html).not.toContain("<script>")
    expect(mail.html).toContain("&lt;script&gt;")
  })
})

describe("bookingNew", () => {
  const props = {
    reference: "BK-2045",
    offeringLabel: "Leadership workshop",
    kind: "group" as const,
    name: "Ada Lovelace",
    email: "ada@example.com",
    organisation: "Analytical Engines AB",
    phone: "+46 70 123 45 67",
    audience: "organisation" as const,
    location: "On site",
    when: "Tuesday 12 May 2026, 09:00",
    extraSessions: ["Tuesday 19 May 2026, 09:00"],
    preferredDates: ["Week 22", "Week 23"],
    attendees: 12,
    venue: "Our office in Stockholm",
    message: "We would like a focus on feedback.\n\nThanks!",
    adminUrl: "https://auth.example.com/admin/bookings/BK-2045",
  }

  test("renders the subject, every provided field and the admin link", async () => {
    const mail = await emails.bookingNew(props)
    expect(mail.subject).toBe("New booking: Leadership workshop (BK-2045)")
    expect(bookingNewSubject("BK-2045", "Leadership workshop", "group")).toBe(mail.subject)
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain("BK-2045")
      expect(part).toContain("Leadership workshop")
      expect(part).toContain("Ada Lovelace")
      expect(part).toContain("ada@example.com")
      expect(part).toContain("Analytical Engines AB")
      expect(part).toContain("+46 70 123 45 67")
      expect(part).toContain("On site")
      expect(part).toContain("Tuesday 12 May 2026, 09:00")
      expect(part).toContain("Tuesday 19 May 2026, 09:00")
      expect(part).toContain("Week 22")
      expect(part).toContain("Week 23")
      expect(part).toContain("12")
      expect(part).toContain("Our office in Stockholm")
      expect(part).toContain("We would like a focus on feedback.")
      expect(part).toContain(props.adminUrl)
    }
    expect(mail.text).toContain("Audience: Organisation")
    expect(mail.text).toContain("Attendees: 12")
    expect(mail.text).toContain("Further sessions:")
    expect(mail.text).toContain("Proposed dates:")
    expect(mail.text).toContain("Open in admin")
    expect(mail.html).toContain("white-space:pre-wrap")
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("a request gets the request subject and heading, instant the booking one", async () => {
    const request = await emails.bookingNew({ ...props, kind: "request" })
    expect(request.subject).toBe("New request: Leadership workshop (BK-2045)")
    expect(bookingNewSubject("BK-2045", "Leadership workshop", "request")).toBe(request.subject)
    expect(request.text).toMatch(/NEW REQUEST/)
    const instant = await emails.bookingNew({ ...props, kind: "instant" })
    expect(instant.subject).toBe("New booking: Leadership workshop (BK-2045)")
    expect(bookingNewSubject("BK-2045", "Leadership workshop", "instant")).toBe(instant.subject)
  })

  test("omits the optional fields that are not given", async () => {
    const mail = await emails.bookingNew({
      reference: "BK-2046",
      offeringLabel: "Coaching session",
      kind: "instant",
      name: "Ada",
      email: "ada@example.com",
      audience: "private",
      location: "Online",
      adminUrl: props.adminUrl,
    })
    expect(mail.text).toContain("Audience: Private individual")
    expect(mail.text).toContain("Location: Online")
    for (const label of [
      "Organisation:",
      "Phone:",
      "When:",
      "Further sessions:",
      "Proposed dates:",
      "Attendees:",
      "Venue:",
      "Message:",
    ]) {
      expect(mail.text).not.toContain(label)
    }
    const emptyLists = await emails.bookingNew({
      ...props,
      extraSessions: [],
      preferredDates: [],
    })
    expect(emptyLists.text).not.toContain("Further sessions:")
    expect(emptyLists.text).not.toContain("Proposed dates:")
  })

  test("a <script> in a customer field is escaped in html and verbatim in text", async () => {
    const mail = await emails.bookingNew({
      ...props,
      name: "Ada <script>alert(1)</script>",
      message: "Hello <b>there</b>",
    })
    expect(mail.html).not.toContain("<script>")
    expect(mail.html).toContain("&lt;script&gt;")
    expect(mail.html).toContain("&lt;b&gt;there&lt;/b&gt;")
    expect(mail.text).toContain("Ada <script>alert(1)</script>")
    expect(mail.text).toContain("Hello <b>there</b>")
  })
})

describe("jobApplication", () => {
  const props = {
    reference: "app_123",
    title: "Senior Engineer",
    name: "Ada Lovelace",
    email: "ada@example.com",
    link: "https://github.com/ada",
    note: "Excited to work on this role.",
    adminUrl: "https://auth.example.com/admin/applications/app_123",
  }

  test("renders the subject, reference, role, from, link, note and admin link", async () => {
    const mail = await emails.jobApplication(props)
    expect(mail.subject).toBe("New application app_123: Senior Engineer")
    expect(jobApplicationSubject("app_123", "Senior Engineer")).toBe(mail.subject)
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain("app_123")
      expect(part).toContain("Senior Engineer")
      expect(part).toContain("Ada Lovelace")
      expect(part).toContain("ada@example.com")
      expect(part).toContain("https://github.com/ada")
      expect(part).toContain("Excited to work on this role.")
      expect(part).toContain(props.adminUrl)
    }
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("omits the link line when no link is given", async () => {
    const mail = await emails.jobApplication({ ...props, link: undefined })
    expect(mail.text).not.toContain("github.com/ada")
  })

  test("omits the note lines when no note is given", async () => {
    const mail = await emails.jobApplication({ ...props, note: undefined })
    expect(mail.text).not.toContain("Excited to work on this role.")
  })

  test("the link is shown as text, not a clickable href", async () => {
    const mail = await emails.jobApplication(props)
    expect(mail.html).not.toContain(`href="${props.link}"`)
    expect(mail.html).toContain(props.link)
  })

  test("a <script> in the note is escaped in html and verbatim in text", async () => {
    const mail = await emails.jobApplication({
      ...props,
      note: "Hello <script>alert(1)</script> there",
    })
    expect(mail.html).not.toContain("<script>")
    expect(mail.html).toContain("&lt;script&gt;")
    expect(mail.text).toContain("<script>alert(1)</script>")
  })

  test("a <script> in the name is escaped in html and verbatim in text", async () => {
    const mail = await emails.jobApplication({
      ...props,
      name: "Hello <script>alert(1)</script> there",
    })
    expect(mail.html).not.toContain("<script>")
    expect(mail.html).toContain("&lt;script&gt;")
    expect(mail.text).toContain("<script>alert(1)</script>")
  })

  test("a <script> in the email is escaped in html and verbatim in text", async () => {
    const mail = await emails.jobApplication({
      ...props,
      email: "Hello <script>alert(1)</script> there",
    })
    expect(mail.html).not.toContain("<script>")
    expect(mail.html).toContain("&lt;script&gt;")
    expect(mail.text).toContain("<script>alert(1)</script>")
  })

  test("a <script> in the link is escaped in html and verbatim in text", async () => {
    const mail = await emails.jobApplication({
      ...props,
      link: "Hello <script>alert(1)</script> there",
    })
    expect(mail.html).not.toContain("<script>")
    expect(mail.html).toContain("&lt;script&gt;")
    expect(mail.text).toContain("<script>alert(1)</script>")
  })

  test("preserves line breaks in the html render via white-space: pre-wrap", async () => {
    const mail = await emails.jobApplication({ ...props, note: "line one\nline two" })
    expect(mail.html).toContain("white-space:pre-wrap")
    expect(mail.html).toContain("line one\nline two")
  })
})

describe("jobApplicationReceived", () => {
  test("renders the subject, the reference, the title and a generic greeting, nothing the applicant typed", async () => {
    const mail = await emails.jobApplicationReceived({
      reference: "APP-123",
      title: "Senior Engineer",
    })
    expect(mail.subject).toBe("We've received your application (APP-123)")
    expect(jobApplicationReceivedSubject("APP-123")).toBe(mail.subject)
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain("APP-123")
      expect(part).toContain("Senior Engineer")
    }
    expect(mail.text).toContain("Hi,")
    expect(mail.text).toMatch(/thanks for applying for Senior Engineer/i)
    expect(mail.text).toMatch(/we'll be in touch/i)
    expect(mail.text).toMatch(/6 months/i)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("its props carry no name, note or link (the recipient is any typed address)", async () => {
    const mail = await emails.jobApplicationReceived({
      reference: "APP-1",
      title: "Senior Engineer",
      // @ts-expect-error: the confirmation must not accept the applicant's free text
      note: "Visit evil.example",
    })
    expect(mail.text).not.toContain("evil.example")
  })
})

describe("emailChangeConfirm", () => {
  test("renders the subject, the 24-hour notice and the link in html and text", async () => {
    const mail = await emails.emailChangeConfirm({ name: "Ada", link })
    expect(mail.subject).toBe("Confirm your new email address")
    expect(emailChangeConfirmSubject).toBe("Confirm your new email address")
    expect(mail.html).toContain(link)
    expect(mail.text).toContain(link)
    expect(mail.text).toMatch(/24 hours/)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })
})

describe("emailChangeRequested", () => {
  test("renders the subject, the masked new address and the cancel link, never the full address", async () => {
    const mail = await emails.emailChangeRequested({
      name: "Ada",
      maskedEmail: "n***@example.com",
      link,
    })
    expect(mail.subject).toBe("Your email address is changing")
    expect(emailChangeRequestedSubject).toBe("Your email address is changing")
    expect(mail.html).toContain(link)
    expect(mail.text).toContain(link)
    expect(mail.text).toContain("n***@example.com")
    expect(mail.text).not.toContain("newaddress@example.com")
    expect(mail.text).toMatch(/cancel/i)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })
})

describe("emailChanged", () => {
  test("renders the subject, the masked new address, the 7-day undo link, never the full address", async () => {
    const mail = await emails.emailChanged({
      name: "Ada",
      maskedEmail: "n***@example.com",
      link,
    })
    expect(mail.subject).toBe("Your email address was changed")
    expect(emailChangedSubject).toBe("Your email address was changed")
    expect(mail.html).toContain(link)
    expect(mail.text).toContain(link)
    expect(mail.text).toContain("n***@example.com")
    expect(mail.text).not.toContain("newaddress@example.com")
    expect(mail.text).toMatch(/7 days/)
    expect(mail.text).toMatch(/wasn't me/i)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })
})

describe("emailChangeReverted", () => {
  test("renders the subject, says every session ended and points to support", async () => {
    const mail = await emails.emailChangeReverted({ name: "Ada" })
    expect(mail.subject).toBe("Your email change was undone")
    expect(emailChangeRevertedSubject).toBe("Your email change was undone")
    expect(mail.text).toMatch(/every session was ended/)
    expect(mail.text).toContain("If you still can't get in, contact support.")
    expect(mail.text).toContain(
      "Review your connected sign-in providers and two-step verification in your account's Security settings."
    )
    // Nothing else was rolled back: no line claims otherwise.
    expect(mail.text).not.toMatch(/passkey|disconnected|turned off|deletion/)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("lists what was rolled back, each only when it happened", async () => {
    const mail = await emails.emailChangeReverted({
      passkeysRemoved: 2,
      identitiesRemoved: 1,
      twoFactorDisabled: true,
      deletionCancelled: true,
    })
    expect(mail.text).toContain("2 passkeys were removed.")
    expect(mail.text).toContain("1 sign-in provider connected since the change was disconnected.")
    expect(mail.text).toContain(
      "Two-step verification, turned on since the change, was turned off."
    )
    expect(mail.text).toContain("The account deletion requested since the change was cancelled.")
    expect(mail.html).toContain("2 passkeys were removed.")
    const one = await emails.emailChangeReverted({ passkeysRemoved: 1, identitiesRemoved: 3 })
    expect(one.text).toContain("1 passkey was removed.")
    expect(one.text).toContain("3 sign-in providers connected since the change were disconnected.")
  })

  test("mentions the separate password-reset email only when the account has one", async () => {
    const withPassword = await emails.emailChangeReverted({ hasPassword: true })
    expect(withPassword.text).toContain("A separate email has a link to set a new password.")
    expect(withPassword.html).toContain("A separate email has a link to set a new password.")
    for (const props of [{ hasPassword: false }, {}]) {
      const mail = await emails.emailChangeReverted(props)
      expect(mail.text).not.toContain("password")
      expect(mail.html).not.toContain("password")
    }
  })
})

describe("webhookDisabled", () => {
  const props = {
    name: "Ada",
    workspaceName: "Acme Ops",
    host: "hooks.example.com:8443",
    failures: 5,
    link: "https://account.example.com/workspace",
  }

  test("after failures: names the host, the workspace and the count, and links to settings", async () => {
    const mail = await emails.webhookDisabled({ ...props, reason: "failures" })
    expect(mail.subject).toBe("A webhook endpoint was turned off")
    expect(webhookDisabledSubject).toBe(mail.subject)
    expect(mail.text).toContain("hooks.example.com:8443")
    expect(mail.text).toContain("Acme Ops")
    expect(mail.text).toMatch(/after 5 deliveries in a row failed/)
    expect(mail.text).toMatch(/not resent/)
    expect(mail.html).toContain(props.link)
    expect(mail.text).toContain(props.link)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("after a 410: says the endpoint asked to stop", async () => {
    const mail = await emails.webhookDisabled({ ...props, reason: "gone" })
    expect(mail.text).toMatch(/410 Gone/)
    expect(mail.text).not.toMatch(/in a row failed/)
  })

  test("in Swedish", async () => {
    const mail = await emails.webhookDisabled({ ...props, reason: "failures" }, "sv")
    expect(mail.subject).toBe(sv("webhookDisabled.subject"))
    expect(mail.subject).not.toBe(webhookDisabledSubject)
    expect(mail.text).toMatch(/efter att 5 leveranser i rad misslyckades/)
    const gone = await emails.webhookDisabled({ ...props, reason: "gone" }, "sv")
    expect(gone.text).toMatch(/svarade 410 Gone/)
  })
})

describe("workspaceTwoFactorRequired", () => {
  const props = {
    name: "Ada",
    workspaceName: "Acme Ops",
    link: "https://account.example.com/security",
  }

  test("names the workspace, says what satisfies it and links to the Security page", async () => {
    const mail = await emails.workspaceTwoFactorRequired(props)
    expect(mail.subject).toBe("Two-step verification is now required")
    expect(workspaceTwoFactorRequiredSubject).toBe(mail.subject)
    expect(mail.text).toContain("Ada")
    expect(mail.text).toContain("Acme Ops now requires every member")
    expect(mail.text).toMatch(/two-step verification or a passkey/)
    expect(mail.text).toMatch(/You stay a member/)
    expect(mail.html).toContain(props.link)
    expect(mail.text).toContain(props.link)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("escapes HTML in the workspace name", async () => {
    const mail = await emails.workspaceTwoFactorRequired({
      ...props,
      workspaceName: "<b>Acme</b>",
    })
    expect(mail.html).not.toContain("<b>Acme</b>")
    expect(mail.html).toContain("&lt;b&gt;Acme&lt;/b&gt;")
  })

  test("in Swedish", async () => {
    const mail = await emails.workspaceTwoFactorRequired(props, "sv")
    expect(mail.subject).toBe(sv("workspaceTwoFactorRequired.subject"))
    expect(mail.subject).not.toBe(workspaceTwoFactorRequiredSubject)
    expect(mail.text).toContain("Acme Ops kräver nu att alla medlemmar")
    expect(mail.text).toContain(props.link)
  })
})

describe("the optional notification mails", () => {
  const links = {
    inboxUrl: "https://account.example.com/notifications",
    unsubscribeUrl: "https://auth.example.com/email/unsubscribe?token=abc.def",
  }
  const cases = [
    {
      name: "roleChanged",
      render: (locale?: "sv") =>
        emails.roleChanged(
          { name: "Ada", workspaceName: "Acme Ops", role: "admin", ...links },
          locale
        ),
      subject: roleChangedSubject("Acme Ops"),
      body: "Your role in Acme Ops is now admin.",
      sv: "Din roll i Acme Ops är nu administratör.",
    },
    {
      name: "removedFromWorkspace",
      render: (locale?: "sv") =>
        emails.removedFromWorkspace({ name: "Ada", workspaceName: "Acme Ops", ...links }, locale),
      subject: removedFromWorkspaceSubject("Acme Ops"),
      body: "You are no longer a member of Acme Ops",
      sv: "Du är inte längre medlem i Acme Ops",
    },
    {
      name: "planChanged",
      render: (locale?: "sv") =>
        emails.planChanged(
          { name: "Ada", workspaceName: "Acme Ops", plan: "team", ...links },
          locale
        ),
      subject: planChangedSubject("Acme Ops", "team"),
      body: "Acme Ops is now on the Team plan.",
      sv: "Acme Ops har nu planen Team.",
    },
  ]

  for (const c of cases) {
    test(`${c.name}: names the workspace, links to the inbox and to turning these emails off`, async () => {
      const mail = await c.render()
      expect(mail.subject).toBe(c.subject)
      expect(mail.text).toContain("Ada")
      expect(mail.text).toContain(c.body)
      expect(mail.text).toContain(links.inboxUrl)
      expect(mail.html).toContain(links.inboxUrl)
      // The visible unsubscribe link (RFC 8058 still wants one in the body).
      expect(mail.text).toContain("Turn off these emails")
      expect(mail.html).toContain(links.unsubscribeUrl)
      expect(mail.text).toContain(links.unsubscribeUrl)
      // No address of anyone: the props hold none, and nothing renders one.
      expect(mail.text).not.toMatch(/[^\s@]+@[^\s@]+\.[a-z]{2,}/i)
      expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
    })

    test(`${c.name}: in Swedish`, async () => {
      const mail = await c.render("sv")
      expect(mail.subject).not.toBe(c.subject)
      expect(mail.text).toContain(c.sv)
      expect(mail.text).toContain(sv("notificationEmail.turnOff"))
      expect(mail.html).toContain(links.unsubscribeUrl)
    })
  }

  test("the Swedish subjects translate the role and plan names too", async () => {
    const plan = await emails.planChanged(
      { workspaceName: "Acme Ops", plan: "pro", ...links },
      "sv"
    )
    expect(plan.subject).toBe("Acme Ops har nu planen Pro")
    const role = await emails.roleChanged(
      { workspaceName: "Acme Ops", role: "viewer", ...links },
      "sv"
    )
    expect(role.subject).toBe("Din roll i Acme Ops har ändrats")
    expect(role.text).toContain("läsare")
  })

  test("escapes HTML in the workspace name", async () => {
    const mail = await emails.removedFromWorkspace({ workspaceName: "<b>Acme</b>", ...links })
    expect(mail.html).not.toContain("<b>Acme</b>")
    expect(mail.html).toContain("&lt;b&gt;Acme&lt;/b&gt;")
  })
})

// Every template, called the same way as the fixture was captured (default locale, no second
// argument): the English render must stay byte-for-byte what it was before this task touched any
// template, html and text alike. The fixture is committed at ./__fixtures__/english-snapshots.json.
describe("English render is byte-for-byte unchanged", () => {
  const invite = "https://app.example.com/invitations/abc"
  const cases: Record<string, () => ReturnType<(typeof emails)["verifyEmail"]>> = {
    verifyEmail: () => emails.verifyEmail({ name: "Ada", link }),
    resetPassword: () => emails.resetPassword({ name: "Ada", link }),
    passwordChanged: () =>
      emails.passwordChanged({
        name: "Ada",
        at: "2026-10-01T18:00:00.000Z",
        accountUrl: "https://account.example.com/security",
        resetUrl: "https://auth.example.com/forgot-password",
      }),
    magicLink: () => emails.magicLink({ link: "https://auth.example.com/magic?token=abc" }),
    accountReset: () =>
      emails.accountReset({ name: "Ada", accountUrl: "https://account.example.com" }),
    waitlistWelcome: () => emails.waitlistWelcome({ siteUrl: "https://www.example.com" }),
    invitation: () =>
      emails.invitation({
        workspaceName: "Acme Ops",
        inviterName: "Ada",
        role: "member",
        link: invite,
      }),
    twoFactorEnabled: () =>
      emails.twoFactorEnabled({ name: "Ada", accountUrl: "https://account.example.com" }),
    twoFactorDisabled: () =>
      emails.twoFactorDisabled({ name: "Ada", accountUrl: "https://account.example.com" }),
    twoFactorReset: () =>
      emails.twoFactorReset({ name: "Ada", accountUrl: "https://account.example.com" }),
  }

  for (const [name, render] of Object.entries(cases)) {
    test(`${name} matches its committed English snapshot`, async () => {
      const mail = await render()
      const expected = (englishSnapshots as Record<string, typeof mail>)[name]
      if (!expected) throw new Error(`no fixture for ${name}`)
      expect(mail.subject).toBe(expected.subject)
      expect(mail.html).toBe(expected.html)
      expect(mail.text).toBe(expected.text)
    })
  }
})

describe("Swedish rendering", () => {
  test("verifyEmail: Swedish subject and body, link still present", async () => {
    const mail = await emails.verifyEmail({ name: "Ada", link }, "sv")
    expect(mail.subject).toBe(sv("verifyEmail.subject"))
    expect(mail.subject).not.toBe("Verify your email")
    expect(mail.html).toContain(link)
    expect(mail.text).toContain(link)
    expect(mail.text).toMatch(/VÄLKOMMEN, ADA/)
  })

  test("resetPassword: Swedish subject and body, link still present", async () => {
    const mail = await emails.resetPassword({ name: "Ada", link }, "sv")
    expect(mail.subject).toBe(sv("resetPassword.subject"))
    expect(mail.html).toContain(link)
    expect(mail.text).toContain(link)
    expect(mail.text).toMatch(/ÅTERSTÄLL DITT LÖSENORD/)
  })

  test("passwordChanged: Swedish subject and body, both links still present", async () => {
    const mail = await emails.passwordChanged(
      {
        name: "Ada",
        at: "2026-10-01T18:00:00.000Z",
        accountUrl: "https://account.example.com/security",
        resetUrl: "https://auth.example.com/forgot-password",
      },
      "sv"
    )
    expect(mail.subject).toBe(sv("passwordChanged.subject"))
    expect(mail.html).toContain("https://account.example.com/security")
    expect(mail.html).toContain("https://auth.example.com/forgot-password")
    // Swedish formats the date itself (unlike English's literal toUTCString()); the explicit
    // "UTC" suffix is needed since Intl's `timeZone: "UTC"` option does not label the zone.
    expect(mail.text).not.toContain("Thu, 01 Oct 2026 18:00:00 GMT")
    expect(mail.text).toContain("1 oktober 2026 18:00 UTC")
    expect(mail.text).toMatch(/Lösenordet för ditt konto ändrades den/)
  })

  test("magicLink: Swedish subject and body, the 15-minute value substitutes correctly", async () => {
    const magic = "https://auth.example.com/magic?token=abc"
    const mail = await emails.magicLink({ link: magic }, "sv")
    expect(mail.subject).toBe(sv("magicLink.subject"))
    expect(mail.html).toContain(magic)
    expect(mail.text).toContain(magic)
    expect(mail.text).toContain(sv("magicLink.body", { minutes: 15 }))
  })

  test("accountReset: Swedish subject and body, link still present", async () => {
    const mail = await emails.accountReset(
      { name: "Ada", accountUrl: "https://account.example.com" },
      "sv"
    )
    expect(mail.subject).toBe(sv("accountReset.subject"))
    expect(mail.html).toContain("https://account.example.com/security")
    expect(mail.text).toContain("https://account.example.com/security")
  })

  test("waitlistWelcome: Swedish subject and body, link still present", async () => {
    const site = "https://www.example.com"
    const mail = await emails.waitlistWelcome({ siteUrl: site }, "sv")
    expect(mail.subject).toBe(sv("waitlistWelcome.subject"))
    expect(mail.html).toContain(site)
    expect(mail.text).toContain(site)
  })

  test("invitation: Swedish subject and body, the inviter and workspace substitute correctly", async () => {
    const invite = "https://app.example.com/invitations/abc"
    const mail = await emails.invitation(
      { workspaceName: "Acme Ops", inviterName: "Ada", role: "member", link: invite },
      "sv"
    )
    expect(mail.subject).toBe(sv("invitation.subject", { workspace: "Acme Ops" }))
    expect(mail.subject).toContain("Acme Ops")
    expect(mail.html).toContain(invite)
    expect(mail.text).toContain(invite)
    expect(mail.text).toContain("Ada")
    expect(mail.text).toContain("Acme Ops")
    expect(mail.text).toMatch(/7 dagar/)
    // The role name is translated too (an ICU select), not left as the raw English identifier.
    expect(mail.text).toContain("medlem")
    expect(mail.text).not.toContain("as a member")
  })

  test("invitation: the Swedish role select covers admin, viewer and owner too", async () => {
    const invite = "https://app.example.com/invitations/abc"
    const props = { workspaceName: "Acme Ops", inviterName: "Ada", link: invite }
    const admin = await emails.invitation({ ...props, role: "admin" }, "sv")
    expect(admin.text).toContain("administratör")
    const viewer = await emails.invitation({ ...props, role: "viewer" }, "sv")
    expect(viewer.text).toContain("läsare")
    const owner = await emails.invitation({ ...props, role: "owner" }, "sv")
    expect(owner.text).toContain("ägare")
  })

  test("twoFactorEnabled: Swedish subject and body, link still present", async () => {
    const mail = await emails.twoFactorEnabled(
      { name: "Ada", accountUrl: "https://account.example.com" },
      "sv"
    )
    expect(mail.subject).toBe(sv("twoFactorEnabled.subject"))
    expect(mail.html).toContain("https://account.example.com/security")
  })

  test("twoFactorDisabled: Swedish subject and body, link still present", async () => {
    const mail = await emails.twoFactorDisabled(
      { name: "Ada", accountUrl: "https://account.example.com" },
      "sv"
    )
    expect(mail.subject).toBe(sv("twoFactorDisabled.subject"))
    expect(mail.html).toContain("https://account.example.com/security")
  })

  test("twoFactorReset: Swedish subject and body, link still present", async () => {
    const mail = await emails.twoFactorReset(
      { name: "Ada", accountUrl: "https://account.example.com" },
      "sv"
    )
    expect(mail.subject).toBe(sv("twoFactorReset.subject"))
    expect(mail.html).toContain("https://account.example.com/security")
  })

  test("passkeyAdded: Swedish subject, the loanword and the security link", async () => {
    const mail = await emails.passkeyAdded(
      { name: "Ada", passkeyName: "This device", accountUrl: "https://account.example.com" },
      "sv"
    )
    expect(mail.subject).toBe(sv("passkeyAdded.subject"))
    expect(mail.subject).not.toBe("A new passkey was added to your account")
    expect(mail.text.toLowerCase()).toContain("passkey")
    expect(mail.text).toContain("This device")
    expect(mail.html).toContain("https://account.example.com/security")
  })

  test("passkeyRemoved: Swedish subject, the loanword and the security link", async () => {
    const mail = await emails.passkeyRemoved(
      { name: "Ada", passkeyName: "Security key", accountUrl: "https://account.example.com" },
      "sv"
    )
    expect(mail.subject).toBe(sv("passkeyRemoved.subject"))
    expect(mail.subject).not.toBe("A passkey was removed from your account")
    expect(mail.text.toLowerCase()).toContain("passkey")
    expect(mail.text).toContain("Security key")
    expect(mail.html).toContain("https://account.example.com/security")
  })

  test("passkeysRemoved: Swedish subject, the loanword and the security link", async () => {
    const mail = await emails.passkeysRemoved(
      { name: "Ada", accountUrl: "https://account.example.com" },
      "sv"
    )
    expect(mail.subject).toBe(sv("passkeysRemoved.subject"))
    expect(mail.subject).not.toBe("Your passkeys were removed")
    expect(mail.text).toContain("passkeys")
    expect(mail.html).toContain("https://account.example.com/security")
    expect(mail.text).not.toContain(sv("passkeysRemoved.passwordUnchanged"))
    const withPassword = await emails.passkeysRemoved(
      { accountUrl: "https://account.example.com", hasPassword: true },
      "sv"
    )
    expect(withPassword.text).toContain(sv("passkeysRemoved.passwordUnchanged"))
  })

  test("dataExportReady: Swedish subject and body, link still present", async () => {
    const mail = await emails.dataExportReady({ name: "Ada", link }, "sv")
    expect(mail.subject).toBe(sv("dataExportReady.subject"))
    expect(mail.subject).not.toBe("Your data export is ready")
    expect(mail.html).toContain(link)
    expect(mail.text).toContain(link)
    expect(mail.text).toMatch(/Data och integritet/)
    expect(mail.text).toMatch(/7 dagar/)
  })

  test("accountDeletionScheduled: Swedish subject and body, the date is built by hand", async () => {
    const deletionLink = "https://app.example.com/workspaces/new"
    const mail = await emails.accountDeletionScheduled(
      { name: "Ada", date: "2026-10-01T18:00:00.000Z", link: deletionLink },
      "sv"
    )
    expect(mail.subject).toBe(sv("accountDeletionScheduled.subject"))
    expect(mail.html).toContain(deletionLink)
    expect(mail.text).toContain(deletionLink)
    // Swedish formats the date itself, by hand, the same way passwordChanged does
    // (formatUtcDate's abbreviated month table, not the long form).
    expect(mail.text).not.toContain("Oct 1, 2026")
    expect(mail.text).toContain("1 okt. 2026")
    expect(mail.text).toMatch(/Logga in innan dess för att avbryta/)
  })

  test("accountDeleted: Swedish subject and body", async () => {
    const mail = await emails.accountDeleted({ name: "Ada" }, "sv")
    expect(mail.subject).toBe(sv("accountDeleted.subject"))
    expect(mail.subject).not.toBe("Your account has been deleted")
    expect(mail.text).toMatch(/”Borttagen användare”/)
  })

  test("accountSuspended: Swedish subject, indefinite and timed bodies", async () => {
    const indefinite = await emails.accountSuspended({ name: "Ada", until: null }, "sv")
    expect(indefinite.subject).toBe(sv("accountSuspended.subject"))
    expect(indefinite.subject).not.toBe("Your account has been suspended")
    expect(indefinite.text).toMatch(/kommer inte att kunna logga in/)

    const timed = await emails.accountSuspended(
      { name: "Ada", until: "2026-10-01T18:00:00.000Z" },
      "sv"
    )
    // Swedish formats the date by hand, like accountDeletionScheduled's.
    expect(timed.text).not.toContain("Oct 1, 2026")
    expect(timed.text).toContain("1 okt. 2026")
    expect(timed.text).toMatch(/Kontakta supporten/i)
  })

  test("accountUnsuspended: Swedish subject and body", async () => {
    const mail = await emails.accountUnsuspended({ name: "Ada" }, "sv")
    expect(mail.subject).toBe(sv("accountUnsuspended.subject"))
    expect(mail.subject).not.toBe("Your account is no longer suspended")
    expect(mail.text).toMatch(/inte längre avstängt/)
  })

  test("supportRequest: Swedish subject and body, reference and topic still present", async () => {
    const props = {
      reference: "req_123",
      topic: "Billing",
      email: "ada@example.com",
      name: "Ada",
      message: "My invoice looks wrong.",
      adminUrl: "https://auth.example.com/admin/support/req_123",
    }
    const mail = await emails.supportRequest(props, "sv")
    expect(mail.subject).toBe(
      sv("supportRequest.subject", { reference: "req_123", topic: "Billing" })
    )
    expect(mail.subject).toContain("req_123")
    expect(mail.subject).toContain("Billing")
    expect(mail.html).toContain(props.adminUrl)
    expect(mail.text).toContain(props.adminUrl)
    expect(mail.text).toContain("Ada")
  })

  test("supportReceived: Swedish subject and body, with the reference", async () => {
    const mail = await emails.supportReceived({ reference: "HELP-123" }, "sv")
    expect(mail.subject).toBe(sv("supportReceived.subject", { reference: "HELP-123" }))
    expect(mail.subject).toContain("HELP-123")
    expect(mail.text).toContain(sv("supportReceived.body", { reference: "HELP-123" }))
  })

  test("bookingConfirmed: Swedish subject and body, link and dates still present", async () => {
    const manageUrl = "https://www.example.com/bookings/BK-2041?token=abc"
    const mail = await emails.bookingConfirmed(
      {
        reference: "BK-2041",
        offeringLabel: "coachingsession",
        when: "tisdag 12 maj 2026 kl. 10.00",
        where: "online",
        manageUrl,
        name: "Ada",
        extraSessions: ["tisdag 19 maj 2026 kl. 10.00"],
        cancelCutoffHours: 24,
      },
      "sv"
    )
    expect(mail.subject).toBe(sv("bookingConfirmed.subject", { reference: "BK-2041" }))
    expect(mail.subject).not.toBe("Your booking is confirmed (BK-2041)")
    expect(mail.subject).toContain("BK-2041")
    expect(mail.text).toContain("Hej Ada,")
    expect(mail.text).toContain(
      sv("bookingConfirmed.body", {
        offeringLabel: "coachingsession",
        when: "tisdag 12 maj 2026 kl. 10.00",
        where: "online",
      })
    )
    expect(mail.text).toMatch(/Ytterligare tillfällen/i)
    expect(mail.text).toContain("tisdag 19 maj 2026 kl. 10.00")
    expect(mail.text).toContain(sv("bookingConfirmed.footer", { hours: 24 }))
    expect(mail.text).toContain(manageUrl)
  })

  test("bookingRequestReceived: Swedish subject and body, link still present", async () => {
    const manageUrl = "https://www.example.com/bookings/BK-2042?token=abc"
    const mail = await emails.bookingRequestReceived(
      { reference: "BK-2042", offeringLabel: "ledarskapsprogram", manageUrl },
      "sv"
    )
    expect(mail.subject).toBe(sv("bookingRequestReceived.subject", { reference: "BK-2042" }))
    expect(mail.subject).not.toBe("We've received your request (BK-2042)")
    expect(mail.text).toContain(
      sv("bookingRequestReceived.body", { offeringLabel: "ledarskapsprogram" })
    )
    expect(mail.text).toContain(manageUrl)
  })

  test("bookingDeclined: Swedish subject and body, note still present", async () => {
    const mail = await emails.bookingDeclined(
      { reference: "BK-2043", offeringLabel: "workshop", note: "Maj är fullbokad." },
      "sv"
    )
    expect(mail.subject).toBe(sv("bookingDeclined.subject", { reference: "BK-2043" }))
    expect(mail.subject).not.toBe("About your request (BK-2043)")
    expect(mail.text).toContain(sv("bookingDeclined.body", { offeringLabel: "workshop" }))
    expect(mail.text).toContain("Maj är fullbokad.")
    expect(mail.text).toContain(sv("bookingDeclined.footer"))
  })

  test("bookingCancelled: Swedish subject and both wordings", async () => {
    const props = {
      reference: "BK-2044",
      offeringLabel: "coachingsession",
      when: "tisdag 12 maj 2026 kl. 10.00",
    }
    const byCustomer = await emails.bookingCancelled({ ...props, byCustomer: true }, "sv")
    expect(byCustomer.subject).toBe(sv("bookingCancelled.subject", { reference: "BK-2044" }))
    expect(byCustomer.subject).not.toBe("Your booking is cancelled (BK-2044)")
    expect(byCustomer.text).toContain(sv("bookingCancelled.bodyByCustomer", props))
    const byYasmina = await emails.bookingCancelled({ ...props, byCustomer: false }, "sv")
    expect(byYasmina.text).toContain(sv("bookingCancelled.bodyByYasmina", props))
    expect(byYasmina.text).not.toContain(sv("bookingCancelled.bodyByCustomer", props))
  })

  test("bookingNew: Swedish subject per kind, fields and admin link still present", async () => {
    const props = {
      reference: "BK-2045",
      offeringLabel: "Ledarskapsworkshop",
      kind: "request" as const,
      name: "Ada Lovelace",
      email: "ada@example.com",
      audience: "organisation" as const,
      location: "På plats",
      preferredDates: ["Vecka 22"],
      adminUrl: "https://auth.example.com/admin/bookings/BK-2045",
    }
    const mail = await emails.bookingNew(props, "sv")
    expect(mail.subject).toBe(
      sv("bookingNew.subject", {
        reference: "BK-2045",
        offeringLabel: "Ledarskapsworkshop",
        kind: "request",
      })
    )
    expect(mail.subject).not.toBe("New request: Ledarskapsworkshop (BK-2045)")
    expect(mail.subject).toContain("BK-2045")
    expect(mail.text).toContain("Ada Lovelace")
    expect(mail.text).toContain("ada@example.com")
    expect(mail.text).toContain("Vecka 22")
    expect(mail.text).toContain(props.adminUrl)
    const booking = await emails.bookingNew({ ...props, kind: "instant" }, "sv")
    expect(booking.subject).not.toBe(mail.subject)
  })

  test("jobApplication: Swedish subject and body, reference and role still present", async () => {
    const props = {
      reference: "app_123",
      title: "Senior Engineer",
      name: "Ada Lovelace",
      email: "ada@example.com",
      adminUrl: "https://auth.example.com/admin/applications/app_123",
    }
    const mail = await emails.jobApplication(props, "sv")
    expect(mail.subject).toBe(
      sv("jobApplication.subject", { reference: "app_123", title: "Senior Engineer" })
    )
    expect(mail.subject).toContain("app_123")
    expect(mail.subject).toContain("Senior Engineer")
    expect(mail.html).toContain(props.adminUrl)
    expect(mail.text).toContain(props.adminUrl)
    expect(mail.text).toContain("Ada Lovelace")
    expect(mail.text).toContain(sv("jobApplication.button"))
  })

  test("jobApplicationReceived: Swedish subject and body, with the reference and title", async () => {
    const mail = await emails.jobApplicationReceived(
      { reference: "APP-123", title: "Senior Engineer" },
      "sv"
    )
    expect(mail.subject).toBe(sv("jobApplicationReceived.subject", { reference: "APP-123" }))
    expect(mail.subject).toContain("APP-123")
    expect(mail.text).toContain(
      sv("jobApplicationReceived.body", { reference: "APP-123", title: "Senior Engineer" })
    )
  })

  test("emailChangeConfirm: Swedish subject and body, link still present", async () => {
    const mail = await emails.emailChangeConfirm({ name: "Ada", link }, "sv")
    expect(mail.subject).toBe(sv("emailChangeConfirm.subject"))
    expect(mail.subject).not.toBe("Confirm your new email address")
    expect(mail.html).toContain(link)
    expect(mail.text).toContain(link)
  })

  test("emailChangeRequested: Swedish subject and body, the masked address substitutes correctly", async () => {
    const mail = await emails.emailChangeRequested(
      { name: "Ada", maskedEmail: "n***@example.com", link },
      "sv"
    )
    expect(mail.subject).toBe(sv("emailChangeRequested.subject"))
    expect(mail.subject).not.toBe("Your email address is changing")
    expect(mail.text).toContain("n***@example.com")
    expect(mail.text).not.toContain("newaddress@example.com")
    expect(mail.html).toContain(link)
  })

  test("emailChanged: Swedish subject and body, the masked address substitutes correctly", async () => {
    const mail = await emails.emailChanged(
      { name: "Ada", maskedEmail: "n***@example.com", link },
      "sv"
    )
    expect(mail.subject).toBe(sv("emailChanged.subject"))
    expect(mail.subject).not.toBe("Your email address was changed")
    expect(mail.text).toContain("n***@example.com")
    expect(mail.text).not.toContain("newaddress@example.com")
    expect(mail.html).toContain(link)
  })

  test("emailChangeReverted: Swedish subject, body and every rolled-back line", async () => {
    const mail = await emails.emailChangeReverted({ name: "Ada" }, "sv")
    expect(mail.subject).toBe(sv("emailChangeReverted.subject"))
    expect(mail.subject).not.toBe("Your email change was undone")
    expect(mail.text).toContain(sv("emailChangeReverted.support"))
    expect(mail.text).toContain(sv("emailChangeReverted.review"))
    const all = await emails.emailChangeReverted(
      {
        hasPassword: true,
        passkeysRemoved: 2,
        identitiesRemoved: 1,
        twoFactorDisabled: true,
        deletionCancelled: true,
      },
      "sv"
    )
    expect(all.text).toContain("2 passkeys har tagits bort.")
    expect(all.text).toContain(sv("emailChangeReverted.identities", { count: 1 }))
    expect(all.text).toContain(sv("emailChangeReverted.twoFactor"))
    expect(all.text).toContain(sv("emailChangeReverted.deletion"))
    expect(all.text).toContain(sv("emailChangeReverted.passwordNotice"))
  })

  test("defaulting to English when no locale is given matches explicit 'en'", async () => {
    const byDefault = await emails.verifyEmail({ name: "Ada", link })
    const explicit = await emails.verifyEmail({ name: "Ada", link }, "en")
    expect(byDefault).toEqual(explicit)
  })
})
