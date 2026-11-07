import { afterEach, describe, expect, test } from "bun:test"
import { signUpWithWorkspace, start } from "../test-server"
import { type BillingEvent, type BillingProvider, BillingSignatureError } from "./provider"

type Verify = BillingProvider["verifyWebhook"]

/** A provider whose `verifyWebhook` the test scripts; nothing else is reached by the route. */
function scriptedProvider() {
  const state: { verify: Verify; calls: Array<{ raw: string; header: string | null }> } = {
    verify: async () => null,
    calls: [],
  }
  const provider: BillingProvider = {
    kind: "stripe",
    createCheckout: async () => ({ url: "https://checkout.example" }),
    createPortal: async () => ({ url: "https://portal.example" }),
    hasPrice: () => true,
    cancelSubscription: async () => {},
    verifyWebhook: (raw, header) => {
      state.calls.push({ raw, header })
      return state.verify(raw, header)
    },
  }
  return { provider, state }
}

let counter = 0
const subscriptionEvent = (workspaceId: number | null): BillingEvent => ({
  id: `evt_w${++counter}`,
  type: "customer.subscription.created",
  createdAt: new Date().toISOString(),
  workspaceId,
  customerId: `cus_w${counter}`,
  customerEmail: null,
  subscription: {
    subscriptionId: `sub_w${counter}`,
    status: "active",
    plan: "team",
    interval: "year",
    currentPeriodEnd: "2026-11-02T00:00:00.000Z",
    cancelAtPeriodEnd: false,
  },
})

describe("POST /billing/webhook", () => {
  const stops: Array<() => Promise<void>> = []
  afterEach(async () => {
    for (const stop of stops.splice(0)) await stop()
  })

  async function setup() {
    const scripted = scriptedProvider()
    const logged: string[] = []
    const app = await start({ billing: () => scripted.provider, log: (m) => logged.push(m) })
    stops.push(app.stop)
    // No bearer token, no x-api-client-id: Stripe sends neither; the signature is the auth.
    const post = (body = '{"id":"evt"}', signature: string | null = "t=1,v1=sig") =>
      fetch(new URL("/billing/webhook", app.server.url), {
        method: "POST",
        headers: signature ? { "stripe-signature": signature } : {},
        body,
      })
    return { app, post, logged, ...scripted }
  }

  test("passes the raw body and the stripe-signature header to the provider", async () => {
    const { post, state } = await setup()
    const res = await post('{"raw": true}', "t=9,v1=abc")
    expect(res.status).toBe(200)
    expect(state.calls).toEqual([{ raw: '{"raw": true}', header: "t=9,v1=abc" }])
  })

  test("a bad signature → 400, nothing applied", async () => {
    const { post, state, logged } = await setup()
    let verified = false
    state.verify = async () => {
      verified = true
      throw new BillingSignatureError("nope")
    }
    const res = await post()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Bad signature" })
    expect(verified).toBe(true)
    expect(logged).toEqual(["billing webhook rejected: bad signature"])
  })

  test("an ignored event type → 200 { ignored: true }", async () => {
    const { post } = await setup()
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, ignored: true })
  })

  test("a subscription event applies once; the redelivery is a 200 duplicate", async () => {
    const { app, post, state } = await setup()
    const owner = await signUpWithWorkspace(app)
    const event = subscriptionEvent(owner.workspaceId)
    state.verify = async () => event

    const first = await post()
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ received: true, applied: true })
    expect(await owner.client.billing.get({ workspaceId: owner.workspaceId })).toMatchObject({
      plan: "team",
      interval: "year",
      status: "active",
      provider: "stripe",
      portalAvailable: true,
    })
    expect(await app.db.billing.customers.find(owner.workspaceId)).toMatchObject({
      customer_id: event.customerId,
    })

    const again = await post()
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ received: true, applied: false, reason: "duplicate" })
  })

  test("a plan change records workspace.plan_changed once, with the system as actor", async () => {
    const { app, post, state } = await setup()
    const owner = await signUpWithWorkspace(app)
    const event = subscriptionEvent(owner.workspaceId)
    state.verify = async () => event
    expect((await post()).status).toBe(200)
    // The redelivery is a duplicate: no second row.
    expect((await post()).status).toBe(200)
    const rows = (await app.db.sql`
      SELECT actor_user_id, impersonated_user_id, target_type, target_id, metadata
      FROM audit_log
      WHERE action = 'workspace.plan_changed' AND workspace_id = ${owner.workspaceId}
    `) as Array<{ actor_user_id: number | null; metadata: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actor_user_id: null,
      impersonated_user_id: null,
      target_type: "workspace",
      target_id: String(owner.workspaceId),
    })
    expect(JSON.parse(rows[0]?.metadata as string)).toEqual({
      plan: "team",
      interval: "year",
      status: "active",
    })
  })

  test("an unattributed event → 200 reason unattributed", async () => {
    const { post, state } = await setup()
    state.verify = async () => subscriptionEvent(null)
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, applied: false, reason: "unattributed" })
  })

  test("a provider failure that is not a signature error → 500 through the server's error handler", async () => {
    const { post, state } = await setup()
    state.verify = async () => {
      throw new Error("provider exploded")
    }
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain("provider exploded")
  })

  test("a database failure → 500, so the provider retries", async () => {
    const { app, post, state } = await setup()
    const owner = await signUpWithWorkspace(app)
    state.verify = async () => subscriptionEvent(owner.workspaceId)
    const transaction = app.db.transaction
    app.db.transaction = async () => {
      throw new Error("database unavailable")
    }
    try {
      const res = await post()
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: "Internal error" })
    } finally {
      app.db.transaction = transaction
    }
  })

  test("only POST is routed", async () => {
    const { app } = await setup()
    const res = await fetch(new URL("/billing/webhook", app.server.url))
    expect(res.status).toBe(404)
  })
})
