import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import {
  type ApiKeySummary,
  entitlementsFor,
  IMAGE_UPLOAD_MESSAGE,
  type Invitation,
  MAX_IMAGE_BYTES,
  OWNER_TWO_FACTOR_MESSAGE,
  OWNER_TWO_FACTOR_REASON,
  type WebhookEndpoint,
  type WorkspaceSummary,
} from "@repo/api-contract"
import {
  INVITE_DOMAIN_RESTRICTED_MESSAGE,
  INVITE_DOMAINS_INVALID_MESSAGE,
  INVITE_DOMAINS_LIMIT_MESSAGE,
} from "@repo/api-contract/invite-domains"
import { createFormatter } from "next-intl"
import { accountTranslator } from "./i18n"
import { conjunction } from "./invite-domains"
import {
  createApiKeyCore,
  createWebhookCore,
  deleteWebhookCore,
  deleteWorkspaceCore,
  inviteCore,
  leaveCore,
  removeLogoCore,
  removeMemberCore,
  renameWorkspaceCore,
  revokeApiKeyCore,
  revokeInvitationCore,
  rotateWebhookSecretCore,
  sameWorkspace,
  setInviteDomainsCore,
  setLogoCore,
  setRoleCore,
  setWorkspaceSecurityCore,
  testWebhookCore,
  transferOwnershipCore,
  updateWebhookCore,
  type WorkspaceApi,
  type WorkspaceDeps,
} from "./workspace-actions"

const workspace: WorkspaceSummary = {
  id: 5,
  name: "Acme",
  slug: "acme",
  createdAt: "2026-01-01T00:00:00.000Z",
  role: "owner",
  memberCount: 2,
  entitlements: entitlementsFor({ subscription: null, memberCount: 2, portalAvailable: false }),
  logoUrl: null,
  requireTwoFactor: false,
}
const invitation: Invitation = {
  id: 9,
  email: "grace@example.com",
  role: "member",
  invitedBy: { name: "Ada" },
  expiresAt: "2026-01-08T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
}
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
/** Like `form`, but a field given as an array is `append`ed once per item — for the create form's
 * `scopes` checkboxes, which a browser sends as repeated fields of the same name. */
const formArr = (fields: Record<string, string | string[]>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) for (const item of v) fd.append(k, item)
    else fd.set(k, v)
  }
  return fd
}
const defined = (code: string, message: string) => new ORPCError(code, { message, defined: true })
const fail = (code: string, message: string) => async () => {
  throw defined(code, message)
}

const apiKey: ApiKeySummary = {
  id: 3,
  name: "CI bot",
  prefix: "abcd1234",
  scopes: ["notes:read"],
  createdBy: { id: 1, name: "Ada" },
  creatorLeft: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-04-01T00:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
  status: "active",
}

const webhookEndpoint: WebhookEndpoint = {
  id: 11,
  url: "https://example.com/hooks/bb",
  description: "Our CI",
  events: ["note.created"],
  enabled: true,
  disabledReason: null,
  disabledAt: null,
  consecutiveFailures: 0,
  createdBy: { id: 1, name: "Ada" },
  createdAt: "2026-01-01T00:00:00.000Z",
  lastDelivery: null,
}

/** A complete fake api; each test overrides the one procedure it exercises. */
const fakeApi: WorkspaceApi = {
  update: async (input) => ({ ...workspace, name: input.name }),
  delete: async () => undefined,
  leave: async () => undefined,
  transferOwnership: async () => undefined,
  members: { setRole: async () => undefined, remove: async () => undefined },
  invitations: { create: async () => invitation, revoke: async () => undefined },
  logo: {
    set: async () => ({ logoUrl: "/files/logos/5/x.png" }),
    remove: async () => ({ ok: true }),
  },
  apiKeys: {
    create: async () => ({ key: "bb_live_abcd1234_secret", apiKey }), // gitleaks:allow
    revoke: async () => undefined,
  },
  webhooks: {
    create: async () => ({ secret: "whsec_abcd1234secret", endpoint: webhookEndpoint }), // gitleaks:allow
    update: async () => webhookEndpoint,
    rotateSecret: async () => ({ secret: "whsec_newsecret1234" }), // gitleaks:allow
    delete: async () => undefined,
    test: async () => ({ eventId: "msg_abcdefghijklmnop" }),
  },
  security: {
    get: async () => ({ requireTwoFactor: false, membersWithoutTwoFactor: 2, inviteDomains: [] }),
    set: async (input) => ({ requireTwoFactor: input.requireTwoFactor }),
    setInviteDomains: async () => ({ inviteDomains: [] }),
  },
}
const deps = (api: Partial<WorkspaceApi> = {}): WorkspaceDeps => ({
  api: { ...fakeApi, ...api },
  workspaceId: workspace.id,
})
/** Records the input of the procedure it replaces. */
function spy() {
  const calls: unknown[] = []
  return {
    calls,
    fn: async (input: unknown) => {
      calls.push(input)
      return undefined
    },
  }
}
/** A `File` of the given byte size. */
const file = (size: number, name = "logo.png") =>
  new File([new Uint8Array(size)], name, { type: "image/png" })

