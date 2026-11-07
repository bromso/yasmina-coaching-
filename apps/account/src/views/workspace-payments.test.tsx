import { describe, expect, mock, test } from "bun:test"
import {
  type Billing,
  entitlementsFor,
  type Invitation,
  type Member,
  type WorkspaceSummary,
} from "@repo/api-contract"
import { accountTranslator, scoped } from "@/lib/i18n"
import { renderIn } from "@/test-intl"

// The views' forms import their server actions, which reach @repo/session (`server-only`).
mock.module("server-only", () => ({}))
const { WorkspaceView } = await import("./workspace-view")
const { PaymentsView, checkoutMessage } = await import("./payments-view")

const members = [
  {
    userId: 1,
    name: "Ada",
    email: "ada@example.com",
    role: "owner",
    joinedAt: "2026-01-02T00:00:00.000Z",
  },
  { userId: 2, name: "", email: null, role: "member", joinedAt: "2026-03-04T00:00:00.000Z" },
] as unknown as Member[]
const invitations: Invitation[] = [
  {
    id: 9,
    email: "g@example.com",
    role: "admin",
    invitedBy: { name: "" },
    expiresAt: "2026-05-08T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
]
const free = entitlementsFor({ subscription: null, memberCount: 3, portalAvailable: false })
const pro = entitlementsFor({
  subscription: {
    plan: "pro",
    interval: "year",
    status: "active",
    currentPeriodEnd: "2026-11-02T00:00:00.000Z",
    cancelAtPeriodEnd: false,
  },
  memberCount: 2,
  portalAvailable: true,
})
const workspace = (entitlements = free): WorkspaceSummary => ({
  id: 5,
  name: "Acme",
  slug: "acme",
  createdAt: "2026-01-01T00:00:00.000Z",
  role: "owner",
  memberCount: 2,
  entitlements,
  logoUrl: null,
  requireTwoFactor: false,
})
const workspaceView = (locale: "en" | "sv", role: "owner" | "viewer" = "owner") =>
  renderIn(
    locale,
    <WorkspaceView
      workspace={workspace()}
      role={role}
      // Three seats on Free, three used: the invite form says the workspace is full.
      entitlements={free}
      currentUserId={1}
      members={[...members, { ...members[1], userId: 3 } as Member]}
      invitations={role === "owner" ? invitations : undefined}
      locale={locale}
      apiKeysDocsUrl="https://docs.brand.localhost:3004"
      webhooksDocsUrl="https://docs.brand.localhost:3004"
    />
  )
const payments = (locale: "en" | "sv", billing: Billing, role: "owner" | "admin" = "owner") =>
  renderIn(
    locale,
    <PaymentsView workspace={workspace()} role={role} billing={billing} locale={locale} />
  )
const expectAll = (html: string, texts: string[]) => {
  for (const text of texts) expect(html).toContain(text)
}

describe("Workspace in Swedish", () => {
  test("an owner's page: details, members, invitations, the full notice, the danger zone", () => {
    expectAll(workspaceView("sv"), [
      ">Arbetsyta</h1>",
      "Personerna i Acme, vad de kan göra och vilka som är inbjudna.",
      ">Kortnamn</dt>",
      ">Du är ägare</dd>",
      ">Logotyp</div>",
      "Ändra vad varje medlem kan göra, eller ta bort medlemmar. 3 av 3 platser används.",
      ">Du</span>",
      "ada@example.com · Gick med 2 jan. 2026",
      ">Namnlös medlem</span>",
      ">Roll för Namnlös medlem</label>",
      '<option value="viewer">Läsare</option>',
      '<option value="admin">Administratör</option>',
      ">Spara roll</button>",
      ">Lämna</button>",
      ">Ägare</span>",
      "Administratör · Inbjuden av Någon · Går ut 8 maj 2026",
      ">Återkalla</button>",
      ">Skicka inbjudan</button>",
      // The seat limit is a catalog key, never the contract's English SEAT_LIMIT_MESSAGE.
      "Arbetsytan har nått gränsen för antal medlemmar. <a",
      ">Byt plan</a>",
      // Free plan: the API keys card shows the upsell, never the card itself.
      "API-åtkomst ingår i planerna Pro och Team.",
      ">Se planer</a>",
      ">Riskzon</div>",
      ">Överlåt ägarskapet</label>",
      'Skriv <span class="font-semibold">Acme</span> för att radera den här arbetsytan',
      ">Radera arbetsytan</button>",
    ])
  })

  test("below admin: read-only details and the logo note", () => {
    expectAll(workspaceView("sv", "viewer"), [
      ">Namn</dt>",
      ">Du är läsare</dd>",
      "Bara administratörer kan ändra logotypen.",
      "Alla som kan se den här arbetsytan. 3 av 3 platser används.",
      // Below admin: a short explanation, never the upsell or the list.
      "Administratörer kan skapa API-nycklar för att ansluta externa verktyg och skript till den här arbetsytan.",
    ])
    expect(workspaceView("sv", "viewer")).not.toContain("API-åtkomst ingår i planerna")
  })
})

describe("Payments in Swedish", () => {
  test("an owner on Stripe's Free plan: the picker with Swedish prices and features", () => {
    const html = payments("sv", { ...free, provider: "stripe" })
    expectAll(html, [
      ">Betalningar och abonnemang</h1>",
      "Planen som Acme har, dess platser och hur den faktureras.",
      ">Gratisplan</span>",
      ">Platser</dt>",
      "3 av 3 platser används",
      ">Byt plan</div>",
      "19\u00a0US$ per månad eller 190\u00a0US$ per år",
      // Feature labels are catalog keys, never the contract's English featureCopy.
      "Upp till 10 medlemmar · AI-chatt · API-åtkomst",
      "Obegränsat antal medlemmar · AI-chatt · API-åtkomst",
      ">Faktureringsintervall</legend>",
      "Månadsvis",
      ">Fortsätt till betalning</button>",
    ])
  })

  test("a paid plan: renewal date, interval, the billing portal; a non-owner is told to ask", () => {
    expectAll(payments("sv", { ...pro, provider: "stripe" }), [
      ">Aktiv</span>",
      ">Förnyas</dt>",
      "2 nov. 2026",
      ">Årsvis</dd>",
      ">Hantera fakturering</button>",
    ])
    expect(payments("sv", { ...pro, provider: "stripe" }, "admin")).toContain(
      "Arbetsytan har Pro. Be en ägare att byta plan."
    )
  })

  test("the mock's form", () => {
    expectAll(payments("sv", { ...pro, provider: "mock" }), [
      ">Byt till vald plan</button>",
      "Testfakturering – inga debiteringar",
      ">Säg upp abonnemanget</button>",
    ])
  })

  test("the checkout return", () => {
    const t = scoped(accountTranslator("sv"), "payments")
    const billing = { ...pro, provider: "stripe" } as Billing
    expect(checkoutMessage("cancelled", billing, t)).toBe(
      "Betalningen avbröts – inget har ändrats."
    )
    expect(checkoutMessage("success", billing, t)).toBe("Du har planen Pro.")
    expect(checkoutMessage("success", { ...billing, ...free }, t)).toBe(
      "Betalningen är klar – planen uppdateras inom en minut."
    )
    expect(checkoutMessage(undefined, billing, t)).toBeUndefined()
  })
})

describe("in English, as it always read", () => {
  test("workspace", () => {
    expectAll(workspaceView("en"), [
      ">You are an owner</dd>",
      "Change what each member can do, or remove them. 3 of 3 seats used.",
      "ada@example.com · Joined Jan 2, 2026",
      "Admin · Invited by Someone · Expires May 8, 2026",
      "This workspace has reached its member limit. <a",
      'Type <span class="font-semibold">Acme</span> to delete this workspace',
    ])
  })

  test("payments", () => {
    expectAll(payments("en", { ...free, provider: "stripe" }), [
      "$19 per month or $190 per year",
      "Up to 10 members · AI chat · API access",
      "Unlimited members · AI chat · API access",
      ">Free plan</span>",
    ])
    const t = scoped(accountTranslator("en"), "payments")
    expect(checkoutMessage("success", { ...pro, provider: "stripe" } as Billing, t)).toBe(
      "You're on Pro."
    )
  })
})

describe("the API keys card's gating in WorkspaceView", () => {
  // Spread, since a literal `role` JSX attribute reads to Biome as an ARIA role.
  const asOwner = { role: "owner" as const }
  const asViewer = { role: "viewer" as const }
  const apiKeys = [
    {
      id: 1,
      name: "CI bot",
      prefix: "abcd1234",
      scopes: ["notes:read"],
      createdBy: { id: 1, name: "Ada" },
      creatorLeft: false,
      createdAt: "2026-03-01T00:00:00.000Z",
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      status: "active",
    },
  ] as const

  test("an admin on a paid plan sees the full card, never the upsell", () => {
    const html = renderIn(
      "en",
      <WorkspaceView
        workspace={workspace(pro)}
        {...asOwner}
        entitlements={pro}
        currentUserId={1}
        members={members}
        invitations={[]}
        apiKeys={apiKeys as never}
        locale="en"
        apiKeysDocsUrl="https://docs.brand.localhost:3004"
        webhooksDocsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain(">CI bot<")
    expect(html).toContain(">Create key</button>")
    expect(html).not.toContain("API access is on the Pro and Team plans.")
  })

  test("an admin on a paid plan with no `apiKeys` prop still gets the manageable card, just empty", () => {
    // page.tsx always passes `apiKeys` when `apiKeysGate` is "manage"; this documents the
    // fallback (`apiKeys ?? []`) rather than leaving it incidental — an admin who can manage keys
    // never silently falls back to the below-admin explanation or the upsell.
    const html = renderIn(
      "en",
      <WorkspaceView
        workspace={workspace(pro)}
        {...asOwner}
        entitlements={pro}
        currentUserId={1}
        members={members}
        invitations={[]}
        locale="en"
        apiKeysDocsUrl="https://docs.brand.localhost:3004"
        webhooksDocsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("No API keys yet.")
    expect(html).toContain(">Create key</button>")
    expect(html).not.toContain("API access is on the Pro and Team plans.")
    expect(html).not.toContain("Workspace admins can create API keys")
  })

  test("read-only while impersonating, even for an admin on a paid plan", () => {
    const html = renderIn(
      "en",
      <WorkspaceView
        workspace={workspace(pro)}
        {...asOwner}
        entitlements={pro}
        currentUserId={1}
        members={members}
        invitations={[]}
        apiKeys={apiKeys as never}
        isImpersonating
        locale="en"
        apiKeysDocsUrl="https://docs.brand.localhost:3004"
        webhooksDocsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain(">CI bot<")
    expect(html).toContain("Not available while impersonating.")
    expect(html).not.toContain(">Create key</button>")
  })

  test("an admin on the Free plan sees the upsell with a link to Payments, never the list", () => {
    const html = renderIn(
      "en",
      <WorkspaceView
        workspace={workspace()}
        {...asOwner}
        entitlements={free}
        currentUserId={1}
        members={members}
        invitations={[]}
        locale="en"
        apiKeysDocsUrl="https://docs.brand.localhost:3004"
        webhooksDocsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("API access is on the Pro and Team plans.")
    expect(html).toContain('href="/payments"')
    expect(html).toContain(">See plans</a>")
    expect(html).not.toContain(">Create key</button>")
  })

  test("an admin on Free whose workspace has keys (a downgrade) still sees and can revoke them", () => {
    const html = renderIn(
      "en",
      <WorkspaceView
        workspace={workspace()}
        {...asOwner}
        entitlements={free}
        currentUserId={1}
        members={members}
        invitations={[]}
        apiKeys={apiKeys as never}
        locale="en"
        apiKeysDocsUrl="https://docs.brand.localhost:3004"
        webhooksDocsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain(">CI bot<")
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Revoke<\/button>/)
    expect(html).toContain(
      "These keys don&#x27;t work until the workspace is on Pro or Team again. You can still revoke them."
    )
    // The upsell takes the create form's place.
    expect(html).toContain("API access is on the Pro and Team plans.")
    expect(html).toContain(">See plans</a>")
    expect(html).not.toContain(">Create key</button>")
  })

  test("the same in Swedish", () => {
    const html = renderIn(
      "sv",
      <WorkspaceView
        workspace={workspace()}
        {...asOwner}
        entitlements={free}
        currentUserId={1}
        members={members}
        invitations={[]}
        apiKeys={apiKeys as never}
        locale="sv"
        apiKeysDocsUrl="https://docs.brand.localhost:3004"
        webhooksDocsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Återkalla<\/button>/)
    expect(html).toContain(
      "De här nycklarna fungerar inte förrän arbetsytan har Pro eller Team igen. Du kan fortfarande återkalla dem."
    )
    expect(html).toContain("API-åtkomst ingår i planerna Pro och Team.")
    expect(html).not.toContain(">Skapa nyckel</button>")
  })

  test("an admin on Free with no keys sees only the upsell, not an empty list", () => {
    const html = renderIn(
      "en",
      <WorkspaceView
        workspace={workspace()}
        {...asOwner}
        entitlements={free}
        currentUserId={1}
        members={members}
        invitations={[]}
        apiKeys={[]}
        locale="en"
        apiKeysDocsUrl="https://docs.brand.localhost:3004"
        webhooksDocsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("API access is on the Pro and Team plans.")
    expect(html).not.toContain("No API keys yet.")
    expect(html).not.toContain("These keys don")
  })

  test("a member or viewer sees only the short explanation, whatever the plan", () => {
    const html = renderIn(
      "en",
      <WorkspaceView
        workspace={workspace(pro)}
        {...asViewer}
        entitlements={pro}
        currentUserId={1}
        members={members}
        locale="en"
        apiKeysDocsUrl="https://docs.brand.localhost:3004"
        webhooksDocsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain(
      "Workspace admins can create API keys to connect outside tools and scripts to this workspace."
    )
    expect(html).not.toContain(">Create key</button>")
    expect(html).not.toContain("API access is on the Pro and Team plans.")
  })
})

describe("two-step verification on the Workspace page", () => {
  const withTwoFactor = [
    { ...members[0], twoFactor: true },
    { ...members[1], twoFactor: false },
    { ...members[1], userId: 3, name: "Grace", twoFactor: null },
  ] as Member[]
  const view = (
    locale: "en" | "sv",
    role: "owner" | "admin" | "viewer",
    security?: { requireTwoFactor: boolean; membersWithoutTwoFactor: number }
  ) =>
    renderIn(
      locale,
      <WorkspaceView
        workspace={{ ...workspace(), role, requireTwoFactor: true }}
        role={role}
        entitlements={free}
        currentUserId={1}
        members={withTwoFactor}
        security={security && { inviteDomains: [], ...security }}
        locale={locale}
        apiKeysDocsUrl="https://docs.brand.localhost:3004"
        webhooksDocsUrl="https://docs.brand.localhost:3004"
      />
    )

  test("the Security card sits above API keys; the owner gets the form and the count", () => {
    const html = view("en", "owner", { requireTwoFactor: true, membersWithoutTwoFactor: 1 })
    const security = html.indexOf(">Security</div>")
    expect(security).toBeGreaterThan(-1)
    expect(security).toBeLessThan(html.indexOf(">API keys</div>"))
    expect(html).toContain(">Require two-step verification for all members</label>")
    expect(html).toContain(">1 member doesn&#x27;t have two-step verification yet.</p>")
  })

  test("a member without two-step gets the badge; one with it, or unknown (null), does not", () => {
    const html = view("en", "admin", { requireTwoFactor: true, membersWithoutTwoFactor: 1 })
    expect(html.match(/>No two-step<\/span>/g)).toHaveLength(1)
    expect(view("sv", "admin", { requireTwoFactor: true, membersWithoutTwoFactor: 1 })).toContain(
      ">Utan tvåstegsverifiering</span>"
    )
  })

  test("below admin: the summary's own setting, no count, no form", () => {
    const html = view("sv", "viewer")
    expect(html).toContain(">Säkerhet</div>")
    expect(html).toContain(">Tvåstegsverifiering krävs för alla medlemmar.</p>")
    expect(html).not.toContain("har inte tvåstegsverifiering")
    expect(html).not.toContain('name="requireTwoFactor"')
  })
})

describe("allowed invitation domains on the Workspace page", () => {
  const pending: Invitation[] = [
    { ...invitations[0], id: 9, email: "g@acme.com" },
    { ...invitations[0], id: 10, email: "h@other.com" },
  ]
  const view = (
    locale: "en" | "sv",
    role: "owner" | "admin" | "viewer",
    domains?: string[],
    isImpersonating = false
  ) =>
    renderIn(
      locale,
      <WorkspaceView
        workspace={{ ...workspace(), role }}
        role={role}
        entitlements={free}
        currentUserId={1}
        members={members}
        invitations={role === "viewer" ? undefined : pending}
        security={
          domains === undefined
            ? undefined
            : { requireTwoFactor: false, membersWithoutTwoFactor: 0, inviteDomains: domains }
        }
        locale={locale}
        isImpersonating={isImpersonating}
        apiKeysDocsUrl="https://docs.brand.localhost:3004"
        webhooksDocsUrl="https://docs.brand.localhost:3004"
      />
    )

  test("the owner edits them: one per line, in their Unicode form, with the hint", () => {
    const html = view("en", "owner", ["acme.com", "xn--bcher-kva.de"])
    expect(html).toContain('<label data-slot="label"')
    expect(html).toContain('for="invite-domains">Allowed invitation domains</label>')
    expect(html).toContain('id="invite-domains"')
    expect(html).toContain('aria-describedby="invite-domains-hint"')
    expect(html).toContain(">acme.com\nbücher.de</textarea>")
    expect(html).toContain('id="invite-domains-hint"')
    expect(html).toContain(">Leave empty to allow any address.</p>")
    expect(html).toContain(">Save invitation domains</button>")
    // The invite form's hint, the list formatted; tied to the email field.
    expect(html).toContain(">Invitations are limited to: acme.com and bücher.de.</p>")
    expect(html).toContain('aria-describedby="invite-email-hint"')
    // Only the invitation outside the list gets the badge.
    expect(html.match(/>Outside allowed domains<\/span>/g)).toHaveLength(1)
    const badge = html.indexOf(">Outside allowed domains</span>")
    expect(badge).toBeGreaterThan(html.indexOf("h@other.com"))
  })

  test("an empty list: no hint, no badge, an empty textarea", () => {
    const html = view("en", "owner", [])
    expect(html).not.toContain("Invitations are limited to")
    expect(html).not.toContain("Outside allowed domains")
    expect(html).toMatch(/id="invite-domains"[^>]*><\/textarea>/)
  })

  test("an admin reads them; Swedish lists end with och", () => {
    const html = view("sv", "admin", ["acme.com", "acme.se", "acme.no"])
    expect(html).not.toContain('id="invite-domains"')
    expect(html).toContain(">Inbjudningsdomäner</h3>")
    expect(html).toContain(">acme.com, acme.se och acme.no</p>")
    expect(html).toContain(">Inbjudningar är begränsade till: acme.com, acme.se och acme.no.</p>")
    expect(html).toContain(">Utanför tillåtna domäner</span>")
    expect(view("en", "admin", [])).toContain(">Any address.</p>")
    // Who can change it, as the two-step section says it (so twice on the page).
    expect(html.match(/>Bara ägaren kan ändra det här\.<\/p>/g)).toHaveLength(2)
  })

  test("a long domain wraps rather than overflowing at 320 px", () => {
    const html = view("en", "admin", ["stockholms-universitet-studentkar-exempel.se"])
    expect(html).toMatch(/wrap-anywhere">stockholms-universitet-studentkar-exempel\.se<\/p>/)
    // The invite form (its hint and the api's refusal) and the owner's domains form (its save
    // confirmation) wrap through the form's own overflow-wrap, which every child inherits.
    expect(html).toMatch(
      /<form[^>]*wrap-anywhere"[^>]*><div role="status"[^>]*><\/div><input type="hidden" name="workspaceId" value="5"\/><div class="grid gap-4 sm:grid/
    )
    expect(view("en", "owner", ["acme.com"])).toMatch(
      /<form[^>]*wrap-anywhere"[^>]*><h3[^>]*>Invitation domains/
    )
  })

  test("an impersonating owner reads them, told why they can't change them", () => {
    const html = view("en", "owner", ["acme.com"], true)
    expect(html).not.toContain('id="invite-domains"')
    expect(html).toContain(">acme.com</p>")
    expect(html.match(/>Not available while impersonating\.<\/p>/g)).toHaveLength(2)
    expect(html).not.toContain("Only the owner can change this.")
  })

  test("below admin: nothing", () => {
    const html = view("en", "viewer")
    expect(html).not.toContain("Invitation domains")
    expect(html).not.toContain("Any address.")
    expect(html).not.toContain('id="invite-domains"')
  })
})
