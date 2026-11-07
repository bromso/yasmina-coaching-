import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import { ORPCError } from "@orpc/server"
import { type ApiClient, ROLES, type Role, SEAT_LIMIT_MESSAGE } from "@repo/api-contract"
import type { RecordEventContext } from "../analytics/record"
import { createDb, type Db } from "../db"
import { engines, testDatabase } from "../test-db"
import { signUp, signUpWithWorkspace, start } from "../test-server"
import { assertEntitled, assertSeatAvailable, entitlementsForWorkspace } from "./entitlements"
import { applyBillingEvent } from "./mirror"
import { mockProvider } from "./mock"
import { planForPrice, priceFor } from "./plans"
import type { BillingEvent, BillingSubscriptionEvent } from "./provider"

const PROVIDER = "stripe"
/** Event creation times: T0 and seconds after it. */
const T0 = "2026-10-02T00:00:00.000Z"
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString()
let counter = 0

const sub = (over: Partial<BillingSubscriptionEvent> = {}): BillingSubscriptionEvent => ({
  subscriptionId: "sub_1",
  status: "active",
  plan: "pro",
  interval: "month",
  currentPeriodEnd: "2026-11-02T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  ...over,
})

const event = (over: Partial<BillingEvent> = {}): BillingEvent => ({
  id: `evt_${++counter}`,
  type: "customer.subscription.created",
  createdAt: T0,
  workspaceId: null,
  customerId: "cus_1",
  customerEmail: "billing@example.com",
  subscription: sub(),
  ...over,
})

/** Throws the ORPCError `fn` throws, or fails the test. */
function forbidden(fn: () => void): ORPCError<string, unknown> {
  try {
    fn()
  } catch (error) {
    if (error instanceof ORPCError) return error
    throw error
  }
  throw new Error("expected a FORBIDDEN error")
}