describe("setLogoCore", () => {
  test("no file is a field error and never reaches the api", async () => {
    const s = spy()
    const d = deps({ logo: { ...fakeApi.logo, set: s.fn as never } })
    expect(await setLogoCore(d, form({}))).toEqual({
      ok: false,
      fieldErrors: { file: "Choose an image." },
    })
    expect(s.calls).toEqual([])
  })
  test("a file over MAX_IMAGE_BYTES is a field error and never reaches the api", async () => {
    const s = spy()
    const d = deps({ logo: { ...fakeApi.logo, set: s.fn as never } })
    const fd = new FormData()
    fd.set("file", file(MAX_IMAGE_BYTES + 1))
    expect(await setLogoCore(d, fd)).toEqual({
      ok: false,
      fieldErrors: { file: IMAGE_UPLOAD_MESSAGE },
    })
    expect(s.calls).toEqual([])
  })
  test("scopes the call to the current workspace and names the api's logoUrl on success", async () => {
    const s = spy()
    const d = deps({ logo: { ...fakeApi.logo, set: s.fn as never } })
    const fd = new FormData()
    fd.set("file", file(100))
    expect(await setLogoCore(d, fd)).toEqual({ ok: true, message: "Logo updated." })
    expect(s.calls).toEqual([{ workspaceId: 5, file: expect.any(File) }])
  })
  test("the api's BAD_REQUEST is a field error", async () => {
    const d = deps({
      logo: { ...fakeApi.logo, set: fail("BAD_REQUEST", IMAGE_UPLOAD_MESSAGE) },
    })
    const fd = new FormData()
    fd.set("file", file(100))
    expect(await setLogoCore(d, fd)).toEqual({
      ok: false,
      fieldErrors: { file: IMAGE_UPLOAD_MESSAGE },
    })
  })
  test("FORBIDDEN is a form message", async () => {
    const d = deps({
      logo: { ...fakeApi.logo, set: fail("FORBIDDEN", "Requires the admin role") },
    })
    const fd = new FormData()
    fd.set("file", file(100))
    expect(await setLogoCore(d, fd)).toEqual({ ok: false, message: "Requires the admin role" })
  })
  test("NOT_FOUND (lost membership in another tab) is a form message", async () => {
    const d = deps({
      logo: { ...fakeApi.logo, set: fail("NOT_FOUND", "Workspace not found") },
    })
    const fd = new FormData()
    fd.set("file", file(100))
    expect(await setLogoCore(d, fd)).toEqual({ ok: false, message: "Workspace not found" })
  })
  test("SERVICE_UNAVAILABLE (storage down) is the api's own message, not 'unavailable'", async () => {
    const d = deps({
      logo: {
        ...fakeApi.logo,
        set: fail("SERVICE_UNAVAILABLE", "File storage is unavailable, try again later"),
      },
    })
    const fd = new FormData()
    fd.set("file", file(100))
    expect(await setLogoCore(d, fd)).toEqual({
      ok: false,
      message: "File storage is unavailable, try again later",
    })
  })
})

describe("removeLogoCore", () => {
  test("removes the current workspace's logo", async () => {
    const s = spy()
    const d = deps({ logo: { ...fakeApi.logo, remove: s.fn as never } })
    expect(await removeLogoCore(d, form({}))).toEqual({ ok: true, message: "Logo removed." })
    expect(s.calls).toEqual([{ workspaceId: 5 }])
  })
  test("FORBIDDEN is a form message", async () => {
    const d = deps({
      logo: { ...fakeApi.logo, remove: fail("FORBIDDEN", "Requires the admin role") },
    })
    expect(await removeLogoCore(d, form({}))).toEqual({
      ok: false,
      message: "Requires the admin role",
    })
  })
  test("NOT_FOUND (lost membership in another tab) is a form message", async () => {
    const d = deps({
      logo: { ...fakeApi.logo, remove: fail("NOT_FOUND", "Workspace not found") },
    })
    expect(await removeLogoCore(d, form({}))).toEqual({
      ok: false,
      message: "Workspace not found",
    })
  })
})

describe("renameWorkspaceCore", () => {
  test("trims the name and scopes the call to the current workspace", async () => {
    let seen: unknown
    const d = deps({
      update: async (input) => {
        seen = input
        return { ...workspace, name: input.name }
      },
    })
    expect(await renameWorkspaceCore(d, form({ name: "  Acme Inc " }))).toEqual({
      ok: true,
      message: "Workspace renamed.",
    })
    expect(seen).toEqual({ workspaceId: 5, name: "Acme Inc" })
  })
  test("an empty name is a field error and never reaches the api", async () => {
    const s = spy()
    const out = await renameWorkspaceCore(deps({ update: s.fn as never }), form({ name: "  " }))
    expect(out).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String) } })
    expect(s.calls).toEqual([])
  })
  test("FORBIDDEN passes the api's message through", async () => {
    const out = await renameWorkspaceCore(
      deps({ update: fail("FORBIDDEN", "Requires a higher role") }),
      form({ name: "Acme" })
    )
    expect(out).toEqual({ ok: false, message: "Requires a higher role", values: { name: "Acme" } })
  })
})

describe("inviteCore", () => {
  test("sends and names the address", async () => {
    let seen: unknown
    const d = deps({
      invitations: {
        ...fakeApi.invitations,
        create: async (input) => {
          seen = input
          return invitation
        },
      },
    })
    expect(await inviteCore(d, form({ email: "grace@example.com", role: "member" }))).toEqual({
      ok: true,
      message: "Invitation sent to grace@example.com.",
    })
    expect(seen).toEqual({ workspaceId: 5, email: "grace@example.com", role: "member" })
  })
  test("a bad email or the owner role is a field error before the api", async () => {
    const s = spy()
    const d = deps({ invitations: { ...fakeApi.invitations, create: s.fn as never } })
    expect(await inviteCore(d, form({ email: "nope", role: "member" }))).toMatchObject({
      ok: false,
      fieldErrors: { email: expect.any(String) },
      values: { email: "nope", role: "member" },
    })
    expect(await inviteCore(d, form({ email: "a@example.com", role: "owner" }))).toMatchObject({
      ok: false,
      fieldErrors: { role: expect.any(String) },
    })
    expect(s.calls).toEqual([])
  })
  test("CONFLICT, TOO_MANY_REQUESTS and FORBIDDEN pass through", async () => {
    for (const [code, message] of [
      ["CONFLICT", "Already a member"],
      ["TOO_MANY_REQUESTS", "Too many invitations, try again in an hour"],
      ["FORBIDDEN", "Requires a higher role"],
    ]) {
      const d = deps({ invitations: { ...fakeApi.invitations, create: fail(code, message) } })
      expect(await inviteCore(d, form({ email: "a@example.com", role: "viewer" }))).toEqual({
        ok: false,
        message,
        values: { email: "a@example.com", role: "viewer" },
      })
    }
  })
})

