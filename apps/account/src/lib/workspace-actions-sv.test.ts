import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import {
  type ApiKeySummary,
  type Billing,
  entitlementsFor,
  MAX_IMAGE_BYTES,
  type WebhookEndpoint,
} from "@repo/api-contract"
import {
  type BillingApi,
  changeMockPlanCore,
  openPortalCore,
  startCheckoutCore,
} from "./billing-actions"
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
  setLogoCore,
  setRoleCore,
  setWorkspaceSecurityCore,
  switchedMessage,
  testWebhookCore,
  transferOwnershipCore,
  updateWebhookCore,
  type WorkspaceApi,
} from "./workspace-actions"

// The Workspace and Payments cores in Swedish: the request's locale arrives as `deps.locale`.
// The api's own messages already come in it (the client sends `x-locale`), so they pass through.

const form = (fields: Record<string, string | File>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
/** Like `form`, but a field given as an array is `append`ed once per item — the create form's
 * `scopes` checkboxes. */
const formArr = (fields: Record<string, string | string[]>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) for (const item of v) fd.append(k, item)
    else fd.set(k, v)
  }
  return fd
}
const fail = (code: string, message: string) => async () => {
  throw new ORPCError(code, { message, defined: true })
}
const broken = async () => {
  throw new TypeError("fetch failed")
}
const UNAVAILABLE = "Kontotjänsten är inte tillgänglig just nu. Försök igen om en stund."

const apiKeySummary: ApiKeySummary = {
  id: 3,
  name: "CI-boten",
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
  description: "Vår CI",
  events: ["note.created"],
  enabled: true,
  disabledReason: null,
  disabledAt: null,
  consecutiveFailures: 0,
  createdBy: { id: 1, name: "Ada" },
  createdAt: "2026-01-01T00:00:00.000Z",
  lastDelivery: null,
}

