import { describe, expect, mock, test } from "bun:test"
import type { Identity, Passkey, SessionSummary, User } from "@repo/api-contract"
import { renderIn } from "@/test-intl"

// The views' forms import their server actions, which reach @repo/session: `server-only` throws
// outside a react-server bundle, so stub it. The sidebar asks for the current path.
mock.module("server-only", () => ({}))
const navigation = await import("next/navigation")
mock.module("next/navigation", () => ({ ...navigation, usePathname: () => "/security" }))
const { HomeView } = await import("./home-view")
const { PersonalInfoView } = await import("./personal-info-view")
const { SecurityView } = await import("./security-view")
const { DataPrivacyView } = await import("./data-privacy-view")
const { EmailConfirmView } = await import("./email-confirm-view")
const { TwoFactorRequiredView } = await import("./two-factor-required-view")
const { AccountSidebar } = await import("@/components/account-sidebar")
const { TwoFactorCard } = await import("@/components/two-factor-card")
const { SidebarProvider } = await import("@repo/ui/components/sidebar")

const user: User = {
  id: 1,
  email: "ada@example.com",
  name: "Ada",
  createdAt: "2026-01-01T00:00:00.000Z",
  emailVerified: false,
  hasPassword: true,
  superadmin: false,
  avatarUrl: null,
  locale: "sv",
  deletionScheduledAt: null,
  passkeys: 0,
  twoFactorSatisfied: false,
}
const sessions = [
  {
    id: "1",
    current: true,
    userAgent: "Firefox",
    createdAt: "2026-03-04T05:06:07.000Z",
    lastSeenAt: "2026-12-31T23:59:00.000Z",
  },
  {
    id: "2",
    current: false,
    userAgent: null,
    createdAt: "2026-03-04T05:06:07.000Z",
    lastSeenAt: "2026-03-05T05:06:07.000Z",
  },
] as unknown as SessionSummary[]
const identities = [
  { provider: "github", email: "a@gh.example", createdAt: "2026-02-01T00:00:00.000Z" },
] as unknown as Identity[]
const passkeys: Passkey[] = [
  { id: 1, name: "Work laptop", createdAt: "2026-01-02T00:00:00.000Z", lastUsedAt: null },
]
const security = (locale: "en" | "sv", u: User = user, pk: Passkey[] = passkeys) =>
  renderIn(
    locale,
    <SecurityView
      items={sessions}
      email={u.email}
      user={u}
      identities={identities}
      providers={["github", "google"]}
      twoFactor={{ enabled: false, recoveryCodesLeft: 0 }}
      passkeys={pk}
      isImpersonating={false}
      locale={locale}
    />
  )

const expectAll = (html: string, texts: string[]) => {
  for (const text of texts) expect(html).toContain(text)
}