describe("setRoleCore", () => {
  test("sets the role on the submitted member", async () => {
    const s = spy()
    const d = deps({ members: { ...fakeApi.members, setRole: s.fn as never } })
    expect(await setRoleCore(d, form({ userId: "3", role: "admin" }))).toEqual({
      ok: true,
      message: "Role updated.",
    })
    expect(s.calls).toEqual([{ workspaceId: 5, userId: 3, role: "admin" }])
  })
  test("owner is never set here, and a garbage id never reaches the api", async () => {
    const s = spy()
    const d = deps({ members: { ...fakeApi.members, setRole: s.fn as never } })
    expect(await setRoleCore(d, form({ userId: "3", role: "owner" }))).toEqual({
      ok: false,
      message: "Choose a viewer, member or admin role",
    })
    expect(await setRoleCore(d, form({ userId: "3" }))).toEqual({
      ok: false,
      message: "Choose a viewer, member or admin role",
    })
    expect(await setRoleCore(d, form({ userId: "x", role: "admin" }))).toEqual({
      ok: false,
      message: "Not a member of this workspace",
    })
    expect(await setRoleCore(d, form({ role: "admin" }))).toEqual({
      ok: false,
      message: "Not a member of this workspace",
    })
    expect(s.calls).toEqual([])
  })
  test("an admin touching an owner gets the api's FORBIDDEN message", async () => {
    const d = deps({
      members: { ...fakeApi.members, setRole: fail("FORBIDDEN", "Requires the owner role") },
    })
    expect(await setRoleCore(d, form({ userId: "1", role: "viewer" }))).toEqual({
      ok: false,
      message: "Requires the owner role",
    })
  })
})

describe("removeMemberCore", () => {
  test("a junk or missing id never reaches the api", async () => {
    const s = spy()
    const d = deps({ members: { ...fakeApi.members, remove: s.fn as never } })
    for (const fd of [form({ userId: "x" }), form({})])
      expect(await removeMemberCore(d, fd)).toEqual({
        ok: false,
        message: "Not a member of this workspace",
      })
    expect(s.calls).toEqual([])
  })
  test("removes the submitted member", async () => {
    const s = spy()
    const d = deps({ members: { ...fakeApi.members, remove: s.fn as never } })
    expect(await removeMemberCore(d, form({ userId: "3" }))).toEqual({
      ok: true,
      message: "Member removed.",
    })
    expect(s.calls).toEqual([{ workspaceId: 5, userId: 3 }])
  })
  test("a non-member is the api's BAD_REQUEST message", async () => {
    const d = deps({
      members: {
        ...fakeApi.members,
        remove: fail("BAD_REQUEST", "Not a member of this workspace"),
      },
    })
    expect(await removeMemberCore(d, form({ userId: "99" }))).toEqual({
      ok: false,
      message: "Not a member of this workspace",
    })
  })
})

describe("leaveCore", () => {
  test("leaves and flags it", async () => {
    const s = spy()
    expect(await leaveCore(deps({ leave: s.fn as never }))).toEqual({
      ok: true,
      left: true,
      message: "You left the workspace.",
    })
    expect(s.calls).toEqual([{ workspaceId: 5 }])
  })
  test("the last owner gets the api's CONFLICT message", async () => {
    const d = deps({ leave: fail("CONFLICT", "Transfer ownership before leaving.") })
    expect(await leaveCore(d)).toEqual({ ok: false, message: "Transfer ownership before leaving." })
  })
})

describe("revokeInvitationCore", () => {
  test("a junk or missing id never reaches the api", async () => {
    const s = spy()
    const d = deps({ invitations: { ...fakeApi.invitations, revoke: s.fn as never } })
    for (const fd of [form({ invitationId: "-1" }), form({})])
      expect(await revokeInvitationCore(d, fd)).toEqual({
        ok: false,
        message: "Invitation not found",
      })
    expect(s.calls).toEqual([])
  })
  test("revokes the submitted invitation", async () => {
    const s = spy()
    const d = deps({ invitations: { ...fakeApi.invitations, revoke: s.fn as never } })
    expect(await revokeInvitationCore(d, form({ invitationId: "9" }))).toEqual({
      ok: true,
      message: "Invitation revoked.",
    })
    expect(s.calls).toEqual([{ workspaceId: 5, id: 9 }])
  })
  test("NOT_FOUND passes through", async () => {
    const d = deps({
      invitations: { ...fakeApi.invitations, revoke: fail("NOT_FOUND", "Invitation not found") },
    })
    expect(await revokeInvitationCore(d, form({ invitationId: "9" }))).toEqual({
      ok: false,
      message: "Invitation not found",
    })
  })
})

