import { describe, expect, mock, test } from "bun:test"
import type { Note, PendingInvitation } from "@repo/api-contract"
import { renderIn } from "@/test-intl"

// The views' forms import their server actions, which reach @repo/session: `server-only` throws
// outside a react-server bundle, so stub it. `LiveNotes` asks for the app router, which a static
// render has none of: a no-op one stands in.
mock.module("server-only", () => ({}))
const navigation = await import("next/navigation")
mock.module("next/navigation", () => ({ ...navigation, useRouter: () => ({ refresh() {} }) }))
const { NotesView } = await import("./notes-view")
const { HomeView } = await import("./home-view")
const { ChatView } = await import("./chat-view")
const { ChatUpsellView } = await import("./chat-upsell-view")
const { WorkspaceNewView } = await import("./workspace-new-view")
const { InvitationView } = await import("./invitation-view")
const { TwoFactorRequiredView } = await import("./two-factor-required-view")

const note: Note = {
  id: 1,
  authorId: 3,
  apiKey: null,
  title: "Hello",
  body: "World",
  createdAt: "2026-03-04T05:06:07.000Z",
}
const viewer = {
  workspace: { id: 7, name: "Acme" },
  role: "member" as const,
  userId: 3,
  firstPage: true,
  renderedAt: 0,
  authUrl: "http://auth.brand.localhost:3002",
  signInNext: "http://app.brand.localhost:3001/notes",
}
// A read-only member; spread, since a literal `role` prop reads to Biome as an ARIA role.
const readOnly = { ...viewer, role: "viewer" as const }
const invitation = {
  id: 9,
  workspace: { id: 8, name: "Beta" },
  role: "member",
  invitedBy: { name: "" },
  expiresAt: "2026-05-01T00:00:00.000Z",
} as unknown as PendingInvitation

const expectAll = (html: string, texts: string[]) => {
  for (const text of texts) expect(html).toContain(text)
}

describe("NotesView", () => {
  const page = (locale: "en" | "sv") =>
    renderIn(
      locale,
      <NotesView {...viewer} locale={locale} page={{ items: [note], nextCursor: 5 }} cursor={2} />
    )

  test("in Swedish: heading, role, form, list, date and pager", () => {
    const html = page("sv")
    expectAll(html, [
      "Anteckningar · Acme",
      "Din roll här: medlem.",
      ">Titel</label>",
      ">Text</label>",
      ">Lägg till anteckning</button>",
      ">Ta bort</button>",
      'aria-label="Sidor med anteckningar"',
      ">Nyaste</a>",
      ">Äldre anteckningar</a>",
      // Swedish date order, still UTC.
      ">4 mars 2026 05:06 UTC</time>",
    ])
    expect(html).not.toContain("Your role here")
    expect(html).not.toContain("Older notes")
  })

  test("in English it reads as it always has", () => {
    expectAll(page("en"), [
      "Notes · Acme",
      "Your role here: member.",
      ">Add note</button>",
      ">Delete</button>",
      'aria-label="Notes pages"',
      // Exactly what the fixed "en" formatter printed before translation.
      `>${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(note.createdAt))} UTC</time>`,
    ])
  })

  test("a viewer, an empty list and the error state, in Swedish", () => {
    const empty = renderIn(
      "sv",
      <NotesView {...readOnly} locale="sv" page={{ items: [], nextCursor: null }} />
    )
    expectAll(empty, [
      "Din roll här: läsare.",
      "Läsare kan läsa anteckningar",
      "Inga anteckningar än.",
    ])
    const error = renderIn("sv", <NotesView {...viewer} locale="sv" error="nere" />)
    expect(error).toContain("Anteckningarna är inte tillgängliga")
  })

  test("a note whose author's account is gone reads as a deleted user", () => {
    const gone = { ...note, id: 2, authorId: null }
    const render = (locale: "en" | "sv") =>
      renderIn(
        locale,
        <NotesView {...viewer} locale={locale} page={{ items: [gone, note], nextCursor: null }} />
      )
    expect(render("sv")).toContain("05:06 UTC</time> · Borttagen användare")
    expect(render("en")).toContain(" UTC</time> · Deleted user")
    // Only on the author-less note.
    expect(render("en").match(/Deleted user/g)?.length).toBe(1)
  })

  test("a note created through an API key names the key, even after authorId is null", () => {
    const viaKey = { ...note, id: 3, authorId: null, apiKey: { id: 1, name: "CI bot" } }
    const render = (locale: "en" | "sv") =>
      renderIn(
        locale,
        <NotesView {...viewer} locale={locale} page={{ items: [viaKey, note], nextCursor: null }} />
      )
    expect(render("en")).toContain(" UTC</time> · via API key CI bot")
    expect(render("sv")).toContain(" UTC</time> · via API-nyckeln CI bot")
    // The key's own note never also reads as a deleted user, though authorId is null.
    expect(render("en")).not.toContain("Deleted user")
  })
})

