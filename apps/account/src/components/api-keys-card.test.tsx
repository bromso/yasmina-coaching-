import { describe, expect, mock, test } from "bun:test"
import type { ApiKeySummary } from "@repo/api-contract"
import { renderIn } from "@/test-intl"

// The card imports its server actions, which reach @repo/session (`server-only`).
mock.module("server-only", () => ({}))
const { ApiKeysCard, CreatedKeyPanel } = await import("./api-keys-card")

const key = (overrides: Partial<ApiKeySummary> = {}): ApiKeySummary => ({
  id: 7,
  name: "CI bot",
  prefix: "abcd1234",
  scopes: ["notes:read", "notes:write"],
  createdBy: { id: 1, name: "Ada" },
  creatorLeft: false,
  createdAt: "2026-03-01T00:00:00.000Z",
  expiresAt: "2026-06-01T00:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
  status: "active",
  ...overrides,
})

describe("ApiKeysCard, server render (before hydration)", () => {
  test("lists the key's name, prefix, scopes, creator, dates and status", () => {
    const html = renderIn(
      "en",
      <ApiKeysCard
        apiKeys={[key()]}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain(">CI bot<")
    expect(html).toContain("bb_live_abcd1234_…")
    expect(html).toContain("Read notes, Create and delete notes")
    expect(html).toContain("Created Mar 1, 2026 by Ada")
    expect(html).toContain("Last used Never")
    expect(html).toContain("Expires Jun 1, 2026")
    expect(html).toContain(">Active<")
    // Not pre-armed: a plain submit labelled Revoke, never the confirm label.
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Revoke<\/button>/)
    expect(html).not.toContain("Confirm revoke")
  })

  test("a creator who left the workspace reads as a former member", () => {
    const html = renderIn(
      "en",
      <ApiKeysCard
        apiKeys={[key({ creatorLeft: true })]}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("Created Mar 1, 2026 by Former member")
    expect(html).not.toContain(">Ada<")
  })

  test("a purged creator (createdBy null) also reads as a former member", () => {
    const html = renderIn(
      "en",
      <ApiKeysCard
        apiKeys={[key({ createdBy: null, creatorLeft: true })]}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("Created Mar 1, 2026 by Former member")
  })

  test("never used and never expires read as Never, not a date", () => {
    const html = renderIn(
      "en",
      <ApiKeysCard
        apiKeys={[key({ lastUsedAt: null, expiresAt: null })]}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("Last used Never")
    expect(html).toContain("Expires Never")
  })

  test("an expired or revoked key shows its status but offers no Revoke button", () => {
    for (const status of ["expired", "revoked"] as const) {
      const html = renderIn(
        "en",
        <ApiKeysCard
          apiKeys={[key({ status })]}
          workspaceId={5}
          isImpersonating={false}
          locale="en"
          docsUrl="https://docs.brand.localhost:3004"
        />
      )
      expect(html).not.toContain(">Revoke<")
    }
  })

  test("the empty state", () => {
    const html = renderIn(
      "en",
      <ApiKeysCard
        apiKeys={[]}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("No API keys yet.")
  })

  test("while impersonating: read-only, no create form, the list stays visible", () => {
    const html = renderIn(
      "en",
      <ApiKeysCard
        apiKeys={[key()]}
        workspaceId={5}
        isImpersonating
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain(">CI bot<")
    expect(html).toContain("Not available while impersonating.")
    expect(html).not.toContain(">Create key</button>")
    // The row's own Revoke form is still server-rendered, but its button is disabled.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Revoke<\/button>/)
  })

  test("the arming status region is mounted, empty, before any row is armed", () => {
    const html = renderIn(
      "en",
      <ApiKeysCard
        apiKeys={[key()]}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain('<p role="status" class="sr-only"></p>')
  })

  // Regression for a bug where the revoke form carried only the key's own `id`: with no
  // `workspaceId` field, the server action's `sameWorkspace` check always failed, and every
  // revoke answered "Switch to that workspace first" without ever calling the api. Every row's
  // form must carry both hidden fields, the same way `MembersList` / `InvitationsList` /
  // `DangerZone`'s row forms do.
  test("the row's revoke form carries both the workspace and the key as hidden fields", () => {
    const html = renderIn(
      "en",
      <ApiKeysCard
        apiKeys={[key()]}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    const form = html.match(/<form[^>]*>[\s\S]*?<\/form>/)?.[0]
    expect(form).toBeDefined()
    expect(form).toContain('<input type="hidden" name="workspaceId" value="5"/>')
    expect(form).toContain('<input type="hidden" name="id" value="7"/>')
  })

  test("a second key in a different list still carries its own workspace id", () => {
    const html = renderIn(
      "en",
      <ApiKeysCard
        apiKeys={[key()]}
        workspaceId={42}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    const form = html.match(/<form[^>]*>[\s\S]*?<\/form>/)?.[0]
    expect(form).toContain('<input type="hidden" name="workspaceId" value="42"/>')
  })
})

describe("the create form", () => {
  test("no scope starts ticked, the expiry select defaults to 90 days with a no-expiry option", () => {
    const html = renderIn(
      "en",
      <ApiKeysCard
        apiKeys={[]}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    // Every scope checkbox exists, and none is checked — the expiry select is the only control
    // with a pre-selected option.
    expect(
      html.match(/<input type="checkbox"[^>]*>/g)?.every((tag) => !tag.includes("checked"))
    ).toBe(true)
    expect(html).toContain('value="workspace:read"')
    expect(html).toContain('value="members:read"')
    expect(html).toContain('value="notes:read"')
    expect(html).toContain('value="notes:write"')
    expect(html).toContain("Read workspace details")
    expect(html).toContain("Create and delete notes")
    expect(html).toContain('<option value="90" selected="">90 days</option>')
    expect(html).toContain('<option value="none">No expiry</option>')
    expect(html).toContain(">Create key</button>")
  })

  test("the no-expiry warning is pure CSS, reacting to the select's own :checked state", () => {
    const html = renderIn(
      "en",
      <ApiKeysCard
        apiKeys={[]}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    // Hidden by default; a `group-has-*` variant (no JavaScript) reveals it only when the "No
    // expiry" option is the one selected, exactly as the browser's own select state changes.
    expect(html).toContain("group-has-[option[value=none]:checked]:block")
    expect(html).toContain("A key with no expiry keeps working until you revoke it.")
  })

  test("the checkboxes are native, not the Radix component that needs hydration to submit", () => {
    const html = renderIn(
      "en",
      <ApiKeysCard
        apiKeys={[]}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toMatch(/<input type="checkbox"[^>]*name="scopes"[^>]*value="notes:read"/)
  })

  test("in Swedish, the card's labels and the default expiry option", () => {
    const html = renderIn(
      "sv",
      <ApiKeysCard
        apiKeys={[]}
        workspaceId={5}
        isImpersonating={false}
        locale="sv"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("Inga API-nycklar än.")
    expect(html).toContain(">Skapa nyckel</button>")
    expect(html).toContain('<option value="none">Ingen utgång</option>')
    expect(html).toContain(
      "En nyckel utan utgångsdatum fortsätter fungera tills du återkallar den."
    )
  })
})

describe("the show-once panel", () => {
  const fakeKey = "bb_live_abcd1234_ODjfcRNL2EDLbdDZ1c5jAU2rjTbrNLwMtshF6PwKluY" // gitleaks:allow

  test("Done is a plain link back to /workspace, so it works without JavaScript", () => {
    const html = renderIn("en", <CreatedKeyPanel keyValue={fakeKey} onDone={() => {}} />)
    // A GET of /workspace discards the create form's POST result (and the key with it); a button
    // with only an onClick would do nothing before hydration.
    expect(html).toMatch(/<a[^>]*href="\/workspace"[^>]*>Done<\/a>/)
    expect(html).not.toMatch(/<button[^>]*>Done<\/button>/)
    // The key is shown in the read-only input, never put in the link.
    expect(html).toContain(`value="${fakeKey}"`)
    expect(html.match(/href="[^"]*"/g)?.some((href) => href.includes("bb_live_"))).toBe(false)
  })

  test("in Swedish", () => {
    const html = renderIn("sv", <CreatedKeyPanel keyValue={fakeKey} onDone={() => {}} />)
    expect(html).toMatch(/<a[^>]*href="\/workspace"[^>]*>Klar<\/a>/)
  })
})

describe("without the create form (a workspace without the api feature)", () => {
  test("the list stays, each active key with its Revoke button; no create form", () => {
    const html = renderIn(
      "en",
      <ApiKeysCard
        apiKeys={[key()]}
        workspaceId={5}
        isImpersonating={false}
        canCreate={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain(">CI bot<")
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Revoke<\/button>/)
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>Revoke<\/button>/)
    expect(html).not.toContain(">Create key</button>")
    expect(html).not.toContain('name="scopes"')
  })
})

describe("the developer docs link", () => {
  test("points at docsUrl, with text naming API keys specifically (not the Webhooks card's text)", () => {
    const html = renderIn(
      "en",
      <ApiKeysCard
        apiKeys={[]}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004/developers/authentication"
      />
    )
    expect(html).toMatch(
      /<a href="https:\/\/docs\.brand\.localhost:3004\/developers\/authentication"[^>]*>Read the API key docs<\/a>/
    )
  })

  test("in Swedish", () => {
    const html = renderIn(
      "sv",
      <ApiKeysCard
        apiKeys={[]}
        workspaceId={5}
        isImpersonating={false}
        locale="sv"
        docsUrl="https://docs.brand.localhost:3004/developers/authentication"
      />
    )
    expect(html).toContain(">Läs dokumentationen om API-nycklar</a>")
  })
})