describe("createApiKeyCore", () => {
  test("creates and returns the full key, exactly once", async () => {
    let seen: unknown
    const d = deps({
      apiKeys: {
        ...fakeApi.apiKeys,
        create: async (input) => {
          seen = input
          return { key: "bb_live_abcd1234_secret", apiKey } // gitleaks:allow
        },
      },
    })
    const out = await createApiKeyCore(
      d,
      formArr({ name: "CI bot", scopes: ["notes:read"], expiresInDays: "90" })
    )
    expect(out).toEqual({ ok: true, key: "bb_live_abcd1234_secret", apiKey }) // gitleaks:allow
    expect(seen).toEqual({
      workspaceId: 5,
      name: "CI bot",
      scopes: ["notes:read"],
      expiresInDays: 90,
    })
  })

  test('"no expiry" sends null, never the string the select carries', async () => {
    let seen: unknown
    const d = deps({
      apiKeys: {
        ...fakeApi.apiKeys,
        create: async (input) => {
          seen = input
          return { key: "bb_live_abcd1234_secret", apiKey } // gitleaks:allow
        },
      },
    })
    await createApiKeyCore(
      d,
      formArr({ name: "CI bot", scopes: ["notes:read"], expiresInDays: "none" })
    )
    expect((seen as { expiresInDays: unknown }).expiresInDays).toBeNull()
  })

  test("a blank name or no scope is a field error before the api", async () => {
    const s = spy()
    const d = deps({ apiKeys: { ...fakeApi.apiKeys, create: s.fn as never } })
    expect(
      await createApiKeyCore(d, formArr({ name: "", scopes: ["notes:read"], expiresInDays: "90" }))
    ).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String) } })
    expect(
      await createApiKeyCore(d, formArr({ name: "CI bot", scopes: [], expiresInDays: "90" }))
    ).toMatchObject({ ok: false, fieldErrors: { scopes: expect.any(String) } })
    expect(s.calls).toEqual([])
  })

  test("a tampered expiry option is a field error before the api", async () => {
    const s = spy()
    const d = deps({ apiKeys: { ...fakeApi.apiKeys, create: s.fn as never } })
    expect(
      await createApiKeyCore(
        d,
        formArr({ name: "CI bot", scopes: ["notes:read"], expiresInDays: "7" })
      )
    ).toMatchObject({ ok: false, fieldErrors: { expiresInDays: expect.any(String) } })
    expect(s.calls).toEqual([])
  })

  test("FORBIDDEN (the feature, role or impersonation) and CONFLICT (the cap) pass through", async () => {
    for (const [code, message] of [
      ["FORBIDDEN", "Upgrade to use the API"],
      ["CONFLICT", "A workspace can have up to 20 active API keys. Revoke one to create another."],
    ]) {
      const d = deps({ apiKeys: { ...fakeApi.apiKeys, create: fail(code, message) } })
      expect(
        await createApiKeyCore(
          d,
          formArr({ name: "CI bot", scopes: ["notes:read"], expiresInDays: "90" })
        )
      ).toEqual({
        ok: false,
        message,
        values: { name: "CI bot", scopes: ["notes:read"], expiresInDays: "90" },
      })
    }
  })
})

describe("revokeApiKeyCore", () => {
  test("a junk or missing id never reaches the api", async () => {
    const s = spy()
    const d = deps({ apiKeys: { ...fakeApi.apiKeys, revoke: s.fn as never } })
    for (const fd of [form({ id: "-1" }), form({})])
      expect(await revokeApiKeyCore(d, fd)).toEqual({ ok: false, message: "API key not found" })
    expect(s.calls).toEqual([])
  })

  test("revokes the submitted key", async () => {
    const s = spy()
    const d = deps({ apiKeys: { ...fakeApi.apiKeys, revoke: s.fn as never } })
    expect(await revokeApiKeyCore(d, form({ id: "3" }))).toEqual({
      ok: true,
      message: "API key revoked.",
    })
    expect(s.calls).toEqual([{ workspaceId: 5, id: 3 }])
  })

  test("NOT_FOUND passes through", async () => {
    const d = deps({
      apiKeys: { ...fakeApi.apiKeys, revoke: fail("NOT_FOUND", "API key not found") },
    })
    expect(await revokeApiKeyCore(d, form({ id: "3" }))).toEqual({
      ok: false,
      message: "API key not found",
    })
  })
})

describe("createWebhookCore", () => {
  test("creates and returns the secret and endpoint, exactly once", async () => {
    let seen: unknown
    const d = deps({
      webhooks: {
        ...fakeApi.webhooks,
        create: async (input) => {
          seen = input
          return { secret: "whsec_abcd1234secret", endpoint: webhookEndpoint } // gitleaks:allow
        },
      },
    })
    const out = await createWebhookCore(
      d,
      formArr({ url: "https://example.com/hooks", description: "Our CI", events: ["note.created"] })
    )
    expect(out).toEqual({ ok: true, secret: "whsec_abcd1234secret", endpoint: webhookEndpoint }) // gitleaks:allow
    expect(seen).toEqual({
      workspaceId: 5,
      url: "https://example.com/hooks",
      description: "Our CI",
      events: ["note.created"],
    })
  })

  test("a blank URL or no event is a field error before the api", async () => {
    const s = spy()
    const d = deps({ webhooks: { ...fakeApi.webhooks, create: s.fn as never } })
    expect(
      await createWebhookCore(d, formArr({ url: "", description: "", events: ["note.created"] }))
    ).toMatchObject({ ok: false, fieldErrors: { url: expect.any(String) } })
    expect(
      await createWebhookCore(
        d,
        formArr({ url: "https://example.com/hooks", description: "", events: [] })
      )
    ).toMatchObject({ ok: false, fieldErrors: { events: expect.any(String) } })
    expect(s.calls).toEqual([])
  })

  test("BAD_REQUEST (the SSRF guard) lands on the url field", async () => {
    const blocked = "That URL points to a private or reserved address. Use a public endpoint."
    const d = deps({
      webhooks: { ...fakeApi.webhooks, create: fail("BAD_REQUEST", blocked) },
    })
    expect(
      await createWebhookCore(
        d,
        formArr({ url: "https://example.com/hooks", description: "", events: ["note.created"] })
      )
    ).toMatchObject({ ok: false, fieldErrors: { url: blocked } })
  })

  test("FORBIDDEN (the feature, role or impersonation) and CONFLICT (the cap) pass through", async () => {
    for (const [code, message] of [
      ["FORBIDDEN", "Upgrade to use webhooks"],
      ["CONFLICT", "A workspace can have up to 10 webhook endpoints. Delete one to add another."],
    ]) {
      const d = deps({ webhooks: { ...fakeApi.webhooks, create: fail(code, message) } })
      expect(
        await createWebhookCore(
          d,
          formArr({ url: "https://example.com/hooks", description: "", events: ["note.created"] })
        )
      ).toMatchObject({ ok: false, message })
    }
  })
})

