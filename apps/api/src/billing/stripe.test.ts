import { describe, expect, test } from "bun:test"
import Stripe from "stripe"
import { memoryBroadcaster } from "../realtime/memory"
import { createBillingFactory, mockBilling } from "./create-provider"
import type { PriceEnv } from "./plans"
import { BillingSignatureError } from "./provider"
import { stripeBilling } from "./stripe"

const PRICES: PriceEnv = {
  STRIPE_PRICE_PRO_MONTH: "price_pro_m",
  STRIPE_PRICE_PRO_YEAR: "price_pro_y",
  STRIPE_PRICE_TEAM_MONTH: "price_team_m",
  STRIPE_PRICE_TEAM_YEAR: "price_team_y",
}
const SECRET = "whsec_test_secret"
const PERIOD_END = 1_793_577_600 // 2026-11-02T00:00:00Z
const CREATED = 1_790_899_200 // 2026-10-02T00:00:00Z

const checkoutInput = {
  workspaceId: 7,
  plan: "pro" as const,
  interval: "month" as const,
  customerId: null,
  customerEmail: "owner@example.com",
  successUrl: "http://account.example.com/payments?checkout=success",
  cancelUrl: "http://account.example.com/payments",
}

/** A Stripe stand-in: records the params it is called with, returns `event` from webhooks. */
function fakeClient(event?: unknown, subscription: { retrieve?: () => Promise<unknown> } = {}) {
  const calls: { checkout: unknown[]; portal: unknown[]; cancel: string[] } = {
    checkout: [],
    portal: [],
    cancel: [],
  }
  const client = {
    checkout: {
      sessions: {
        create: async (params: unknown) => {
          calls.checkout.push(params)
          return { url: "https://checkout.stripe.test/s" }
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (params: unknown) => {
          calls.portal.push(params)
          return { url: "https://billing.stripe.test/p" }
        },
      },
    },
    subscriptions: {
      retrieve: subscription.retrieve ?? (async (id: string) => ({ id, status: "active" })),
      cancel: async (id: string) => {
        calls.cancel.push(id)
        return {}
      },
    },
    webhooks: { constructEventAsync: async () => event },
  }
  return { client: client as unknown as Stripe, calls }
}

const provider = (client: Stripe, log: (m: string, e: unknown) => void = () => {}) =>
  stripeBilling({ secretKey: "sk_test_x", webhookSecret: SECRET, prices: PRICES, log, client })

const subscriptionEvent = (over: { price?: string; type?: string } = {}) => ({
  id: "evt_sub",
  object: "event",
  created: CREATED,
  type: over.type ?? "customer.subscription.updated",
  data: {
    object: {
      id: "sub_123",
      object: "subscription",
      status: "past_due",
      customer: "cus_123",
      cancel_at_period_end: true,
      metadata: { workspaceId: "7" },
      items: {
        object: "list",
        data: [
          {
            id: "si_1",
            object: "subscription_item",
            price: { id: over.price ?? "price_team_y", object: "price" },
            current_period_end: PERIOD_END,
          },
        ],
      },
    },
  },
})

describe("stripeBilling", () => {
  test("createCheckout: price from env, workspace on the session and the subscription, customer_email", async () => {
    const { client, calls } = fakeClient()
    expect(await provider(client).createCheckout(checkoutInput)).toEqual({
      url: "https://checkout.stripe.test/s",
    })
    expect(calls.checkout[0]).toEqual({
      mode: "subscription",
      line_items: [{ price: "price_pro_m", quantity: 1 }],
      client_reference_id: "7",
      metadata: { workspaceId: "7" },
      subscription_data: { metadata: { workspaceId: "7" } },
      customer_email: "owner@example.com",
      success_url: checkoutInput.successUrl,
      cancel_url: checkoutInput.cancelUrl,
    })
  })

  test("createCheckout: an existing customer is passed as customer, not customer_email", async () => {
    const { client, calls } = fakeClient()
    await provider(client).createCheckout({
      ...checkoutInput,
      plan: "team",
      interval: "year",
      customerId: "cus_123",
    })
    const params = calls.checkout[0] as Record<string, unknown>
    expect(params.customer).toBe("cus_123")
    expect(params.customer_email).toBeUndefined()
    expect(params.line_items).toEqual([{ price: "price_team_y", quantity: 1 }])
  })

  test("createCheckout throws for an unconfigured price; hasPrice reports it", async () => {
    const { client } = fakeClient()
    const p = stripeBilling({
      secretKey: "sk_test_x",
      webhookSecret: SECRET,
      prices: { STRIPE_PRICE_PRO_MONTH: "price_pro_m" },
      log: () => {},
      client,
    })
    expect(p.hasPrice("pro", "month")).toBe(true)
    expect(p.hasPrice("team", "year")).toBe(false)
    await expect(
      p.createCheckout({ ...checkoutInput, plan: "team", interval: "year" })
    ).rejects.toThrow("No Stripe price configured for team/year")
  })

  test("createPortal and cancelSubscription call through", async () => {
    const { client, calls } = fakeClient()
    const p = provider(client)
    expect(await p.createPortal({ customerId: "cus_123", returnUrl: "http://r" })).toEqual({
      url: "https://billing.stripe.test/p",
    })
    expect(calls.portal[0]).toEqual({ customer: "cus_123", return_url: "http://r" })
    await p.cancelSubscription("sub_123")
    expect(calls.cancel).toEqual(["sub_123"])
    expect(p.kind).toBe("stripe")
  })

  describe("cancelSubscription", () => {
    for (const status of ["canceled", "incomplete_expired"]) {
      test(`an already ${status} subscription is not cancelled again`, async () => {
        const { client, calls } = fakeClient(undefined, {
          retrieve: async () => ({ id: "sub_123", status }),
        })
        await provider(client).cancelSubscription("sub_123")
        expect(calls.cancel).toEqual([])
      })
    }

    test("a subscription Stripe no longer has (resource_missing) counts as cancelled", async () => {
      const { client, calls } = fakeClient(undefined, {
        retrieve: async () => {
          throw Object.assign(new Error("No such subscription"), { code: "resource_missing" })
        },
      })
      await provider(client).cancelSubscription("sub_gone")
      expect(calls.cancel).toEqual([])
    })

    test("resource_missing from cancel itself (a race) also counts as cancelled", async () => {
      const { client } = fakeClient()
      const raw = client as unknown as { subscriptions: { cancel: () => Promise<unknown> } }
      raw.subscriptions.cancel = async () => {
        throw Object.assign(new Error("No such subscription"), { code: "resource_missing" })
      }
      await expect(provider(client).cancelSubscription("sub_123")).resolves.toBeUndefined()
    })

    test("any other error still throws", async () => {
      const { client } = fakeClient(undefined, {
        retrieve: async () => {
          throw Object.assign(new Error("Network down"), { code: "api_connection_error" })
        },
      })
      await expect(provider(client).cancelSubscription("sub_123")).rejects.toThrow("Network down")
    })
  })

  test("a subscription event with a known price reduces to the mirror's shape", async () => {
    const { client } = fakeClient(subscriptionEvent())
    expect(await provider(client).verifyWebhook("{}", "t=1,v1=x")).toEqual({
      id: "evt_sub",
      type: "customer.subscription.updated",
      createdAt: "2026-10-02T00:00:00.000Z",
      workspaceId: 7,
      customerId: "cus_123",
      customerEmail: null,
      subscription: {
        subscriptionId: "sub_123",
        status: "past_due",
        plan: "team",
        interval: "year",
        currentPeriodEnd: "2026-11-02T00:00:00.000Z",
        cancelAtPeriodEnd: true,
      },
      unknownPrice: false,
    })
  })

  test("an unknown price → subscription null, unknownPrice true, and a log line", async () => {
    const { client } = fakeClient(subscriptionEvent({ price: "price_foreign" }))
    const logged: string[] = []
    const event = await provider(client, (m) => logged.push(m)).verifyWebhook("{}", "t=1,v1=x")
    expect(event).toMatchObject({ subscription: null, unknownPrice: true, customerId: "cus_123" })
    expect(logged).toEqual(["stripe: unknown price on sub_123"])
  })

  test("checkout.session.completed → workspace from metadata only, customer id and email", async () => {
    const { client } = fakeClient({
      id: "evt_cs",
      object: "event",
      created: CREATED,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          object: "checkout.session",
          client_reference_id: "42",
          metadata: { workspaceId: "99" },
          customer: { id: "cus_9", object: "customer" },
          customer_details: { email: "payer@example.com" },
          customer_email: null,
        },
      },
    })
    expect(await provider(client).verifyWebhook("{}", "t=1,v1=x")).toEqual({
      id: "evt_cs",
      type: "checkout.session.completed",
      createdAt: "2026-10-02T00:00:00.000Z",
      workspaceId: 99,
      customerId: "cus_9",
      customerEmail: "payer@example.com",
      subscription: null,
    })
  })

  test("a session with only client_reference_id (a Payment Link) is unattributed", async () => {
    const { client } = fakeClient({
      id: "evt_pl",
      object: "event",
      created: CREATED,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_2",
          object: "checkout.session",
          client_reference_id: "42",
          metadata: {},
          customer: "cus_pl",
          customer_details: { email: "payer@example.com" },
          customer_email: null,
        },
      },
    })
    expect(await provider(client).verifyWebhook("{}", "t=1,v1=x")).toMatchObject({
      workspaceId: null,
      customerId: "cus_pl",
    })
  })

  for (const id of ["0x10", "1e3", "007", "0", "-1", "1.5", "99999999999999999"]) {
    test(`metadata.workspaceId ${JSON.stringify(id)} → workspaceId null`, async () => {
      const ev = subscriptionEvent()
      ev.data.object.metadata.workspaceId = id
      const { client } = fakeClient(ev)
      expect(await provider(client).verifyWebhook("{}", "t=1,v1=x")).toMatchObject({
        workspaceId: null,
      })
    })
  }

  test("an unrelated event type → null", async () => {
    const { client } = fakeClient({
      id: "evt_x",
      object: "event",
      type: "invoice.paid",
      data: { object: {} },
    })
    expect(await provider(client).verifyWebhook("{}", "t=1,v1=x")).toBeNull()
  })

  test("a missing signature header → BillingSignatureError", async () => {
    const { client } = fakeClient(subscriptionEvent())
    await expect(provider(client).verifyWebhook("{}", null)).rejects.toBeInstanceOf(
      BillingSignatureError
    )
  })

  describe("real HMAC (no network: verification is local)", () => {
    const real = () =>
      stripeBilling({
        secretKey: "sk_test_x",
        webhookSecret: SECRET,
        prices: PRICES,
        log: () => {},
        client: new Stripe("sk_test_x"),
      })
    const payload = JSON.stringify(subscriptionEvent({ price: "price_pro_m" }))
    const sign = (body: string, timestamp?: number) =>
      Stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret: SECRET, timestamp })

    test("a correctly signed payload is parsed", async () => {
      const event = await real().verifyWebhook(payload, await sign(payload))
      expect(event).toMatchObject({
        id: "evt_sub",
        workspaceId: 7,
        subscription: { plan: "pro", interval: "month" },
      })
    })

    test("one tampered byte → BillingSignatureError", async () => {
      const header = await sign(payload)
      const tampered = payload.replace('"workspaceId":"7"', '"workspaceId":"8"')
      expect(tampered).not.toBe(payload)
      await expect(real().verifyWebhook(tampered, header)).rejects.toBeInstanceOf(
        BillingSignatureError
      )
    })

    test("a header older than the tolerance → BillingSignatureError", async () => {
      const header = await sign(payload, Math.floor(Date.now() / 1000) - 600)
      await expect(real().verifyWebhook(payload, header)).rejects.toBeInstanceOf(
        BillingSignatureError
      )
    })
  })
})

describe("createBillingFactory", () => {
  test("mock unless BILLING_PROVIDER=stripe; stripe builds the stripe provider", () => {
    expect(createBillingFactory({ BILLING_PROVIDER: "mock" })).toBe(mockBilling)
    const factory = createBillingFactory({
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: SECRET,
      ...PRICES,
    })
    const built = factory({
      db: {} as never,
      log: () => {},
      accountUrl: "http://a",
      enqueue: async () => 0,
      recordFailure: () => {},
      broadcaster: memoryBroadcaster(() => {}),
      notificationEmail: { authUrl: "http://au", accountUrl: "http://a", twoFactorKey: "unused" },
    })
    expect(built.kind).toBe("stripe")
    expect(built.hasPrice("team", "year")).toBe(true)
  })
})
