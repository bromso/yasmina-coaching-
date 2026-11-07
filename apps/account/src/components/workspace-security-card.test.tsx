import { describe, expect, mock, test } from "bun:test"
import type { Role } from "@repo/api-contract"
import { accountTranslator } from "@/lib/i18n"
import { renderIn } from "@/test-intl"

// The card imports its server action, which reaches @repo/session (`server-only`).
mock.module("server-only", () => ({}))
const {
  REQUIRE_TWO_FACTOR_CONFIRM_ID,
  REQUIRE_TWO_FACTOR_ID,
  SecurityConfirm,
  WorkspaceSecurityCard,
} = await import("./workspace-security-card")

const card = (
  role: Role,
  {
    required = false,
    count,
    impersonating = false,
    locale = "en",
  }: { required?: boolean; count?: number; impersonating?: boolean; locale?: "en" | "sv" } = {}
) =>
  renderIn(
    locale,
    <WorkspaceSecurityCard
      workspaceId={5}
      role={role}
      requireTwoFactor={required}
      membersWithoutTwoFactor={count}
      isImpersonating={impersonating}
    />
  )

describe("WorkspaceSecurityCard", () => {
  test("owner: the checkbox, its label and hint, the count, and a plain save (works without JS)", () => {
    const html = card("owner", { count: 2 })
    expect(html).toContain(">Two-step verification isn&#x27;t required.</p>")
    expect(html).toContain(">2 members don&#x27;t have two-step verification yet.</p>")
    expect(html).toMatch(
      new RegExp(`<input id="${REQUIRE_TWO_FACTOR_ID}" type="checkbox"[^>]*name="requireTwoFactor"`)
    )
    expect(html).not.toContain("checked")
    expect(html).toContain(`for="${REQUIRE_TWO_FACTOR_ID}"`)
    expect(html).toContain(">Require two-step verification for all members</label>")
    expect(html).toContain('<input type="hidden" name="stage" value="save"/>')
    expect(html).toContain('<input type="hidden" name="workspaceId" value="5"/>')
    expect(html).toContain(">Save security setting</button>")
    // No confirmation until the action asks for one.
    expect(html).not.toContain(REQUIRE_TWO_FACTOR_CONFIRM_ID)
  })

  test("owner, already required: the box starts checked", () => {
    const html = card("owner", { required: true, count: 0 })
    expect(html).toContain('name="requireTwoFactor" checked=""/>')
    expect(html).toContain(">Two-step verification is required for all members.</p>")
    expect(html).toContain(">Every member has two-step verification.</p>")
  })

  test("admin: the state and the count, read-only", () => {
    const html = card("admin", { required: true, count: 1 })
    expect(html).toContain(">Two-step verification is required for all members.</p>")
    expect(html).toContain(">1 member doesn&#x27;t have two-step verification yet.</p>")
    expect(html).toContain(">Only the owner can change this.</p>")
    expect(html).not.toContain("<form")
    expect(html).not.toContain("<input")
  })

  test("below admin: the state only, never a count", () => {
    for (const role of ["viewer", "member"] as const) {
      const html = card(role, { required: true })
      expect(html).toContain(">Two-step verification is required for all members.</p>")
      expect(html).not.toContain("have two-step verification")
      expect(html).not.toContain("<form")
    }
  })

  test("an impersonated owner: read-only, saying why", () => {
    const html = card("owner", { count: 3, impersonating: true })
    expect(html).not.toContain("<form")
    expect(html).toContain(">Not available while impersonating.</p>")
    expect(html).toContain(">3 members don&#x27;t have two-step verification yet.</p>")
  })

  test("in Swedish", () => {
    const html = card("owner", { count: 2, locale: "sv" })
    expect(html).toContain(">Kräv tvåstegsverifiering för alla medlemmar</label>")
    expect(html).toContain(">Spara säkerhetsinställningen</button>")
    expect(html).toContain(">2 medlemmar har inte tvåstegsverifiering än.</p>")
    expect(card("viewer", { locale: "sv" })).toContain(">Tvåstegsverifiering krävs inte.</p>")
  })
})

describe("SecurityConfirm", () => {
  const confirm = (count: number, locale: "en" | "sv" = "en") =>
    renderIn(
      locale,
      <SecurityConfirm count={count} workspaceId={5} action={() => undefined} pending={false} />
    )

  test("names how many would be blocked; Turn on and Keep it off are separate no-JS forms", () => {
    const html = confirm(2)
    expect(html).toContain(
      `<p id="${REQUIRE_TWO_FACTOR_CONFIRM_ID}" tabindex="-1" class="font-medium">2 members will be blocked until they turn on two-step verification.</p>`
    )
    expect(html.match(/<form/g)).toHaveLength(2)
    expect(html).toContain(
      '<input type="hidden" name="requireTwoFactor" value="on"/><input type="hidden" name="stage" value="confirm"/>'
    )
    expect(html).toContain('<input type="hidden" name="stage" value="cancel"/>')
    expect(html).toContain(">Turn on requirement</button>")
    expect(html).toContain(">Keep it off</button>")
    expect(html).not.toContain(">Cancel</button>")
    expect(html).toContain(`aria-describedby="${REQUIRE_TWO_FACTOR_CONFIRM_ID}"`)
  })

  test("one member, none, and Swedish", () => {
    expect(confirm(1)).toContain(
      ">1 member will be blocked until they turn on two-step verification.<"
    )
    expect(confirm(0)).toContain(
      ">No members will be blocked: everyone already has two-step verification.<"
    )
    const sv = confirm(3, "sv")
    expect(sv).toContain(">3 medlemmar spärras tills de slår på tvåstegsverifiering.<")
    expect(sv).toContain(">Slå på kravet</button>")
    expect(sv).toContain(">Behåll avstängt</button>")
  })
})

describe("the confirmation's buttons are named apart from the rest of the Workspace page", () => {
  test("Keep it off never shares a name with the API keys or webhooks rows' armed Cancel", () => {
    for (const locale of ["en", "sv"] as const) {
      const t = accountTranslator(locale)
      const ours = [t("workspaceSecurity.keepOff"), t("workspaceSecurity.turnOn")]
      const theirs = [t("apiKeys.cancel"), t("webhooks.cancel"), t("workspaceSecurity.save")]
      for (const name of ours) expect(theirs).not.toContain(name)
    }
  })
})