describe("updateWebhookCore", () => {
  test("a junk or missing id is 'not found' before the api", async () => {
    const s = spy()
    const d = deps({ webhooks: { ...fakeApi.webhooks, update: s.fn as never } })
    for (const fd of [
      formArr({ id: "-1", url: "https://example.com/hooks", events: ["note.created"] }),
      formArr({ url: "https://example.com/hooks", events: ["note.created"] }),
    ]) {
      expect(await updateWebhookCore(d, fd)).toEqual({
        ok: false,
        message: "Webhook endpoint not found",
      })
    }
    expect(s.calls).toEqual([])
  })

  test("submits every field, including an unchecked Enabled as false", async () => {
    let seen: unknown
    const d = deps({
      webhooks: {
        ...fakeApi.webhooks,
        update: async (input) => {
          seen = input
          return webhookEndpoint
        },
      },
    })
    const out = await updateWebhookCore(
      d,
      formArr({
        id: "11",
        url: "https://example.com/hooks",
        description: "Our CI",
        events: ["note.created", "note.deleted"],
      })
    )
    expect(out).toEqual({
      ok: true,
      endpoint: webhookEndpoint,
      message: "Webhook endpoint updated.",
    })
    expect(seen).toEqual({
      workspaceId: 5,
      id: 11,
      url: "https://example.com/hooks",
      description: "Our CI",
      events: ["note.created", "note.deleted"],
      enabled: false,
    })
  })

  test("unticking every event is a field error before the api, whatever else changed", async () => {
    const s = spy()
    const d = deps({ webhooks: { ...fakeApi.webhooks, update: s.fn as never } })
    expect(
      await updateWebhookCore(
        d,
        formArr({ id: "11", url: "https://example.com/changed", events: [] })
      )
    ).toMatchObject({ ok: false, fieldErrors: { events: expect.any(String) } })
    expect(s.calls).toEqual([])
  })

  test("a changed url is forwarded to the api verbatim", async () => {
    let seen: unknown
    const d = deps({
      webhooks: {
        ...fakeApi.webhooks,
        update: async (input) => {
          seen = input
          return webhookEndpoint
        },
      },
    })
    await updateWebhookCore(
      d,
      formArr({
        id: "11",
        url: "https://example.com/new-hooks",
        description: "Our CI",
        events: ["note.created"],
      })
    )
    expect((seen as { url: unknown }).url).toBe("https://example.com/new-hooks")
  })

  test("BAD_REQUEST (the SSRF guard) lands on the url field", async () => {
    const blocked = "That URL points to a private or reserved address. Use a public endpoint."
    const d = deps({ webhooks: { ...fakeApi.webhooks, update: fail("BAD_REQUEST", blocked) } })
    expect(
      await updateWebhookCore(
        d,
        formArr({ id: "11", url: "https://example.com/hooks", events: ["note.created"] })
      )
    ).toMatchObject({ ok: false, fieldErrors: { url: blocked } })
  })

  test("FORBIDDEN and NOT_FOUND pass through", async () => {
    for (const [code, message] of [
      ["FORBIDDEN", "Requires the admin role"],
      ["NOT_FOUND", "Webhook endpoint not found"],
    ]) {
      const d = deps({ webhooks: { ...fakeApi.webhooks, update: fail(code, message) } })
      expect(
        await updateWebhookCore(
          d,
          formArr({ id: "11", url: "https://example.com/hooks", events: ["note.created"] })
        )
      ).toMatchObject({ ok: false, message })
    }
  })
})

describe("rotateWebhookSecretCore", () => {
  test("a junk or missing id never reaches the api", async () => {
    const s = spy()
    const d = deps({ webhooks: { ...fakeApi.webhooks, rotateSecret: s.fn as never } })
    for (const fd of [form({ id: "-1" }), form({})]) {
      expect(await rotateWebhookSecretCore(d, fd)).toEqual({
        ok: false,
        message: "Webhook endpoint not found",
      })
    }
    expect(s.calls).toEqual([])
  })

  test("rotates and returns the new secret", async () => {
    const s = spy()
    const d = deps({
      webhooks: {
        ...fakeApi.webhooks,
        rotateSecret: (async (input: unknown) => {
          s.calls.push(input)
          return { secret: "whsec_newsecret1234" } // gitleaks:allow
        }) as never,
      },
    })
    expect(await rotateWebhookSecretCore(d, form({ id: "11" }))).toEqual({
      ok: true,
      secret: "whsec_newsecret1234", // gitleaks:allow
    })
    expect(s.calls).toEqual([{ workspaceId: 5, id: 11 }])
  })

  test("FORBIDDEN and NOT_FOUND pass through", async () => {
    const d = deps({
      webhooks: {
        ...fakeApi.webhooks,
        rotateSecret: fail("NOT_FOUND", "Webhook endpoint not found"),
      },
    })
    expect(await rotateWebhookSecretCore(d, form({ id: "11" }))).toEqual({
      ok: false,
      message: "Webhook endpoint not found",
    })
  })
})

