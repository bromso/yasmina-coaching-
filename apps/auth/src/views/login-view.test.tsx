import { describe, expect, mock, test } from "bun:test"
import { authTranslator } from "@/lib/i18n"
import { loginNotice } from "@/lib/login-notice"
import { renderIn } from "@/test-intl"

// The view's forms import their server actions, which reach @repo/session: `server-only` throws
// outside a react-server bundle, so stub it before the dynamic import below.
mock.module("server-only", () => ({}))
const { LoginView } = await import("./login-view")

const view = (props: Partial<Parameters<typeof LoginView>[0]> = {}) => (
  <LoginView providers={[]} user={null} continueHref="http://app.brand.localhost:3001" {...props} />
)

describe("LoginView", () => {
  test("in Swedish: headings, labels, buttons, links and the terms note", () => {
    const html = renderIn("sv", view({ providers: ["github"], notice: "Du är utloggad." }))
    for (const text of [
      "Välkommen tillbaka",
      "Logga in med ett anslutet konto eller med din e-post",
      "Logga in med GitHub",
      "Eller fortsätt med",
      ">E-post</label>",
      'placeholder="namn@exempel.se"',
      ">Lösenord</label>",
      "Glömt lösenordet?",
      'aria-label="Visa lösenord"',
      ">Logga in</button>",
      "Eller få en länk via e-post",
      'aria-label="Mejla mig en inloggningslänk"',
      "Har du inget konto? ",
      ">Skapa ett</a>",
      ">användarvillkor</a>",
      ">integritetspolicy</a>",
      "Du är utloggad.",
    ]) {
      expect(html).toContain(text)
    }
    expect(html).not.toContain("Welcome back")
    expect(html).not.toContain("Forgot your password?")
  })

  test("in English it reads as it always has", () => {
    const html = renderIn("en", view())
    for (const text of [
      "Welcome back",
      "Sign in with your email",
      ">Email</label>",
      'placeholder="m@example.com"',
      "Forgot your password?",
      ">Login</button>",
      "Or get a link by email",
      "Don&#x27;t have an account? ",
      ">Sign up</a>",
      "By clicking continue, you agree to our ",
      ">Terms of Service</a>",
    ]) {
      expect(html).toContain(text)
    }
  })

  // The login page's `?reauth=1` case: a signed-in visitor (e.g. before two-step setup) still gets
  // the sign-in form, with a notice explaining why — the page keeps `user` null for this, so the
  // view itself needs no `reauth` prop.
  test("reauth: the sign-in form, not the signed-in card, with its own notice", () => {
    const html = renderIn("en", view({ notice: "Sign in again to continue." }))
    expect(html).toContain(">Email</label>")
    expect(html).toContain("Sign in again to continue.")
    expect(html).not.toContain("You are signed in")
  })

  test("deleted=1: the deletion notice above the sign-in form", () => {
    const notice = loginNotice({ deleted: "1" }, authTranslator("sv"))
    const html = renderIn("sv", view({ notice }))
    expect(html).toContain("Ditt konto är schemalagt för radering. Logga in för att avbryta.")
    expect(html).toContain(">E-post</label>")
  })

  test("the signed-in card, in Swedish", () => {
    const user = {
      id: 1,
      email: "ada@example.com",
      name: "Ada",
      createdAt: "2026-01-01T00:00:00.000Z",
      emailVerified: true,
      hasPassword: true,
      superadmin: false,
      avatarUrl: null,
      locale: "sv" as const,
      deletionScheduledAt: null,
      passkeys: 0,
      twoFactorSatisfied: false,
    }
    const html = renderIn("sv", view({ user }))
    expect(html).toContain("Du är inloggad")
    expect(html).toContain("Ada (ada@example.com)")
    expect(html).toContain(">Fortsätt</a>")
    expect(html).toContain("Logga ut")
  })
})