for (const engine of engines) {
  describe(`billing on ${engine}`, () => {
    const cleanups: Array<() => Promise<void>> = []
    // Dropping throwaway Postgres databases on a CI runner can exceed bun's 5 s hook default.
    afterEach(async () => {
      for (const c of cleanups.splice(0)) await c()
    }, 30_000)
    async function fresh() {
      const tdb = await testDatabase(engine)
      const db = createDb(tdb.url)
      await db.migrate()
      cleanups.push(async () => {
        await db.close()
        await tdb.cleanup()
      })
      return db
    }
    /** A workspace with `members` members (the first one its owner). */
    async function workspace(db: Db, members = 1) {
      const n = ++counter
      const owner = await db.users.create({
        email: `o${n}@example.com`,
        passwordHash: "h",
        name: "",
      })
      const ws = await db.workspaces.create({ name: "W", slug: `w-${n}`, createdBy: owner.id })
      await db.memberships.add({ workspaceId: ws.id, userId: owner.id, role: "owner" })
      for (let i = 1; i < members; i++) {
        const u = await db.users.create({
          email: `m${n}-${i}@example.com`,
          passwordHash: "h",
          name: "",
        })
        await db.memberships.add({ workspaceId: ws.id, userId: u.id, role: "member" })
      }
      return ws.id
    }

    describe("applyBillingEvent", () => {
      test("created writes the subscription and the customer", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        expect(await applyBillingEvent(db, PROVIDER, event({ workspaceId: ws }))).toEqual({
          applied: true,
        })
        const row = await db.billing.subscriptions.latest(ws)
        expect(row).toMatchObject({
          workspace_id: ws,
          provider: PROVIDER,
          subscription_id: "sub_1",
          plan: "pro",
          interval: "month",
          status: "active",
          current_period_end: "2026-11-02T00:00:00.000Z",
        })
        expect(Boolean(Number(row?.cancel_at_period_end))).toBe(false)
        expect(await db.billing.customers.find(ws)).toMatchObject({
          customer_id: "cus_1",
          email: "billing@example.com",
        })
      })

      test("updated with the same subscription id changes the one row; deleted cancels it", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        await applyBillingEvent(db, PROVIDER, event({ workspaceId: ws }))
        const firstId = (await db.billing.subscriptions.latest(ws))?.id
        await applyBillingEvent(
          db,
          PROVIDER,
          event({
            workspaceId: ws,
            type: "customer.subscription.updated",
            subscription: sub({ plan: "team", interval: "year", cancelAtPeriodEnd: true }),
          })
        )
        const updated = await db.billing.subscriptions.findBySubscriptionId(PROVIDER, "sub_1")
        expect(updated).toMatchObject({ plan: "team", interval: "year", status: "active" })
        expect(updated?.id).toBe(firstId as number)
        expect(Boolean(Number(updated?.cancel_at_period_end))).toBe(true)

        await applyBillingEvent(
          db,
          PROVIDER,
          event({
            workspaceId: ws,
            type: "customer.subscription.deleted",
            subscription: sub({ plan: "team", interval: "year", status: "canceled" }),
          })
        )
        const canceled = await db.billing.subscriptions.latest(ws)
        expect(canceled?.status).toBe("canceled")
        expect(canceled?.id).toBe(firstId as number)
      })

      test("a redelivered event id is a no-op", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        const first = event({ workspaceId: ws })
        await applyBillingEvent(db, PROVIDER, first)
        const again = { ...first, subscription: sub({ plan: "team" }) }
        expect(await applyBillingEvent(db, PROVIDER, again)).toEqual({
          applied: false,
          reason: "duplicate",
        })
        expect((await db.billing.subscriptions.latest(ws))?.plan).toBe("pro")
      })

      test("an event naming no workspace and an unknown customer is unattributed", async () => {
        const db = await fresh()
        expect(await applyBillingEvent(db, PROVIDER, event({ customerId: "cus_nobody" }))).toEqual({
          applied: false,
          reason: "unattributed",
        })
        expect(await db.billing.subscriptions.findBySubscriptionId(PROVIDER, "sub_1")).toBe(
          undefined
        )
      })

      test("an event naming no workspace is attributed through a mirrored customer", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        await db.billing.customers.upsert({
          workspaceId: ws,
          provider: PROVIDER,
          customerId: "cus_known",
          email: null,
        })
        expect(
          await applyBillingEvent(
            db,
            PROVIDER,
            event({
              customerId: "cus_known",
              customerEmail: null,
              subscription: sub({ subscriptionId: "sub_k" }),
            })
          )
        ).toEqual({ applied: true })
        expect((await db.billing.subscriptions.latest(ws))?.subscription_id).toBe("sub_k")
      })

      test("a customer already mirrored to another workspace is a recorded conflict, not a throw", async () => {
        const db = await fresh()
        const a = await workspace(db)
        const b = await workspace(db)
        await applyBillingEvent(db, PROVIDER, event({ workspaceId: a, customerId: "cus_a" }))
        const clash = event({
          workspaceId: b,
          customerId: "cus_a",
          subscription: sub({ subscriptionId: "sub_b", plan: "team" }),
        })
        expect(await applyBillingEvent(db, PROVIDER, clash)).toEqual({
          applied: false,
          reason: "conflict",
        })
        // Nothing moved: A keeps its customer, B gets neither customer nor subscription.
        expect((await db.billing.customers.find(a))?.customer_id).toBe("cus_a")
        expect(await db.billing.customers.find(b)).toBeUndefined()
        expect(await db.billing.subscriptions.latest(b)).toBeUndefined()
        expect((await db.billing.subscriptions.latest(a))?.plan).toBe("pro")
        // The event id stayed recorded, so a redelivery stops at duplicate instead of retrying forever.
        expect(await applyBillingEvent(db, PROVIDER, clash)).toEqual({
          applied: false,
          reason: "duplicate",
        })
      })

      test("an event for a deleted workspace is recorded as gone, not retried forever", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        await db.workspaces.delete(ws)
        const orphan = event({ workspaceId: ws, customerId: "cus_gone" })
        expect(await applyBillingEvent(db, PROVIDER, orphan)).toEqual({
          applied: false,
          reason: "gone",
        })
        expect(await db.billing.subscriptions.findBySubscriptionId(PROVIDER, "sub_1")).toBe(
          undefined
        )
        expect(await applyBillingEvent(db, PROVIDER, orphan)).toEqual({
          applied: false,
          reason: "duplicate",
        })
      })

      test("an older event delivered late is stale and leaves the newer state", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        await applyBillingEvent(
          db,
          PROVIDER,
          event({ workspaceId: ws, createdAt: at(0), subscription: sub({ status: "active" }) })
        )
        expect(
          await applyBillingEvent(
            db,
            PROVIDER,
            event({
              workspaceId: ws,
              type: "customer.subscription.deleted",
              createdAt: at(10),
              subscription: sub({ status: "canceled" }),
            })
          )
        ).toEqual({ applied: true })
        // A retried `updated/active` from before the cancellation must not re-grant the plan.
        expect(
          await applyBillingEvent(
            db,
            PROVIDER,
            event({
              workspaceId: ws,
              type: "customer.subscription.updated",
              createdAt: at(5),
              subscription: sub({ status: "active" }),
            })
          )
        ).toEqual({ applied: false, reason: "stale" })
        const row = await db.billing.subscriptions.latest(ws)
        expect(row?.status).toBe("canceled")
        expect(row?.source_updated_at).toBe(at(10))
      })

      test("events in order apply; the same createdAt lets the later-applied one win", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        const apply = (seconds: number, over: Partial<BillingSubscriptionEvent>) =>
          applyBillingEvent(
            db,
            PROVIDER,
            event({
              workspaceId: ws,
              type: "customer.subscription.updated",
              createdAt: at(seconds),
              subscription: sub(over),
            })
          )
        expect(await apply(0, { plan: "pro" })).toEqual({ applied: true })
        expect(await apply(1, { plan: "team" })).toEqual({ applied: true })
        expect((await db.billing.subscriptions.latest(ws))?.plan).toBe("team")
        expect(await apply(1, { plan: "pro", interval: "year" })).toEqual({ applied: true })
        expect(await db.billing.subscriptions.latest(ws)).toMatchObject({
          plan: "pro",
          interval: "year",
        })
      })

      test("an unknown price upserts the customer but writes no subscription", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        expect(
          await applyBillingEvent(db, PROVIDER, event({ workspaceId: ws, unknownPrice: true }))
        ).toEqual({ applied: false, reason: "unknown_price" })
        expect((await db.billing.customers.find(ws))?.customer_id).toBe("cus_1")
        expect(await db.billing.subscriptions.latest(ws)).toBeUndefined()
      })

      test("create-after-update yields the same row as update-after-create: the newer event wins", async () => {
        const db = await fresh()
        const inOrder = await workspace(db)
        const outOfOrder = await workspace(db)
        // The create (T0) says pro/month; the later update (T0+5s) says team/year.
        const created = (id: string) => ({
          type: "customer.subscription.created",
          createdAt: at(0),
          subscription: sub({ subscriptionId: id, plan: "pro", interval: "month" }),
        })
        const updated = (id: string) => ({
          type: "customer.subscription.updated",
          createdAt: at(5),
          subscription: sub({ subscriptionId: id, plan: "team", interval: "year" }),
        })
        for (const step of [created("sub_a"), updated("sub_a")]) {
          await applyBillingEvent(
            db,
            PROVIDER,
            event({ ...step, workspaceId: inOrder, customerId: "cus_a" })
          )
        }
        for (const step of [updated("sub_b"), created("sub_b")]) {
          await applyBillingEvent(
            db,
            PROVIDER,
            event({ ...step, workspaceId: outOfOrder, customerId: "cus_b" })
          )
        }
        expect(await db.billing.subscriptions.latest(outOfOrder)).toMatchObject({
          plan: "team",
          interval: "year",
        })
        const pick = (r: Awaited<ReturnType<Db["billing"]["subscriptions"]["latest"]>>) => ({
          plan: r?.plan,
          interval: r?.interval,
          status: r?.status,
          current_period_end: r?.current_period_end,
          cancel: Boolean(Number(r?.cancel_at_period_end)),
        })
        expect(pick(await db.billing.subscriptions.latest(outOfOrder))).toEqual(
          pick(await db.billing.subscriptions.latest(inOrder))
        )
      })
    })

    describe("plan_changed (the mirror's analytics event)", () => {
      /** Captures every `recordEvent` call `applyBillingEvent` makes — no real job queue here. */
      function capturingEvents() {
        const calls: Array<{
          name: string
          props: Record<string, unknown>
          workspaceId: number | null
        }> = []
        const events: RecordEventContext = {
          enqueue: async (_def, payload) => {
            const p = payload as {
              name: string
              props: Record<string, unknown>
              workspaceId: number | null
            }
            calls.push({ name: p.name, props: p.props, workspaceId: p.workspaceId })
            return 0
          },
          recordFailure: () => {},
        }
        return { events, calls }
      }
      const planChanged = (calls: ReturnType<typeof capturingEvents>["calls"]) =>
        calls.filter((c) => c.name === "plan_changed")

      test("activating a subscription records plan_changed to the plan", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        const { events, calls } = capturingEvents()
        await applyBillingEvent(db, PROVIDER, event({ workspaceId: ws }), events)
        expect(planChanged(calls)).toEqual([
          { name: "plan_changed", props: { plan: "pro", interval: "month" }, workspaceId: ws },
        ])
      })

      test("canceling a live subscription records plan_changed to free", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        await applyBillingEvent(db, PROVIDER, event({ workspaceId: ws }))
        const { events, calls } = capturingEvents()
        await applyBillingEvent(
          db,
          PROVIDER,
          event({
            workspaceId: ws,
            type: "customer.subscription.deleted",
            createdAt: at(10),
            subscription: sub({ status: "canceled" }),
          }),
          events
        )
        expect(planChanged(calls)).toEqual([
          { name: "plan_changed", props: { plan: "free", interval: "month" }, workspaceId: ws },
        ])
      })

      test("canceled, then a re-checkout reusing the same subscription id records plan_changed to pro", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        await applyBillingEvent(db, PROVIDER, event({ workspaceId: ws }))
        await applyBillingEvent(
          db,
          PROVIDER,
          event({
            workspaceId: ws,
            type: "customer.subscription.deleted",
            createdAt: at(10),
            subscription: sub({ status: "canceled" }),
          })
        )
        const { events, calls } = capturingEvents()
        // The mock provider reuses the canceled subscription's id for a workspace with nothing
        // live (mock.ts's `subscriptionIdFor`) — exactly the shape that used to record nothing,
        // back when the comparison was the raw `plan` column (unchanged: "pro" both times).
        await applyBillingEvent(
          db,
          PROVIDER,
          event({
            workspaceId: ws,
            type: "customer.subscription.created",
            createdAt: at(20),
            subscription: sub({ status: "active" }),
          }),
          events
        )
        expect(planChanged(calls)).toEqual([
          { name: "plan_changed", props: { plan: "pro", interval: "month" }, workspaceId: ws },
        ])
      })

      test("incomplete records nothing; a later active for the same subscription records pro", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        const { events, calls } = capturingEvents()
        await applyBillingEvent(
          db,
          PROVIDER,
          event({ workspaceId: ws, subscription: sub({ status: "incomplete" }) }),
          events
        )
        expect(planChanged(calls)).toEqual([])
        await applyBillingEvent(
          db,
          PROVIDER,
          event({
            workspaceId: ws,
            type: "customer.subscription.updated",
            createdAt: at(10),
            subscription: sub({ status: "active" }),
          }),
          events
        )
        expect(planChanged(calls)).toEqual([
          { name: "plan_changed", props: { plan: "pro", interval: "month" }, workspaceId: ws },
        ])
      })

      test("an interval change on a live plan (month to year) records plan_changed", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        await applyBillingEvent(db, PROVIDER, event({ workspaceId: ws }))
        const { events, calls } = capturingEvents()
        await applyBillingEvent(
          db,
          PROVIDER,
          event({
            workspaceId: ws,
            type: "customer.subscription.updated",
            createdAt: at(10),
            subscription: sub({ interval: "year" }),
          }),
          events
        )
        expect(planChanged(calls)).toEqual([
          { name: "plan_changed", props: { plan: "pro", interval: "year" }, workspaceId: ws },
        ])
      })

      test("a duplicate webhook delivery records nothing", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        const first = event({ workspaceId: ws })
        await applyBillingEvent(db, PROVIDER, first)
        const { events, calls } = capturingEvents()
        await applyBillingEvent(db, PROVIDER, first, events)
        expect(planChanged(calls)).toEqual([])
      })

      test("a stale (out-of-order) event records nothing", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        await applyBillingEvent(
          db,
          PROVIDER,
          event({ workspaceId: ws, createdAt: at(10), subscription: sub({ status: "active" }) })
        )
        const { events, calls } = capturingEvents()
        await applyBillingEvent(
          db,
          PROVIDER,
          event({
            workspaceId: ws,
            type: "customer.subscription.updated",
            createdAt: at(5),
            subscription: sub({ plan: "team" }),
          }),
          events
        )
        expect(planChanged(calls)).toEqual([])
      })

      test("the old subscription canceled after the workspace moved to a new one records no plan_changed to free", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        const { events, calls } = capturingEvents()
        const apply = (seconds: number, type: string, over: Partial<BillingSubscriptionEvent>) =>
          applyBillingEvent(
            db,
            PROVIDER,
            event({ workspaceId: ws, type, createdAt: at(seconds), subscription: sub(over) }),
            events
          )
        await apply(0, "customer.subscription.created", { subscriptionId: "sub_old" })
        // A second, live subscription on the team plan: the workspace moves to it.
        await apply(10, "customer.subscription.created", {
          subscriptionId: "sub_new",
          plan: "team",
        })
        // Then the old one is canceled: the workspace is still on team, so nothing changed.
        await apply(20, "customer.subscription.deleted", {
          subscriptionId: "sub_old",
          status: "canceled",
        })
        expect(planChanged(calls)).toEqual([
          { name: "plan_changed", props: { plan: "pro", interval: "month" }, workspaceId: ws },
          { name: "plan_changed", props: { plan: "team", interval: "month" }, workspaceId: ws },
        ])
        expect(await entitlementsForWorkspace(db, ws, { kind: "stripe" })).toMatchObject({
          plan: "team",
        })
      })
    })

    describe("subscription lifecycle", () => {
      test("cancel at period end, deleted, a new checkout, then a late event for the old id: the live one wins", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        const e = () => entitlementsForWorkspace(db, ws, { kind: "stripe" })
        const apply = (seconds: number, type: string, over: Partial<BillingSubscriptionEvent>) =>
          applyBillingEvent(
            db,
            PROVIDER,
            event({ workspaceId: ws, type, createdAt: at(seconds), subscription: sub(over) })
          )
        expect(
          await apply(0, "customer.subscription.created", { subscriptionId: "sub_A" })
        ).toEqual({ applied: true })
        expect(await e()).toMatchObject({ plan: "pro", cancelAtPeriodEnd: false })

        await apply(10, "customer.subscription.updated", {
          subscriptionId: "sub_A",
          cancelAtPeriodEnd: true,
        })
        expect(await e()).toMatchObject({ plan: "pro", status: "active", cancelAtPeriodEnd: true })

        await apply(20, "customer.subscription.deleted", {
          subscriptionId: "sub_A",
          status: "canceled",
        })
        expect(await e()).toMatchObject({ plan: "free", status: "canceled" })

        await apply(30, "customer.subscription.created", { subscriptionId: "sub_B" })
        expect(await e()).toMatchObject({ plan: "pro", status: "active" })

        // A late event for the old subscription, stamped after B's: it updates A's row, not B's.
        // The pause makes A's row the most recently written one, so only the status ordering saves B.
        await Bun.sleep(5)
        expect(
          await apply(40, "customer.subscription.updated", {
            subscriptionId: "sub_A",
            status: "unpaid",
          })
        ).toEqual({ applied: true })
        expect(await e()).toMatchObject({ plan: "pro", status: "active" })
        expect((await db.billing.subscriptions.latest(ws))?.subscription_id).toBe("sub_B")
      })

      test("A unpaid, B active, then a newer deleted for A: still Pro", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        const apply = (seconds: number, type: string, over: Partial<BillingSubscriptionEvent>) =>
          applyBillingEvent(
            db,
            PROVIDER,
            event({ workspaceId: ws, type, createdAt: at(seconds), subscription: sub(over) })
          )
        await apply(0, "customer.subscription.updated", {
          subscriptionId: "sub_A",
          status: "unpaid",
        })
        await apply(10, "customer.subscription.created", { subscriptionId: "sub_B" })
        await Bun.sleep(5)
        await apply(20, "customer.subscription.deleted", {
          subscriptionId: "sub_A",
          status: "canceled",
        })
        expect(await entitlementsForWorkspace(db, ws, { kind: "stripe" })).toMatchObject({
          plan: "pro",
          status: "active",
        })
      })
    })

    describe("customer id", () => {
      test("upsert never replaces a workspace's customer id, only its email", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        const upsert = (customerId: string, email: string | null) =>
          db.billing.customers.upsert({ workspaceId: ws, provider: PROVIDER, customerId, email })
        await upsert("cus_1", null)
        await upsert("cus_2", "new@example.com")
        expect(await db.billing.customers.find(ws)).toMatchObject({
          customer_id: "cus_1",
          email: "new@example.com",
        })
      })

      test("a different customer while a subscription is live is customer_changed and changes nothing", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        await applyBillingEvent(db, PROVIDER, event({ workspaceId: ws, customerId: "cus_1" }))
        const other = event({
          workspaceId: ws,
          customerId: "cus_2",
          createdAt: at(10),
          subscription: sub({ subscriptionId: "sub_2", plan: "team" }),
        })
        expect(await applyBillingEvent(db, PROVIDER, other)).toEqual({
          applied: false,
          reason: "customer_changed",
        })
        expect((await db.billing.customers.find(ws))?.customer_id).toBe("cus_1")
        expect(await db.billing.subscriptions.findBySubscriptionId(PROVIDER, "sub_2")).toBe(
          undefined
        )
        expect(await applyBillingEvent(db, PROVIDER, other)).toEqual({
          applied: false,
          reason: "duplicate",
        })
      })

      test("a different customer after the subscription ended replaces the customer id", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        await applyBillingEvent(db, PROVIDER, event({ workspaceId: ws, customerId: "cus_1" }))
        await applyBillingEvent(
          db,
          PROVIDER,
          event({
            workspaceId: ws,
            customerId: "cus_1",
            type: "customer.subscription.deleted",
            createdAt: at(10),
            subscription: sub({ status: "canceled" }),
          })
        )
        expect(
          await applyBillingEvent(
            db,
            PROVIDER,
            event({
              workspaceId: ws,
              customerId: "cus_2",
              createdAt: at(20),
              subscription: sub({ subscriptionId: "sub_2", plan: "team" }),
            })
          )
        ).toEqual({ applied: true })
        expect((await db.billing.customers.find(ws))?.customer_id).toBe("cus_2")
        expect(await db.billing.customers.findByCustomerId(PROVIDER, "cus_1")).toBeUndefined()
        expect(await entitlementsForWorkspace(db, ws, { kind: "stripe" })).toMatchObject({
          plan: "team",
          status: "active",
        })
      })
    })

    describe("entitlementsForWorkspace", () => {
      test("no rows: Free, seats used = members, no portal", async () => {
        const db = await fresh()
        const ws = await workspace(db, 2)
        const e = await entitlementsForWorkspace(db, ws, { kind: "mock" })
        expect(e).toMatchObject({
          plan: "free",
          status: "none",
          seatsUsed: 2,
          seatLimit: 3,
          portalAvailable: false,
        })
      })

      test("after a mock checkout: Pro, still no portal (mock); with stripe and a customer: portal", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        const mock = mockProvider(db)
        await mock.createCheckout({
          workspaceId: ws,
          plan: "pro",
          interval: "month",
          customerId: null,
          customerEmail: "o@example.com",
          successUrl: "http://account.example.com/ok",
          cancelUrl: "http://account.example.com/no",
        })
        const e = await entitlementsForWorkspace(db, ws, mock)
        expect(e).toMatchObject({ plan: "pro", status: "active", portalAvailable: false })
        expect((await entitlementsForWorkspace(db, ws, { kind: "stripe" })).portalAvailable).toBe(
          true
        )
      })

      test("works on a transaction-bound Queries", async () => {
        const db = await fresh()
        const ws = await workspace(db, 2)
        const e = await db.transaction((tx) => entitlementsForWorkspace(tx, ws, { kind: "mock" }))
        expect(e.seatsUsed).toBe(2)
      })

      test("assertSeatAvailable refuses at 3 members on Free, not at 2", async () => {
        const db = await fresh()
        const two = await entitlementsForWorkspace(db, await workspace(db, 2), { kind: "mock" })
        expect(() => assertSeatAvailable(two, "en")).not.toThrow()
        const three = await entitlementsForWorkspace(db, await workspace(db, 3), { kind: "mock" })
        const error = forbidden(() => assertSeatAvailable(three, "en"))
        expect(error.code).toBe("FORBIDDEN")
        expect(error.message).toBe(SEAT_LIMIT_MESSAGE)
      })

      test("assertEntitled(chat) refuses on Free, passes on Pro", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        const free = await entitlementsForWorkspace(db, ws, { kind: "mock" })
        const refused = forbidden(() => assertEntitled(free, "chat", "en"))
        expect(refused.code).toBe("FORBIDDEN")
        expect(refused.message).toBe("Upgrade to use chat")
        await mockProvider(db).change(ws, "pro", "month")
        const pro = await entitlementsForWorkspace(db, ws, { kind: "mock" })
        expect(() => assertEntitled(pro, "chat", "en")).not.toThrow()
      })
    })

    describe("mock provider", () => {
      test("checkout returns the success URL and activates; change switches; cancel → Free", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        const mock = mockProvider(db)
        expect(mock.kind).toBe("mock")
        expect(mock.hasPrice("team", "year")).toBe(true)
        const { url } = await mock.createCheckout({
          workspaceId: ws,
          plan: "pro",
          interval: "year",
          customerId: null,
          customerEmail: "o@example.com",
          successUrl: "http://account.example.com/ok",
          cancelUrl: "http://account.example.com/no",
        })
        expect(url).toBe("http://account.example.com/ok")
        const e = () => entitlementsForWorkspace(db, ws, mock)
        expect(await e()).toMatchObject({ plan: "pro", interval: "year" })

        const checkoutId = (await db.billing.subscriptions.latest(ws))?.id
        await mock.change(ws, "team", "month")
        expect(await e()).toMatchObject({ plan: "team", interval: "month" })
        // The same subscription switched plan: no second row.
        expect((await db.billing.subscriptions.latest(ws))?.id).toBe(checkoutId as number)

        await mock.change(ws, "cancel", "month")
        expect(await e()).toMatchObject({ plan: "free", status: "canceled" })

        expect(await mock.createPortal({ customerId: "mock_1", returnUrl: "http://r" })).toEqual({
          url: "http://r",
        })
        expect(await mock.verifyWebhook("{}", null)).toBeNull()
      })

      test("cancelSubscription on an unknown id is a no-op", async () => {
        const db = await fresh()
        const ws = await workspace(db)
        await mockProvider(db).cancelSubscription("mock_sub_missing")
        expect(await db.billing.subscriptions.latest(ws)).toBeUndefined()
      })
    })

    test("workspaces.delete removes its billing rows", async () => {
      const db = await fresh()
      const ws = await workspace(db)
      await applyBillingEvent(db, PROVIDER, event({ workspaceId: ws }))
      await db.workspaces.delete(ws)
      expect(await db.billing.subscriptions.latest(ws)).toBeUndefined()
      expect(await db.billing.customers.find(ws)).toBeUndefined()
      expect(await db.billing.customers.findByCustomerId(PROVIDER, "cus_1")).toBeUndefined()
    })
  })
}