describe("the other views in Swedish", () => {
  test("home", () => {
    expectAll(renderIn("sv", <HomeView />), [
      "Välkommen till applikationen",
      ">Anteckningar</a>",
      ">Chatt</a>",
    ])
  })

  test("chat and its upsell", () => {
    expectAll(renderIn("sv", <ChatView />), [
      ">Chatt</h1>",
      'aria-label="Meddelande"',
      'placeholder="Skriv något, eller fråga vad klockan är"',
      ">Skicka</button>",
    ])
    expectAll(renderIn("sv", <ChatUpsellView plansUrl="/payments" />), [
      "Chatten ingår i Pro-planen",
      ">Se planer</a>",
    ])
  })

  test("creating a workspace, with an unverified email and a pending invitation", () => {
    const html = renderIn(
      "sv",
      <WorkspaceNewView
        locale="sv"
        user={{ email: "a@b.co", emailVerified: false }}
        list={{ items: [], pendingInvitations: [invitation] }}
      />
    )
    expectAll(html, [
      ">Skapa en arbetsyta</h1>",
      "<strong>Verifiera din e-postadress.</strong> Vi skickade en länk till a@b.co.",
      ">Skicka verifieringsmejlet igen</button>",
      ">Inbjudningar</h2>",
      "Någon bjöd in dig till Beta som medlem.",
      'Gäller till <time dateTime="2026-05-01T00:00:00.000Z">1 maj 2026</time>',
      ">Acceptera</button>",
    ])
  })

  test("the same in English, unchanged", () => {
    const html = renderIn(
      "en",
      <WorkspaceNewView
        locale="en"
        user={{ email: "a@b.co", emailVerified: false }}
        list={{ items: [], pendingInvitations: [invitation] }}
      />
    )
    expectAll(html, [
      "<strong>Verify your email.</strong> We sent a link to a@b.co.",
      "Someone invited you to Beta as a member.",
      'Expires <time dateTime="2026-05-01T00:00:00.000Z">May 1, 2026</time>',
    ])
  })

  test("your workspaces, with the form", () => {
    const html = renderIn(
      "sv",
      <WorkspaceNewView
        locale="sv"
        user={{ email: "a@b.co", emailVerified: true }}
        list={{
          items: [{ id: 7, name: "Acme", role: "admin" }] as never,
          pendingInvitations: [],
        }}
      />
    )
    expectAll(html, [">Dina arbetsytor</h2>", ">administratör</span>", ">Skapa en till</h2>"])
    expectAll(html, [">Arbetsytans namn</label>", ">Skapa</button>"])
  })

  test("the invitation page, signed in and out", () => {
    const preview = {
      workspace: { name: "Acme" },
      invitedBy: { name: "Ada" },
      role: "admin",
      email: "a***@b.co",
    } as never
    const props = { preview, token: "t", authUrl: "http://a", current: "http://c" }
    expectAll(renderIn("sv", <InvitationView {...props} signedIn />), [
      "Gå med i Acme",
      "Ada bjöd in dig till Acme som administratör.",
      "Inte du?",
      ">Logga ut</button>",
      ">Acceptera</button>",
    ])
    expectAll(renderIn("sv", <InvitationView {...props} signedIn={false} />), [
      ">Logga in</a>",
      ">Skapa konto</a>",
      "Använd a***@b.co.",
    ])
    // Said only when the workspace requires two-step verification of its members.
    const line = "Den här arbetsytan kräver tvåstegsverifiering."
    expect(renderIn("sv", <InvitationView {...props} signedIn />)).not.toContain(line)
    const requiring = {
      workspace: { name: "Acme" },
      invitedBy: { name: "Ada" },
      role: "admin",
      email: "a***@b.co",
      requireTwoFactor: true,
    } as never
    expect(renderIn("sv", <InvitationView {...props} preview={requiring} signedIn />)).toContain(
      `<p>${line}</p>`
    )
    // Outside the workspace's allowed domains: said, and nothing to accept or sign in for.
    const outside = { ...(preview as object), domainAllowed: false } as never
    const refusal = "Den här arbetsytan tar inte längre emot inbjudningar till den här adressen."
    const signedInHtml = renderIn("sv", <InvitationView {...props} preview={outside} signedIn />)
    expect(signedInHtml).toContain(refusal)
    expect(signedInHtml).not.toContain(">Acceptera</button>")
    expect(signedInHtml).toContain(">Logga ut</button>")
    const signedOutHtml = renderIn(
      "sv",
      <InvitationView {...props} preview={outside} signedIn={false} />
    )
    expect(signedOutHtml).toContain(refusal)
    expect(signedOutHtml).not.toContain(">Logga in</a>")
    const english = renderIn("en", <InvitationView {...props} preview={outside} signedIn />)
    expect(english).toContain("This workspace no longer accepts invitations to this address.")
    const allowed = { ...(preview as object), domainAllowed: true } as never
    const allowedHtml = renderIn("sv", <InvitationView {...props} preview={allowed} signedIn />)
    expect(allowedHtml).toContain(">Acceptera</button>")
    expect(allowedHtml).not.toContain(refusal)
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
    const html = renderIn("en", <TwoFactorRequiredView {...props} others={others} />, ["app", "ui"])
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
      ["app", "ui"]
    )
    expect(html).toMatch(new RegExp(`wrap-anywhere[^"]*"[^>]*>${long}</span>`))
    expect(html).toContain(`>No longer need ${long}?</p>`)
    expect(html).not.toContain("whitespace-normal")
    expect(html).not.toMatch(new RegExp(`>[^<]*${long}[^<]*</button>`))
  })

  test("the only workspace: a link to create another instead, in Swedish", () => {
    const html = renderIn("sv", <TwoFactorRequiredView {...props} others={[]} />, ["app", "ui"])
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