describe("in Swedish", () => {
  test("home", () => {
    expectAll(renderIn("sv", <HomeView user={user} />), [
      "Välkommen, Ada",
      ">Integritet och anpassning</div>",
      ">Granska",
      "<strong>Verifiera din e-postadress.</strong> Vi skickade en länk till ada@example.com.",
      ">Skicka verifieringsmejlet igen</button>",
    ])
  })

  test("personal info, with the Language card right after Basic info", () => {
    const html = renderIn(
      "sv",
      <PersonalInfoView
        user={user}
        locale="sv"
        pending={null}
        twoFactorEnabled={false}
        isImpersonating={false}
      />
    )
    expectAll(html, [
      ">Personuppgifter</h1>",
      ">Profilbild</div>",
      ">Ladda upp</button>",
      "PNG, JPEG eller WebP, högst 2 MB.",
      ">Namn</label>",
      ">Spara namn</button>",
      ">E-postadress</div>",
      ">Inte verifierad</span>",
      ">Ny e-postadress</label>",
      ">Nuvarande lösenord</label>",
      ">Byt e-post</button>",
      // The card's switcher: the current language selected, the button labelled in Swedish.
      '<option value="sv" lang="sv" selected="">Svenska</option>',
      ">Spara språk</button>",
    ])
    const basic = html.indexOf(">Grunduppgifter</div>")
    const language = html.indexOf(">Språk</div>")
    const emailCard = html.indexOf(">E-postadress</div>")
    expect(basic).toBeGreaterThan(-1)
    expect(language).toBeGreaterThan(basic)
    expect(emailCard).toBeGreaterThan(language)
  })

  test("personal info: a pending change shows as a notice and relabels the submit Send again", () => {
    const html = renderIn(
      "sv",
      <PersonalInfoView
        user={user}
        locale="sv"
        pending={{ maskedEmail: "n***@example.com", expiresAt: "2026-01-02T12:00:00.000Z" }}
        twoFactorEnabled={true}
        isImpersonating={false}
      />
    )
    expect(html).toContain("Kontrollera n***@example.com")
    expect(html).toContain(">Skicka igen</button>")
    expect(html).toContain(">Kod</label>")
  })

  test("personal info, while impersonating: the Email address card is read-only", () => {
    const html = renderIn(
      "sv",
      <PersonalInfoView
        user={user}
        locale="sv"
        pending={null}
        twoFactorEnabled={false}
        isImpersonating={true}
      />
    )
    expect(html).toContain("Inte tillgängligt när du agerar som en annan användare.")
    expect(html).not.toContain(">Byt e-post</button>")
  })

  test("security: cards, devices with Swedish dates (UTC), connected accounts", () => {
    const html = security("sv")
    expectAll(html, [
      ">Säkerhet</h1>",
      ">Lösenord</div>",
      ">Nuvarande lösenord</label>",
      'aria-label="Visa lösenord"',
      ">Byt lösenord</button>",
      ">Tvåstegsverifiering</div>",
      "Verifiera din e-postadress först. <a",
      ">Skicka länken igen</a>",
      ">Passkeys</div>",
      'value="Work laptop"',
      "Tillagd 2 jan. 2026",
      "Aldrig använd",
      ">Spara</button>",
      ">Ta bort</button>",
      ">Anslutna konton</div>",
      "a@gh.example · Ansluten 1 feb. 2026",
      ">Anslut</a>",
      ">Koppla bort</button>",
      ">Den här enheten</span>",
      "Inloggad 4 mars 2026 · Senast aktiv 31 dec. 2026",
      ">Okänd enhet</span>",
      ">Logga ut alla andra enheter</button>",
    ])
    // Needs JavaScript: a pure server render holds only its invisible, inert placeholder (the
    // auth app's passkey button does the same), so nothing shifts once it hydrates.
    expect(html).toMatch(/<div aria-hidden="true" inert(="")? class="invisible [^"]*"><form/)
    expect(html).toContain(">Lägg till en passkey</button>")
  })

  test("passkeys: the empty state, and read-only while impersonating", () => {
    const empty = security("sv", user, [])
    expect(empty).toContain("Du har inga passkeys ännu.")
    const impersonating = renderIn(
      "sv",
      <SecurityView
        items={sessions}
        email={user.email}
        user={user}
        identities={identities}
        providers={["github", "google"]}
        twoFactor={{ enabled: false, recoveryCodesLeft: 0 }}
        passkeys={passkeys}
        isImpersonating
        locale="sv"
      />
    )
    expectAll(impersonating, [
      'value="Work laptop"',
      "Inte tillgängligt när du agerar som en annan användare.",
    ])
    expect(impersonating).toContain('disabled=""')
    expect(impersonating).not.toContain("Lägg till en passkey")
  })

  test("security without a password offers to set one", () => {
    expectAll(security("sv", { ...user, hasPassword: false, emailVerified: true }), [
      "Lägg till ett lösenord",
      ">Skapa lösenord</button>",
      ">Slå på</button>",
    ])
  })

  test("two-step verification on, low on codes, and while impersonating", () => {
    expectAll(
      renderIn(
        "sv",
        <TwoFactorCard
          enabled
          recoveryCodesLeft={1}
          isImpersonating={false}
          emailVerified
          hasPassword
        />
      ),
      [
        "Tvåstegsverifiering är aktiverad.",
        "1 återställningskod kvar – skapa nya snart.",
        ">Skapa nya återställningskoder</button>",
        ">Stäng av</button>",
      ]
    )
    expectAll(
      renderIn(
        "sv",
        <TwoFactorCard
          enabled={false}
          recoveryCodesLeft={0}
          isImpersonating
          emailVerified
          hasPassword
        />
      ),
      [
        "Tvåstegsverifiering är inaktiverad.",
        "Inte tillgängligt när du agerar som en annan användare.",
      ]
    )
  })

  test("off: the current password field only when the account has one", () => {
    const off = (hasPassword: boolean) =>
      renderIn(
        "sv",
        <TwoFactorCard
          enabled={false}
          recoveryCodesLeft={0}
          isImpersonating={false}
          emailVerified
          hasPassword={hasPassword}
        />
      )
    expect(off(true)).toContain('name="currentPassword"')
    expect(off(true)).toContain(">Nuvarande lösenord</label>")
    expect(off(false)).not.toContain('name="currentPassword"')
  })

  test("data & privacy: three cards, the current consent checked", () => {
    const html = renderIn(
      "sv",
      <DataPrivacyView latestExport={null} consent="necessary" locale="sv" />
    )
    expectAll(html, [
      ">Data och integritet</h1>",
      ">Dina data</div>",
      ">Cookies och analys</div>",
      ">Radera konto</div>",
      ">Begär en export</button>",
      ">Alla cookies, även analys</label>",
      ">Endast nödvändiga cookies</label>",
      ">Spara</button>",
      ">Din e-postadress</label>",
      "Ditt konto och dina data raderas om 7 dagar. Logga in innan dess för att avbryta. Arbetsytor där du är den enda medlemmen raderas också, och deras betalda planer sägs upp.",
      ">Radera mitt konto</button>",
    ])
    expect(html).toContain('checked="" value="necessary"')
    expect(html).not.toContain('checked="" value="all"')
    expect(html).not.toContain("Ladda ned")
  })

  test("data & privacy: the export's states, Download only when ready", () => {
    const at = (status: "pending" | "ready" | "expired") =>
      renderIn(
        "sv",
        <DataPrivacyView
          latestExport={{
            id: 4,
            status,
            readyAt: status === "pending" ? null : "2026-10-10T09:00:00.000Z",
            expiresAt: status === "pending" ? null : "2026-10-17T09:00:00.000Z",
          }}
          consent={null}
          locale="sv"
        />
      )
    const pending = at("pending")
    expect(pending).toContain("Din export förbereds…")
    expect(pending).not.toContain("Ladda ned")
    expect(pending).not.toContain("Begär en export")
    const ready = at("ready")
    expect(ready).toMatch(/<a href="\/data-privacy\/export\?id=4" download=""[^>]*>Ladda ned<\/a>/)
    expect(ready).toContain("Tillgänglig till 17 okt. 2026")
    const expired = at("expired")
    expect(expired).toContain("Har gått ut")
    expect(expired).toContain(">Begär en export</button>")
    expect(expired).not.toContain("Ladda ned")
  })

  test("the sidebar", () => {
    expectAll(
      renderIn(
        "sv",
        <SidebarProvider>
          <AccountSidebar />
        </SidebarProvider>
      ),
      [">Start</span>", ">Personuppgifter</span>", ">Betalningar och abonnemang</span>"]
    )
  })
})