describe("prices", () => {
  const env = {
    STRIPE_PRICE_PRO_MONTH: "price_pm",
    STRIPE_PRICE_PRO_YEAR: "price_py",
    STRIPE_PRICE_TEAM_MONTH: "price_tm",
    STRIPE_PRICE_TEAM_YEAR: "price_ty",
  }
  const table = [
    ["pro", "month", "price_pm"],
    ["pro", "year", "price_py"],
    ["team", "month", "price_tm"],
    ["team", "year", "price_ty"],
  ] as const
  for (const [plan, interval, price] of table) {
    test(`${plan}/${interval} ↔ ${price}`, () => {
      expect(priceFor(plan, interval, env)).toBe(price)
      expect(planForPrice(price, env)).toEqual({ plan, interval })
    })
  }
  test("unknown and unconfigured", () => {
    expect(planForPrice("price_other", env)).toBeNull()
    expect(priceFor("pro", "month", {})).toBeNull()
    expect(planForPrice("price_pm", {})).toBeNull()
  })
})

describe("billing procedures", () => {
  let app: Awaited<ReturnType<typeof start>>
  beforeAll(async () => {
    app = await start()
  })
  afterAll(() => app.stop())

  type Ctx = { workspaceId: number }
  const procedures: Record<
    string,
    { min: Role; call: (c: ApiClient, x: Ctx) => Promise<unknown> }
  > = {
    "billing.get": { min: "viewer", call: (c, x) => c.billing.get(x) },
    "billing.checkout": {
      min: "owner",
      call: (c, x) => c.billing.checkout({ ...x, plan: "pro", interval: "month" }),
    },
    "billing.portal": { min: "owner", call: (c, x) => c.billing.portal(x) },
    "billing.mockChange": {
      min: "owner",
      call: (c, x) => c.billing.mockChange({ ...x, plan: "team", interval: "month" }),
    },
  }

  describe("role matrix", () => {
    let owner: Awaited<ReturnType<typeof signUpWithWorkspace>>
    const actors = {} as Record<Exclude<Role, "owner">, Awaited<ReturnType<typeof signUp>>>
    let outsider: Awaited<ReturnType<typeof signUp>>

    beforeAll(async () => {
      owner = await signUpWithWorkspace(app)
      for (const role of ["viewer", "member", "admin"] as const) actors[role] = await signUp(app)
      outsider = await signUp(app)
    })

    /** A fresh Free workspace with one member per role and a mirrored customer (so the portal opens). */
    async function workspace(): Promise<Ctx> {
      const { id: workspaceId } = await owner.client.workspaces.create({ name: "Billing matrix" })
      for (const role of ["viewer", "member", "admin"] as const) {
        await app.db.memberships.add({ workspaceId, userId: actors[role].user.id, role })
      }
      await app.db.billing.customers.upsert({
        workspaceId,
        provider: "mock",
        customerId: `mock_${workspaceId}`,
        email: null,
      })
      return { workspaceId }
    }
    const clientOf = (role: Role) => (role === "owner" ? owner.client : actors[role].client)

    for (const [name, { min, call }] of Object.entries(procedures)) {
      for (const role of ROLES) {
        const allowed = ROLES.indexOf(role) >= ROLES.indexOf(min)
        test(`${name} as ${role}: ${allowed ? "ok" : "FORBIDDEN"}`, async () => {
          const ctx = await workspace()
          const [error] = await safe(call(clientOf(role), ctx))
          if (allowed) expect(error).toBeNull()
          else
            expect(error).toMatchObject({ code: "FORBIDDEN", message: `Requires the ${min} role` })
        })
      }
      test(`${name} as a non-member: NOT_FOUND`, async () => {
        const ctx = await workspace()
        const [error] = await safe(call(outsider.client, ctx))
        expect(error).toMatchObject({ code: "NOT_FOUND", message: "Workspace not found" })
      })
    }
  })

  test("a new workspace is Free on the mock provider", async () => {
    const { client, workspaceId } = await signUpWithWorkspace(app)
    expect(await client.billing.get({ workspaceId })).toEqual({
      plan: "free",
      planName: "Free",
      status: "none",
      features: [],
      seatLimit: 3,
      seatsUsed: 1,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      interval: null,
      portalAvailable: false,
      provider: "mock",
    })
  })

  test("mock checkout activates Pro; a second checkout is CONFLICT", async () => {
    const { client, workspaceId } = await signUpWithWorkspace(app)
    const { url } = await client.billing.checkout({ workspaceId, plan: "pro", interval: "year" })
    expect(url).toBe("http://account.example.com/payments?checkout=success")
    expect(await client.billing.get({ workspaceId })).toMatchObject({
      plan: "pro",
      status: "active",
      interval: "year",
      seatLimit: 10,
      provider: "mock",
      portalAvailable: false,
    })
    const [again] = await safe(
      client.billing.checkout({ workspaceId, plan: "team", interval: "month" })
    )
    expect(again).toMatchObject({
      code: "CONFLICT",
      message: "Use the billing portal to change your plan",
    })
  })

  test("checkout after a canceled subscription is allowed again", async () => {
    const { client, workspaceId } = await signUpWithWorkspace(app)
    await client.billing.mockChange({ workspaceId, plan: "pro", interval: "month" })
    await client.billing.mockChange({ workspaceId, plan: "cancel", interval: "month" })
    const [error] = await safe(
      client.billing.checkout({ workspaceId, plan: "team", interval: "month" })
    )
    expect(error).toBeNull()
    expect((await client.billing.get({ workspaceId })).plan).toBe("team")
  })

  test("portal without a customer is NOT_FOUND; with one it returns to the Payments page", async () => {
    const { client, workspaceId } = await signUpWithWorkspace(app)
    const [error] = await safe(client.billing.portal({ workspaceId }))
    expect(error).toMatchObject({ code: "NOT_FOUND", message: "No billing account yet" })
    await client.billing.checkout({ workspaceId, plan: "pro", interval: "month" })
    expect(await client.billing.portal({ workspaceId })).toEqual({
      url: "http://account.example.com/payments",
    })
  })

  test("mockChange to team, then cancel → back on Free", async () => {
    const { client, workspaceId } = await signUpWithWorkspace(app)
    expect(
      await client.billing.mockChange({ workspaceId, plan: "team", interval: "month" })
    ).toMatchObject({ plan: "team", seatLimit: null, features: ["chat", "api"], provider: "mock" })
    expect(
      await client.billing.mockChange({ workspaceId, plan: "cancel", interval: "month" })
    ).toMatchObject({ plan: "free", status: "canceled", seatLimit: 3, features: [] })
  })

  describe("on a stripe provider", () => {
    let stripe: Awaited<ReturnType<typeof start>>
    const checkouts: unknown[] = []
    beforeAll(async () => {
      stripe = await start({
        billing: () => ({
          kind: "stripe",
          createCheckout: async (input) => {
            checkouts.push(input)
            return { url: "https://checkout.stripe.example/c" }
          },
          createPortal: async () => ({ url: "https://portal.stripe.example/p" }),
          hasPrice: (plan, interval) => !(plan === "team" && interval === "year"),
          cancelSubscription: async () => {},
          verifyWebhook: async () => null,
        }),
      })
    })
    afterAll(() => stripe.stop())

    test("mockChange is NOT_FOUND with its own message", async () => {
      const { client, workspaceId } = await signUpWithWorkspace(stripe)
      const [error] = await safe(
        client.billing.mockChange({ workspaceId, plan: "pro", interval: "month" })
      )
      expect(error).toMatchObject({ code: "NOT_FOUND", message: "Mock billing is not enabled" })
    })

    test("an unpriced plan is BAD_REQUEST; a priced one goes to the provider with the caller's email", async () => {
      const { client, workspaceId, email } = await signUpWithWorkspace(stripe)
      const [error] = await safe(
        client.billing.checkout({ workspaceId, plan: "team", interval: "year" })
      )
      expect(error).toMatchObject({ code: "BAD_REQUEST", message: "This plan is not available" })
      expect(
        await client.billing.checkout({ workspaceId, plan: "pro", interval: "month" })
      ).toEqual({ url: "https://checkout.stripe.example/c" })
      expect(checkouts.at(-1)).toEqual({
        workspaceId,
        plan: "pro",
        interval: "month",
        customerId: null,
        customerEmail: email,
        successUrl: "http://account.example.com/payments?checkout=success",
        cancelUrl: "http://account.example.com/payments?checkout=cancelled",
      })
    })

    test("a mirrored customer is reused for checkout and opens the portal", async () => {
      const { client, workspaceId } = await signUpWithWorkspace(stripe)
      await stripe.db.billing.customers.upsert({
        workspaceId,
        provider: "stripe",
        customerId: "cus_reuse",
        email: null,
      })
      await client.billing.checkout({ workspaceId, plan: "pro", interval: "month" })
      expect(checkouts.at(-1)).toMatchObject({ customerId: "cus_reuse" })
      expect((await client.billing.get({ workspaceId })).portalAvailable).toBe(true)
      expect(await client.billing.portal({ workspaceId })).toEqual({
        url: "https://portal.stripe.example/p",
      })
    })
  })
})