describe("testWebhookCore", () => {
  test("a junk or missing id never reaches the api", async () => {
    const s = spy()
    const d = deps({ webhooks: { ...fakeApi.webhooks, test: s.fn as never } })
    for (const fd of [form({ id: "-1" }), form({})]) {
      expect(await testWebhookCore(d, fd)).toEqual({
        ok: false,
        message: "Webhook endpoint not found",
      })
    }
    expect(s.calls).toEqual([])
  })

  test("queues the ping and returns its event id", async () => {
    const s = spy()
    const d = deps({
      webhooks: {
        ...fakeApi.webhooks,
        test: (async (input: unknown) => {
          s.calls.push(input)
          return { eventId: "msg_abcdefghijklmnop" }
        }) as never,
      },
    })
    expect(await testWebhookCore(d, form({ id: "11" }))).toEqual({
      ok: true,
      eventId: "msg_abcdefghijklmnop",
    })
    expect(s.calls).toEqual([{ workspaceId: 5, id: 11 }])
  })

  test("CONFLICT (the endpoint is disabled) passes through", async () => {
    const disabled = "Turn this endpoint on before sending a test event."
    const d = deps({ webhooks: { ...fakeApi.webhooks, test: fail("CONFLICT", disabled) } })
    expect(await testWebhookCore(d, form({ id: "11" }))).toEqual({ ok: false, message: disabled })
  })
})

describe("deleteWebhookCore", () => {
  test("a junk or missing id never reaches the api", async () => {
    const s = spy()
    const d = deps({ webhooks: { ...fakeApi.webhooks, delete: s.fn as never } })
    for (const fd of [form({ id: "-1" }), form({})]) {
      expect(await deleteWebhookCore(d, fd)).toEqual({
        ok: false,
        message: "Webhook endpoint not found",
      })
    }
    expect(s.calls).toEqual([])
  })

  test("deletes the submitted endpoint", async () => {
    const s = spy()
    const d = deps({ webhooks: { ...fakeApi.webhooks, delete: s.fn as never } })
    expect(await deleteWebhookCore(d, form({ id: "11" }))).toEqual({
      ok: true,
      message: "Webhook endpoint deleted.",
    })
    expect(s.calls).toEqual([{ workspaceId: 5, id: 11 }])
  })

  test("FORBIDDEN passes through", async () => {
    const d = deps({
      webhooks: { ...fakeApi.webhooks, delete: fail("FORBIDDEN", "Requires the admin role") },
    })
    expect(await deleteWebhookCore(d, form({ id: "11" }))).toEqual({
      ok: false,
      message: "Requires the admin role",
    })
  })
})

describe("transferOwnershipCore", () => {
  test("a junk or missing id never reaches the api", async () => {
    const s = spy()
    const d = deps({ transferOwnership: s.fn as never })
    for (const fd of [form({ userId: "abc" }), form({})])
      expect(await transferOwnershipCore(d, fd)).toEqual({
        ok: false,
        message: "Choose the member to make owner",
      })
    expect(s.calls).toEqual([])
  })
  test("transfers to the submitted member", async () => {
    const s = spy()
    expect(
      await transferOwnershipCore(deps({ transferOwnership: s.fn as never }), form({ userId: "3" }))
    ).toEqual({ ok: true, message: "Ownership transferred." })
    expect(s.calls).toEqual([{ workspaceId: 5, userId: 3 }])
  })
  test("a non-member is the api's BAD_REQUEST message", async () => {
    const d = deps({
      transferOwnership: fail("BAD_REQUEST", "Not a member of this workspace"),
    })
    expect(await transferOwnershipCore(d, form({ userId: "99" }))).toEqual({
      ok: false,
      message: "Not a member of this workspace",
    })
  })
})

describe("deleteWorkspaceCore", () => {
  test("deletes once the typed name matches the server-known name", async () => {
    const s = spy()
    const d = { ...deps({ delete: s.fn as never }), workspaceName: "Acme" }
    expect(await deleteWorkspaceCore(d, form({ confirm: "Acme" }))).toEqual({
      ok: true,
      deleted: true,
      message: "Workspace deleted.",
    })
    expect(s.calls).toEqual([{ workspaceId: 5 }])
  })
  test("a mismatch is a field error on confirm, whatever a hidden field claims", async () => {
    const s = spy()
    const d = { ...deps({ delete: s.fn as never }), workspaceName: "Acme" }
    expect(
      await deleteWorkspaceCore(d, form({ confirm: "Other", workspaceName: "Other" }))
    ).toEqual({ ok: false, fieldErrors: { confirm: "Type the workspace name to confirm" } })
    expect(s.calls).toEqual([])
  })
  test("FORBIDDEN passes through", async () => {
    const d = {
      ...deps({ delete: fail("FORBIDDEN", "Requires a higher role") }),
      workspaceName: "Acme",
    }
    expect(await deleteWorkspaceCore(d, form({ confirm: "Acme" }))).toEqual({
      ok: false,
      message: "Requires a higher role",
    })
  })
})

describe("sameWorkspace", () => {
  const form = (workspaceId?: string) => {
    const fd = new FormData()
    if (workspaceId !== undefined) fd.set("workspaceId", workspaceId)
    return fd
  }

  test("true only when the form's workspaceId is the current workspace", () => {
    expect(sameWorkspace(form("5"), 5)).toBe(true)
    expect(sameWorkspace(form("6"), 5)).toBe(false)
  })

  test("a missing or malformed workspaceId is never the current workspace", () => {
    for (const value of [undefined, "", "0", "-5", "5.5", "abc"]) {
      expect(sameWorkspace(form(value), 5)).toBe(false)
    }
  })
})