describe("in English, as it always read", () => {
  test("data & privacy", () => {
    const html = renderIn(
      "en",
      <DataPrivacyView
        latestExport={{
          id: 4,
          status: "ready",
          readyAt: "2026-10-10T09:00:00.000Z",
          expiresAt: "2026-10-17T09:00:00.000Z",
        }}
        consent={null}
        locale="en"
      />
    )
    expectAll(html, [
      ">Your data</div>",
      ">Download</a>",
      "Available until Oct 17, 2026",
      ">Cookies and analytics</div>",
      ">All cookies, including analytics</label>",
      ">Delete my account</button>",
    ])
  })

  test("security", () => {
    const html = security("en")
    expectAll(html, [
      ">Two-step verification</div>",
      // Exactly what the fixed "en" formatter printed before translation.
      `a@gh.example · Connected ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date("2026-02-01T00:00:00.000Z"))}`,
      "Signed in Mar 4, 2026 · Last seen Dec 31, 2026",
      "Verify your email first. <a",
      ">Resend the link</a> from Personal info, then come back here to turn it on.",
      ">Passkeys</div>",
      'value="Work laptop"',
      "Added Jan 2, 2026",
      "Never used",
      ">Save</button>",
      ">Remove</button>",
    ])
    // Needs JavaScript: a pure server render holds only its invisible, inert placeholder (the
    // auth app's passkey button does the same), so nothing shifts once it hydrates.
    expect(html).toMatch(/<div aria-hidden="true" inert(="")? class="invisible [^"]*"><form/)
    expect(html).toContain(">Add a passkey</button>")
  })

  test("two-step verification's count", () => {
    expect(
      renderIn(
        "en",
        <TwoFactorCard
          enabled
          recoveryCodesLeft={8}
          isImpersonating={false}
          emailVerified
          hasPassword
        />
      )
    ).toContain("8 recovery codes left.")
    expect(
      renderIn(
        "en",
        <TwoFactorCard
          enabled
          recoveryCodesLeft={1}
          isImpersonating={false}
          emailVerified
          hasPassword
        />
      )
    ).toContain("1 recovery code left — regenerate soon.")
  })

  test("the last provider: Disconnect is disabled without a passkey, allowed with one", () => {
    const passwordless = { ...user, hasPassword: false, emailVerified: true }
    const hint = "This is your only way to sign in — set a password or add a passkey first"
    const locked = security("en", passwordless, [])
    expect(locked).toContain(hint)
    expect(locked).toMatch(/aria-describedby="disconnect-github-hint"[^>]*>Disconnect</)
    const withPasskey = security("en", { ...passwordless, passkeys: 1 }, passkeys)
    expect(withPasskey).not.toContain(hint)
    expect(withPasskey).not.toContain('aria-describedby="disconnect-github-hint"')
    expect(withPasskey).not.toMatch(/disabled=""[^>]*>Disconnect</)
  })

  test("the last provider's hint in Swedish", () => {
    expect(security("sv", { ...user, hasPassword: false }, [])).toContain(
      "Det här är ditt enda sätt att logga in – skapa ett lösenord eller lägg till en passkey först"
    )
  })
})

