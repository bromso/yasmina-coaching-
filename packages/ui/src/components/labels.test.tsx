import { describe, expect, test } from "bun:test"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { useState } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SiteFooter } from "../blocks/site-footer"
import { SiteHeader } from "../blocks/site-header"
import { CookieConsent } from "./cookie-consent"
import { ImpersonationBanner } from "./impersonation-banner"
import { Sheet } from "./sheet"
import {
  type SidebarLabels,
  SidebarProvider,
  SidebarRail,
  SidebarSheetHeader,
  SidebarTrigger,
  sidebarTooltip,
  useStableSidebarLabels,
} from "./sidebar"
import { SignInLink } from "./sign-in-link"
import { SkipLink } from "./skip-link"
import { ThemeToggle } from "./theme-toggle"
import { UserMenu, UserMenuItems } from "./user-menu"

// Every hard-coded string these components render can be replaced by a prop; the defaults (the
// other files' tests) stay the English they always were.
describe("label props", () => {
  test("SkipLink", () => {
    expect(renderToStaticMarkup(<SkipLink label="Hoppa till innehållet" />)).toContain(
      ">Hoppa till innehållet</a>"
    )
    expect(renderToStaticMarkup(<SkipLink />)).toContain(">Skip to content</a>")
  })

  test("ThemeToggle", () => {
    expect(renderToStaticMarkup(<ThemeToggle label="Växla tema" />)).toContain(
      'aria-label="Växla tema"'
    )
    expect(renderToStaticMarkup(<ThemeToggle />)).toContain('aria-label="Toggle theme"')
  })

  test("SignInLink", () => {
    const html = renderToStaticMarkup(<SignInLink authUrl="https://a.example" label="Logga in" />)
    expect(html).toContain(">Logga in</a>")
  })

  test("CookieConsent", () => {
    const html = renderToStaticMarkup(
      <CookieConsent
        privacyHref="/privacy"
        initial={null}
        labels={{
          region: "Samtycke till kakor",
          text: "Vi använder kakor.",
          privacy: "Integritet",
          acceptAll: "Godkänn alla",
          necessaryOnly: "Bara nödvändiga",
        }}
      />
    )
    expect(html).toContain('aria-label="Samtycke till kakor"')
    expect(html).toContain("Vi använder kakor.")
    expect(html).toContain(">Integritet</a>")
    expect(html).toContain(">Godkänn alla</button>")
    expect(html).toContain(">Bara nödvändiga</button>")
    const english = renderToStaticMarkup(<CookieConsent privacyHref="/privacy" initial={null} />)
    expect(english).toContain('aria-label="Cookie consent"')
    expect(english).toContain(
      "We use cookies for sign-in and, if you allow it, to understand how the site is used. "
    )
    expect(english).toContain(">Accept all</button>")
  })

  test("ImpersonationBanner", () => {
    const html = renderToStaticMarkup(
      <ImpersonationBanner
        name="Ada"
        email="ada@example.com"
        reason="ärende 12"
        expiresAt="2026-06-01T13:05:00.000Z"
        stopUrl="/admin/stop"
        labels={{ viewingAs: "Visar som", ends: "slutar", stop: "Sluta agera som användaren" }}
        endsAtText="13.05 UTC"
      />
    )
    expect(html).toContain('Visar som <strong class="font-semibold">Ada (ada@example.com)</strong>')
    expect(html).toContain('slutar <time dateTime="2026-06-01T13:05:00.000Z">13.05 UTC</time>')
    expect(html).toContain(">Sluta agera som användaren</a>")
  })

  const labels = {
    trigger: "Kontomeny för Ada",
    workspace: "Arbetsyta",
    noWorkspace: "Ingen arbetsyta än",
    createWorkspace: "Skapa en arbetsyta",
    manageMembers: "Hantera medlemmar",
    invitations: "Inbjudningar",
    account: "Konto",
    signOut: "Logga ut",
  }

  test("UserMenu's trigger takes its whole accessible name", () => {
    const html = renderToStaticMarkup(
      <UserMenu
        user={{ name: "Ada", email: "ada@example.com" }}
        accountUrl="/account"
        signOut={async () => {}}
        labels={labels}
      />
    )
    expect(html).toContain('<span class="sr-only">Kontomeny för Ada</span>')
  })

  test("UserMenuItems", () => {
    const html = renderToStaticMarkup(
      <DropdownMenuPrimitive.Root open>
        <DropdownMenuPrimitive.Content forceMount>
          <UserMenuItems
            user={{ name: "Ada", email: "ada@example.com" }}
            accountUrl="/account"
            signOut={async () => {}}
            labels={labels}
            workspaces={{
              items: [],
              currentId: null,
              switchTo: async () => {},
              pendingInvitations: 2,
              newUrl: "/new",
              manageUrl: "/manage",
              canManage: true,
            }}
          />
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Root>
    )
    for (const text of Object.values(labels).slice(1)) expect(html).toContain(text)
    expect(html).not.toContain("Sign out")
  })

  test("SiteHeader and SiteFooter: the nav's label", () => {
    const link = [{ label: "App", href: "https://app.example.com" }]
    const header = (navLabel?: string) =>
      renderToStaticMarkup(<SiteHeader brand={<span>B</span>} links={link} navLabel={navLabel} />)
    expect(header()).toContain('<nav aria-label="Site"')
    expect(header("Webbplats")).toContain('<nav aria-label="Webbplats"')
    expect(header("Webbplats")).not.toContain('aria-label="Site"')
    // The mobile sheet's content is portalled (not server-rendered); its hamburger is.
    expect(header()).toContain('aria-label="Open menu"')
    expect(
      renderToStaticMarkup(
        <SiteHeader brand={<span>B</span>} links={link} mobileLabels={{ open: "Öppna menyn" }} />
      )
    ).toContain('aria-label="Öppna menyn"')
    const groups = [{ title: "Product", links: link }]
    const footer = (navLabel?: string) =>
      renderToStaticMarkup(
        <SiteFooter brand={<span>B</span>} groups={groups} navLabel={navLabel} />
      )
    expect(footer()).toContain('<nav aria-label="Footer"')
    expect(footer("Sidfot")).toContain('<nav aria-label="Sidfot"')
    expect(footer("Sidfot")).not.toContain('aria-label="Footer"')
  })

  test("Sidebar: the trigger's and the rail's toggle label, from the provider or the component", () => {
    const render = (provider?: { toggle?: string }, own?: { toggle?: string }) =>
      renderToStaticMarkup(
        <SidebarProvider labels={provider}>
          <SidebarTrigger labels={own} />
          <SidebarRail labels={own} />
        </SidebarProvider>
      )
    const english = render()
    expect(english).toContain('<span class="sr-only">Toggle Sidebar</span>')
    expect(english).toContain('aria-label="Toggle Sidebar"')
    expect(english).toContain('title="Toggle Sidebar"')
    const swedish = render({ toggle: "Visa eller dölj sidofältet" })
    expect(swedish).toContain('<span class="sr-only">Visa eller dölj sidofältet</span>')
    expect(swedish).toContain('aria-label="Visa eller dölj sidofältet"')
    expect(swedish).toContain('title="Visa eller dölj sidofältet"')
    expect(swedish).not.toContain("Toggle Sidebar")
    const own = render({ toggle: "Provider" }, { toggle: "Own" })
    expect(own).toContain('<span class="sr-only">Own</span>')
    expect(own).not.toContain("Provider")
  })

  test("Sidebar: the trigger's tooltip says Open or Close, or the labels given", () => {
    expect(sidebarTooltip(true)).toBe("Close")
    expect(sidebarTooltip(false)).toBe("Open")
    expect(sidebarTooltip(true, { close: "Stäng" })).toBe("Stäng")
    expect(sidebarTooltip(false, { open: "Öppna" })).toBe("Öppna")
  })

  test("Sidebar: the mobile sheet's title and description, English unless the provider says", () => {
    const render = (labels?: SidebarLabels) =>
      renderToStaticMarkup(
        <SidebarProvider labels={labels}>
          <Sheet open>
            <SidebarSheetHeader />
          </Sheet>
        </SidebarProvider>
      )
    const english = render()
    expect(english).toContain(">Sidebar</h2>")
    expect(english).toContain(">Displays the mobile sidebar.</p>")
    const swedish = render({ title: "Sidofält", description: "Visar sidofältet i mobilläge." })
    expect(swedish).toContain(">Sidofält</h2>")
    expect(swedish).toContain(">Visar sidofältet i mobilläge.</p>")
    expect(swedish).not.toContain("Displays the mobile sidebar.")
    // Only the title given: the description stays English.
    expect(render({ title: "Sidofält" })).toContain(">Displays the mobile sidebar.</p>")
  })

  test("Sidebar: the provider keeps its labels by their strings, not the object's identity", () => {
    // A render-phase update re-runs the component with its hooks' state kept (as a re-render
    // would), so a fresh inline object with the same strings must come back as the same value.
    const seen: (SidebarLabels | undefined)[] = []
    function Probe({ next }: { next: (pass: number) => SidebarLabels | undefined }) {
      const [pass, setPass] = useState(0)
      seen.push(useStableSidebarLabels(next(pass)))
      if (pass === 0) setPass(1)
      return null
    }
    renderToStaticMarkup(<Probe next={() => ({ toggle: "Växla", open: "Öppna" })} />)
    expect(seen).toHaveLength(2)
    expect(seen[1]).toBe(seen[0])
    expect(seen[0]).toEqual({ toggle: "Växla", open: "Öppna" })

    seen.length = 0
    renderToStaticMarkup(<Probe next={(pass) => ({ toggle: pass === 0 ? "Växla" : "Toggle" })} />)
    expect(seen[1]).not.toBe(seen[0])
    expect(seen[1]?.toggle).toBe("Toggle")

    seen.length = 0
    renderToStaticMarkup(<Probe next={() => undefined} />)
    expect(seen).toEqual([undefined, undefined])
  })
})