describe("setWorkspaceSecurityCore", () => {
  /** Records every `security` call, in order, answering `get` with the given state. */
  function securitySpy(current = { requireTwoFactor: false, membersWithoutTwoFactor: 2 }) {
    const calls: unknown[] = []
    return {
      calls,
      security: {
        get: async (input: unknown) => {
          calls.push(["get", input])
          return current
        },
        set: async (input: { requireTwoFactor: boolean }) => {
          calls.push(["set", input])
          return { requireTwoFactor: input.requireTwoFactor }
        },
      } as unknown as WorkspaceApi["security"],
    }
  }
  const save = (on: boolean, stage = "save") =>
    form({ workspaceId: "5", stage, ...(on ? { requireTwoFactor: "on" } : {}) })

  test("turning it on first asks to confirm, naming how many would be blocked; nothing is set", async () => {
    const s = securitySpy()
    expect(await setWorkspaceSecurityCore(deps({ security: s.security }), save(true))).toEqual({
      ok: false,
      confirm: { count: 2 },
    })
    expect(s.calls).toEqual([["get", { workspaceId: 5 }]])
  })

  test("the confirmation stage applies it, scoped to the current workspace", async () => {
    const s = securitySpy()
    const d = deps({ security: s.security })
    expect(await setWorkspaceSecurityCore(d, save(true, "confirm"))).toEqual({
      ok: true,
      message: "Two-step verification is now required for all members.",
    })
    expect(s.calls).toEqual([["set", { workspaceId: 5, requireTwoFactor: true }]])
  })

  test("turning it off applies at once, with no confirmation", async () => {
    const s = securitySpy({ requireTwoFactor: true, membersWithoutTwoFactor: 1 })
    expect(await setWorkspaceSecurityCore(deps({ security: s.security }), save(false))).toEqual({
      ok: true,
      message: "Two-step verification is no longer required.",
    })
    expect(s.calls).toEqual([["set", { workspaceId: 5, requireTwoFactor: false }]])
  })

  test("saving it on while it is already on needs no confirmation", async () => {
    const s = securitySpy({ requireTwoFactor: true, membersWithoutTwoFactor: 0 })
    expect(await setWorkspaceSecurityCore(deps({ security: s.security }), save(true))).toEqual({
      ok: true,
      message: "Two-step verification is now required for all members.",
    })
    expect(s.calls).toEqual([
      ["get", { workspaceId: 5 }],
      ["set", { workspaceId: 5, requireTwoFactor: true }],
    ])
  })

  test("cancel goes back to the form and calls nothing", async () => {
    const s = securitySpy()
    const fd = form({ workspaceId: "5", stage: "cancel" })
    expect(await setWorkspaceSecurityCore(deps({ security: s.security }), fd)).toEqual({
      ok: false,
    })
    expect(s.calls).toEqual([])
  })

  test("an unknown stage is a plain save, never a confirmation", async () => {
    const s = securitySpy()
    expect(
      await setWorkspaceSecurityCore(deps({ security: s.security }), save(true, "yes"))
    ).toEqual({ ok: false, confirm: { count: 2 } })
  })

  test("an owner without two-step is refused, flagged so the card links to /security", async () => {
    const refusal = new ORPCError("FORBIDDEN", {
      message: OWNER_TWO_FACTOR_MESSAGE,
      data: { reason: OWNER_TWO_FACTOR_REASON },
      defined: true,
    })
    const d = deps({
      security: {
        ...fakeApi.security,
        set: async () => {
          throw refusal
        },
      },
    })
    expect(await setWorkspaceSecurityCore(d, save(true, "confirm"))).toEqual({
      ok: false,
      message: OWNER_TWO_FACTOR_MESSAGE,
      ownerTwoFactor: true,
    })
  })

  test("any other FORBIDDEN (not the owner, impersonating) is a plain message", async () => {
    const d = deps({
      security: { ...fakeApi.security, set: fail("FORBIDDEN", "Requires the owner role") },
    })
    expect(await setWorkspaceSecurityCore(d, save(false))).toEqual({
      ok: false,
      message: "Requires the owner role",
    })
  })

  test("a failed read before the confirmation is unavailable, not a crash", async () => {
    const d = deps({
      security: {
        ...fakeApi.security,
        get: async () => {
          throw new Error("api down")
        },
      },
    })
    expect(await setWorkspaceSecurityCore(d, save(true))).toEqual({
      ok: false,
      message: "The account service is unavailable right now. Try again in a moment.",
    })
  })
})