describe("EmailConfirmView", () => {
  test("renders the title and the confirm button, token included", () => {
    const html = renderIn("en", <EmailConfirmView token="a-token" />)
    expect(html).toContain(">Confirm new email</h1>")
    expect(html).toContain(">Confirm new email</button>")
    expect(html).toContain('value="a-token"')
  })

  test("in Swedish", () => {
    const html = renderIn("sv", <EmailConfirmView token="a-token" />)
    expect(html).toContain(">Bekräfta ny e-post</h1>")
  })
})

describe("the Security page's two-step requirement warnings", () => {
  const page = (
    twoFactor: boolean,
    pk: Passkey[],
    warnings: { twoFactorOff: string[]; lastPasskey: string[] },
    locale: "en" | "sv" = "en"
  ) =>
    renderIn(
      locale,
      <SecurityView
        items={sessions}
        email={user.email}
        user={{ ...user, emailVerified: true }}
        identities={identities}
        providers={["github", "google"]}
        twoFactor={{ enabled: twoFactor, recoveryCodesLeft: 8 }}
        passkeys={pk}
        isImpersonating={false}
        locale={locale}
        warnings={warnings}
      />
    )

  test("turning two-step off names the workspaces it would block, and stays possible", () => {
    const html = page(true, [], { twoFactorOff: ["Acme", "Beta"], lastPasskey: [] })
    expect(html).toContain(
      '<p id="off-warning" class="text-destructive text-sm">Turning this off will block you from: Acme, Beta.</p>'
    )
    expect(html).toMatch(/aria-describedby="off-warning"[^>]*>Turn off<\/button>/)
    expect(html).not.toContain("passkey-requirement-warning")
  })

  test("removing the last passkey names the one workspace, in Swedish too", () => {
    const one = { twoFactorOff: [], lastPasskey: ["Acme"] }
    const html = page(false, passkeys, one)
    expect(html).toContain(
      '<p id="passkey-requirement-warning" class="text-destructive basis-full">Removing your only passkey will block you from: Acme.</p></li>'
    )
    expect(html).toMatch(
      /aria-describedby="[^"]* passkey-requirement-warning"[^>]*>Remove<\/button>/
    )
    expect(html).not.toContain('id="off-warning"')
    expect(page(false, passkeys, one, "sv")).toContain(
      ">Om du tar bort din enda passkey spärras du från: Acme.</p></li>"
    )
  })

  test("no warning when nothing would be blocked", () => {
    const html = page(true, passkeys, { twoFactorOff: [], lastPasskey: [] })
    expect(html).not.toContain("will block you from")
  })
})