const workspaceApi: WorkspaceApi = {
  update: async () => ({}) as never,
  delete: async () => undefined,
  leave: async () => undefined,
  transferOwnership: async () => undefined,
  members: { setRole: async () => undefined, remove: async () => undefined },
  invitations: { create: async () => ({}) as never, revoke: async () => undefined },
  logo: { set: async () => ({ logoUrl: "/files/x" }), remove: async () => ({ ok: true }) },
  apiKeys: {
    create: async () => ({ key: "bb_live_abcd1234_secret", apiKey: apiKeySummary }), // gitleaks:allow
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
const ws = (api: Partial<WorkspaceApi> = {}) => ({
  api: { ...workspaceApi, ...api },
  workspaceId: 5,
  locale: "sv" as const,
})

describe("workspace cores in Swedish", () => {
  test("a form for another workspace", () => {
    expect(switchedMessage("sv")).toBe("Byt till den arbetsytan först")
    expect(switchedMessage()).toBe("Switch to that workspace first")
  })

  test("rename: success, field errors and the unavailable fallback", async () => {
    expect(await renameWorkspaceCore(ws(), form({ name: "Nytt" }))).toEqual({
      ok: true,
      message: "Arbetsytan har bytt namn.",
    })
    expect(await renameWorkspaceCore(ws(), form({ name: " " }))).toMatchObject({
      ok: false,
      fieldErrors: { name: "Fältet måste fyllas i." },
    })
    expect(await renameWorkspaceCore(ws(), form({ name: "a\u0007b" }))).toMatchObject({
      fieldErrors: { name: "Namnet innehåller ett ogiltigt tecken" },
    })
    expect(await renameWorkspaceCore(ws(), form({ name: "x".repeat(101) }))).toMatchObject({
      fieldErrors: { name: "Använd högst 100 tecken." },
    })
    expect(await renameWorkspaceCore(ws({ update: broken }), form({ name: "Nytt" }))).toEqual({
      ok: false,
      message: UNAVAILABLE,
      values: { name: "Nytt" },
    })
  })

  test("logo: set, remove, and the file checks", async () => {
    const png = new File([new Uint8Array(10)], "l.png", { type: "image/png" })
    expect(await setLogoCore(ws(), form({ file: png }))).toEqual({
      ok: true,
      message: "Logotypen har uppdaterats.",
    })
    expect(await setLogoCore(ws(), form({}))).toEqual({
      ok: false,
      fieldErrors: { file: "Välj en bild." },
    })
    const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "l.png", { type: "image/png" })
    expect(await setLogoCore(ws(), form({ file: big }))).toEqual({
      ok: false,
      fieldErrors: { file: "Ladda upp en PNG-, JPEG- eller WebP-bild på högst 2 MB." },
    })
    expect(await removeLogoCore(ws(), form({}))).toEqual({
      ok: true,
      message: "Logotypen har tagits bort.",
    })
  })

  test("invite: sent, a bad address, a bad role, and the api's own message", async () => {
    expect(await inviteCore(ws(), form({ email: "g@example.com", role: "member" }))).toEqual({
      ok: true,
      message: "Inbjudan har skickats till g@example.com.",
    })
    expect(await inviteCore(ws(), form({ email: "nope", role: "member" }))).toMatchObject({
      fieldErrors: { email: "Ange en giltig e-postadress." },
    })
    expect(await inviteCore(ws(), form({ email: "g@example.com", role: "owner" }))).toMatchObject({
      fieldErrors: { role: "Välj ett av alternativen." },
    })
    const full = "Arbetsytan har nått gränsen för antal medlemmar"
    const d = ws({ invitations: { ...workspaceApi.invitations, create: fail("FORBIDDEN", full) } })
    expect(await inviteCore(d, form({ email: "g@example.com", role: "member" }))).toMatchObject({
      ok: false,
      message: full,
    })
  })

  test("role change", async () => {
    expect(await setRoleCore(ws(), form({ userId: "2", role: "admin" }))).toEqual({
      ok: true,
      message: "Rollen har uppdaterats.",
    })
    expect(await setRoleCore(ws(), form({ userId: "2", role: "owner" }))).toEqual({
      ok: false,
      message: "Välj rollen läsare, medlem eller administratör",
    })
    expect(await setRoleCore(ws(), form({ userId: "x", role: "admin" }))).toEqual({
      ok: false,
      message: "Inte medlem i den här arbetsytan",
    })
  })

  test("remove member and leave", async () => {
    expect(await removeMemberCore(ws(), form({ userId: "2" }))).toEqual({
      ok: true,
      message: "Medlemmen har tagits bort.",
    })
    expect(await removeMemberCore(ws(), form({ userId: "" }))).toEqual({
      ok: false,
      message: "Inte medlem i den här arbetsytan",
    })
    expect(await leaveCore(ws())).toEqual({
      ok: true,
      left: true,
      message: "Du har lämnat arbetsytan.",
    })
    const last = "Överlåt ägarskapet innan du lämnar arbetsytan."
    expect(await leaveCore(ws({ leave: fail("CONFLICT", last) }))).toEqual({
      ok: false,
      message: last,
    })
  })

  test("revoke an invitation", async () => {
    expect(await revokeInvitationCore(ws(), form({ invitationId: "9" }))).toEqual({
      ok: true,
      message: "Inbjudan har återkallats.",
    })
    expect(await revokeInvitationCore(ws(), form({ invitationId: "" }))).toEqual({
      ok: false,
      message: "Inbjudan hittades inte",
    })
  })

  test("create and revoke an API key", async () => {
    expect(
      await createApiKeyCore(
        ws(),
        formArr({ name: "CI-boten", scopes: ["notes:read"], expiresInDays: "90" })
      )
    ).toEqual({ ok: true, key: "bb_live_abcd1234_secret", apiKey: apiKeySummary }) // gitleaks:allow
    expect(
      await createApiKeyCore(
        ws(),
        formArr({ name: "", scopes: ["notes:read"], expiresInDays: "90" })
      )
    ).toMatchObject({ fieldErrors: { name: "Fältet måste fyllas i." } })
    const full =
      "En arbetsyta kan ha upp till 20 aktiva API-nycklar. Återkalla en för att skapa en ny."
    const d = ws({ apiKeys: { ...workspaceApi.apiKeys, create: fail("CONFLICT", full) } })
    expect(
      await createApiKeyCore(
        d,
        formArr({ name: "CI-boten", scopes: ["notes:read"], expiresInDays: "90" })
      )
    ).toMatchObject({ ok: false, message: full })
    expect(await revokeApiKeyCore(ws(), form({ id: "3" }))).toEqual({
      ok: true,
      message: "API-nyckeln har återkallats.",
    })
    expect(await revokeApiKeyCore(ws(), form({ id: "" }))).toEqual({
      ok: false,
      message: "API-nyckeln hittades inte",
    })
  })

  test("transfer ownership", async () => {
    expect(await transferOwnershipCore(ws(), form({ userId: "2" }))).toEqual({
      ok: true,
      message: "Ägarskapet har överlåtits.",
    })
    expect(await transferOwnershipCore(ws(), form({ userId: "" }))).toEqual({
      ok: false,
      message: "Välj medlemmen som ska bli ägare",
    })
  })

  test("delete", async () => {
    const d = { ...ws(), workspaceName: "Acme" }
    expect(await deleteWorkspaceCore(d, form({ confirm: "Acme" }))).toEqual({
      ok: true,
      deleted: true,
      message: "Arbetsytan har raderats.",
    })
    expect(await deleteWorkspaceCore(d, form({ confirm: "acme" }))).toEqual({
      ok: false,
      fieldErrors: { confirm: "Skriv arbetsytans namn för att bekräfta" },
    })
  })

  test("webhooks: create, update, rotate secret, test and delete", async () => {
    expect(
      await createWebhookCore(
        ws(),
        formArr({ url: "https://example.com/hooks", description: "", events: ["note.created"] })
      )
    ).toEqual({ ok: true, secret: "whsec_abcd1234secret", endpoint: webhookEndpoint }) // gitleaks:allow
    expect(
      await createWebhookCore(ws(), formArr({ url: "", description: "", events: ["note.created"] }))
    ).toMatchObject({ fieldErrors: { url: "Fältet måste fyllas i." } })

    expect(
      await updateWebhookCore(
        ws(),
        formArr({ id: "11", url: "https://example.com/hooks", events: ["note.created"] })
      )
    ).toMatchObject({ ok: true, message: "Webhook-mottagaren har uppdaterats." })
    expect(
      await updateWebhookCore(
        ws(),
        formArr({ id: "", url: "https://example.com/hooks", events: ["note.created"] })
      )
    ).toEqual({ ok: false, message: "Webhook-mottagaren hittades inte" })

    expect(await rotateWebhookSecretCore(ws(), form({ id: "11" }))).toEqual({
      ok: true,
      secret: "whsec_newsecret1234", // gitleaks:allow
    })

    expect(await testWebhookCore(ws(), form({ id: "11" }))).toEqual({
      ok: true,
      eventId: "msg_abcdefghijklmnop",
    })

    expect(await deleteWebhookCore(ws(), form({ id: "11" }))).toEqual({
      ok: true,
      message: "Webhook-mottagaren har tagits bort.",
    })
    expect(await deleteWebhookCore(ws(), form({ id: "" }))).toEqual({
      ok: false,
      message: "Webhook-mottagaren hittades inte",
    })
  })
})

const billingOn = (plan: "pro" | "team"): Billing => ({
  ...entitlementsFor({
    subscription: {
      plan,
      interval: "month",
      status: "active",
      currentPeriodEnd: "2026-11-02T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    },
    memberCount: 2,
    portalAvailable: false,
  }),
  provider: "mock",
})
const billingApi: BillingApi = {
  checkout: async () => ({ url: "https://checkout.example.com/s/1" }),
  portal: async () => ({ url: "https://billing.example.com/p/1" }),
  mockChange: async (input) => billingOn(input.plan === "team" ? "team" : "pro"),
}
const bd = (api: Partial<BillingApi> = {}) => ({
  api: { ...billingApi, ...api },
  workspaceId: 5,
  locale: "sv" as const,
})

describe("billing cores in Swedish", () => {
  test("checkout: field errors and the unavailable fallback", async () => {
    expect(await startCheckoutCore(bd(), form({ plan: "gold", interval: "month" }))).toMatchObject({
      ok: false,
      fieldErrors: { plan: "Välj ett av alternativen." },
    })
    const d = bd({ checkout: broken })
    expect(await startCheckoutCore(d, form({ plan: "pro", interval: "month" }))).toMatchObject({
      ok: false,
      message: UNAVAILABLE,
    })
  })

  test("portal: the api's refusal passes through, a failure is unavailable", async () => {
    const owner = "Kräver rollen ägare"
    expect(await openPortalCore(bd({ portal: fail("FORBIDDEN", owner) }))).toEqual({
      ok: false,
      message: owner,
    })
    expect(await openPortalCore(bd({ portal: broken }))).toEqual({
      ok: false,
      message: UNAVAILABLE,
    })
  })

  test("mock change: switch, cancel", async () => {
    expect(await changeMockPlanCore(bd(), form({ plan: "team", interval: "year" }))).toEqual({
      ok: true,
      message: "Du har planen Team.",
    })
    expect(await changeMockPlanCore(bd(), form({ plan: "cancel" }))).toEqual({
      ok: true,
      message: "Abonnemanget har sagts upp.",
    })
    expect(await changeMockPlanCore(bd(), form({ plan: "pro", interval: "week" }))).toMatchObject({
      fieldErrors: { interval: "Välj ett av alternativen." },
    })
  })
})

describe("the two-step requirement in Swedish", () => {
  test("on, off", async () => {
    const on = form({ workspaceId: "5", stage: "confirm", requireTwoFactor: "on" })
    expect(await setWorkspaceSecurityCore(ws(), on)).toEqual({
      ok: true,
      message: "Tvåstegsverifiering krävs nu för alla medlemmar.",
    })
    expect(await setWorkspaceSecurityCore(ws(), form({ workspaceId: "5", stage: "save" }))).toEqual(
      { ok: true, message: "Tvåstegsverifiering krävs inte längre." }
    )
  })
})