describe("setInviteDomainsCore", () => {
  const en = conjunction(createFormatter({ locale: "en", timeZone: "UTC" }))
  const sv = conjunction(createFormatter({ locale: "sv", timeZone: "UTC" }))
  /** Records `setInviteDomains`' inputs, answering with `answer` (or throwing it). */
  function domainsSpy(answer: string[] | Error) {
    const calls: unknown[] = []
    const security = {
      ...fakeApi.security,
      setInviteDomains: async (input: unknown) => {
        calls.push(input)
        if (answer instanceof Error) throw answer
        return { inviteDomains: answer }
      },
    } as unknown as WorkspaceApi["security"]
    return { calls, security }
  }
  const save = (domains: string) => form({ workspaceId: "5", domains })
  const refusal = (data: unknown, message = INVITE_DOMAINS_INVALID_MESSAGE) =>
    new ORPCError("BAD_REQUEST", { message, defined: true, data })

  test("sends the lines as typed, blank ones left out, and names the saved list", async () => {
    const s = domainsSpy(["acme.com", "xn--bcher-kva.de", "acme.se"])
    const d = { ...deps({ security: s.security }), formatList: en }
    expect(await setInviteDomainsCore(d, save(" Acme.com \r\n\n@bücher.de\nacme.se\n"))).toEqual({
      ok: true,
      // The stored A-label shown in its Unicode form, the list formatted, never hand-joined.
      message: "Invitations are now limited to: acme.com, bücher.de, and acme.se.",
    })
    expect(s.calls).toEqual([{ workspaceId: 5, domains: [" Acme.com ", "@bücher.de", "acme.se"] }])
  })

  test("Swedish: the list ends with och", async () => {
    const s = domainsSpy(["acme.com", "acme.se"])
    const d = { ...deps({ security: s.security }), locale: "sv" as const, formatList: sv }
    expect(await setInviteDomainsCore(d, save("acme.com\nacme.se"))).toEqual({
      ok: true,
      message: "Inbjudningar är nu begränsade till: acme.com och acme.se.",
    })
  })

  test("an empty list opens invitations to any address", async () => {
    const s = domainsSpy([])
    const d = { ...deps({ security: s.security }), formatList: en }
    expect(await setInviteDomainsCore(d, save("\n  \n"))).toEqual({
      ok: true,
      message: "Invitations are open to any address.",
    })
    expect(s.calls).toEqual([{ workspaceId: 5, domains: [] }])
  })

  test("refused lines: the api's indexes mapped back to the textarea's line numbers", async () => {
    // Sent: ["acme.com", "nope", "a_b.com"]; the api refuses indexes 1 and 2, lines 3 and 5.
    const s = domainsSpy(refusal({ reason: "invite_domain_invalid", indexes: [1, 2] }))
    const d = { ...deps({ security: s.security }), formatList: en }
    const text = "acme.com\n\nnope\n\na_b.com"
    expect(await setInviteDomainsCore(d, save(text))).toEqual({
      ok: false,
      message: INVITE_DOMAINS_INVALID_MESSAGE,
      fieldErrors: { domains: "Line 3: not a valid domain. Line 5: not a valid domain." },
      values: { domains: text },
    })
  })

  test("in Swedish", async () => {
    const s = domainsSpy(refusal({ reason: "invite_domain_invalid", indexes: [0] }, "Kontrollera"))
    const d = { ...deps({ security: s.security }), locale: "sv" as const, formatList: sv }
    expect(await setInviteDomainsCore(d, save("nope"))).toMatchObject({
      fieldErrors: { domains: "Rad 1: inte en giltig domän." },
    })
  })

  test("over the limit: the api's message", async () => {
    const s = domainsSpy(refusal({ reason: "invite_domain_limit" }, INVITE_DOMAINS_LIMIT_MESSAGE))
    const d = { ...deps({ security: s.security }), formatList: en }
    expect(await setInviteDomainsCore(d, save("a.com"))).toEqual({
      ok: false,
      message: INVITE_DOMAINS_LIMIT_MESSAGE,
      values: { domains: "a.com" },
    })
  })

  test("more than the api's input takes is judged here, by the same rule, without asking it", async () => {
    const s = domainsSpy([])
    const d = { ...deps({ security: s.security }), formatList: en }
    const many = Array.from({ length: 101 }, (_, i) => `d${i}.com`).join("\n")
    expect(await setInviteDomainsCore(d, save(many))).toEqual({
      ok: false,
      message: INVITE_DOMAINS_LIMIT_MESSAGE,
      values: { domains: many },
    })
    const long = `acme.com\n${"a".repeat(1001)}.com`
    expect(await setInviteDomainsCore(d, save(long))).toMatchObject({
      ok: false,
      message: INVITE_DOMAINS_INVALID_MESSAGE,
      fieldErrors: { domains: "Line 2: not a valid domain." },
    })
    expect(s.calls).toEqual([])
  })

  test("a refusal while impersonating, or not the owner, is a plain message", async () => {
    const s = domainsSpy(defined("FORBIDDEN", "Not available while impersonating"))
    const d = { ...deps({ security: s.security }), formatList: en }
    expect(await setInviteDomainsCore(d, save("acme.com"))).toEqual({
      ok: false,
      message: "Not available while impersonating",
      values: { domains: "acme.com" },
    })
  })

  test("the account catalog's own messages match the contract's in English", () => {
    const t = accountTranslator("en")
    expect(t("inviteDomains.invalid")).toBe(INVITE_DOMAINS_INVALID_MESSAGE)
    expect(t("inviteDomains.limit")).toBe(INVITE_DOMAINS_LIMIT_MESSAGE)
    // The invite form's hint says what the api's refusal says, in its own words.
    expect(t("invite.limitedTo", { domains: "acme.com" })).toBe(
      INVITE_DOMAIN_RESTRICTED_MESSAGE.replace("to this workspace ", "").replace(
        "{domains}",
        "acme.com"
      )
    )
  })
})

describe("inviteCore and the allowed domains", () => {
  test("a refused address shows the api's own (translated) message above the form", async () => {
    const message = "Invitations to this workspace are limited to: acme.com and acme.se."
    const d = deps({
      invitations: {
        ...fakeApi.invitations,
        create: async () => {
          throw new ORPCError("FORBIDDEN", {
            message,
            defined: true,
            data: { reason: "invite_domain" },
          })
        },
      },
    })
    expect(await inviteCore(d, form({ email: "a@other.com", role: "member" }))).toEqual({
      ok: false,
      message,
      values: { email: "a@other.com", role: "member" },
    })
  })
})