describe("TwoFactorRequiredView", () => {
  const props = {
    workspace: { id: 7, name: "Acme" },
    setupUrl: "http://account.brand.localhost:3003/security",
    newWorkspaceUrl: "http://app.brand.localhost:3001/workspaces/new",
  }
  const others = [
    { id: 8, name: "Beta" },
    { id: 9, name: "Gamma" },
  ]

  test("the notice, a switch form per other workspace, and leave naming the workspace", () => {
    const html = renderIn("en", <TwoFactorRequiredView {...props} others={others} />, [
      "account",
      "ui",
    ])
    expectAll(html, [
      ">Two-step verification required</h1>",
      "Acme requires two-step verification. Turn it on, or add a passkey, to continue.",
      '<a href="http://account.brand.localhost:3003/security"',
      ">Set up two-step verification</a>",
      '<input type="hidden" name="workspaceId" value="8"/>',
      '<input type="hidden" name="workspaceId" value="7"/>',
      ">No longer need Acme?</p>",
    ])
    expect(html).not.toContain("Create another workspace")
    // Short visible labels; each accessible name starts with it and names its workspace, once.
    for (const [name, visible] of [
      ["Switch to Beta", "Switch"],
      ["Switch to Gamma", "Switch"],
      ["Leave Acme", "Leave"],
    ]) {
      expect(html).toMatch(new RegExp(`aria-label="${name}"[^>]*>${visible}</button>`))
      expect(html.split(`aria-label="${name}"`).length).toBe(2)
    }
    // The other workspaces' names are text beside their buttons.
    expectAll(html, [">Beta</span>", ">Gamma</span>"])
  })

  test("a long workspace name wraps in the text, never inside a button", () => {
    const long = "Northwind Traders Customer Success and Partner Enablement Team"
    const html = renderIn(
      "en",
      <TwoFactorRequiredView
        {...props}
        workspace={{ id: 7, name: long }}
        others={[{ id: 8, name: long }]}
      />,
      ["account", "ui"]
    )
    expect(html).toMatch(new RegExp(`wrap-anywhere[^"]*"[^>]*>${long}</span>`))
    expect(html).toContain(`>No longer need ${long}?</p>`)
    expect(html).not.toContain("whitespace-normal")
    expect(html).not.toMatch(new RegExp(`>[^<]*${long}[^<]*</button>`))
  })

  test("the only workspace: a link to create another instead, in Swedish", () => {
    const html = renderIn("sv", <TwoFactorRequiredView {...props} others={[]} />, ["account", "ui"])
    expectAll(html, [
      ">Tvåstegsverifiering krävs</h1>",
      "Acme kräver tvåstegsverifiering. Slå på den, eller lägg till en passkey, för att fortsätta.",
      ">Slå på tvåstegsverifiering</a>",
      '<a class="underline underline-offset-4" href="http://app.brand.localhost:3001/workspaces/new">Skapa en ny arbetsyta</a>',
      ">Behöver du inte Acme längre?</p>",
    ])
    expect(html).toMatch(/aria-label="Lämna Acme"[^>]*>Lämna<\/button>/)
    expect(html).not.toContain("Byt till")
  })
})
