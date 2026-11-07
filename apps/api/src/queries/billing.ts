import type { BillingStatus, Interval, PlanKey } from "@repo/api-contract"
import type { SQL } from "bun"

export type CustomerRow = {
  workspace_id: number
  provider: string
  customer_id: string
  email: string | null
  created_at: string
  updated_at: string
}
export type SubscriptionRow = {
  id: number
  workspace_id: number
  provider: string
  subscription_id: string
  plan: Exclude<PlanKey, "free">
  interval: Interval
  status: BillingStatus
  current_period_end: string | null
  /** Stored as INTEGER 0/1 on both engines: read with `Boolean(Number(v))`. */
  cancel_at_period_end: number | boolean
  /** The provider's creation time of the event this row reflects (ISO). */
  source_updated_at: string | null
  created_at: string
  updated_at: string
}

export function billingQueries(sql: SQL) {
  const now = () => new Date().toISOString()
  return {
    customers: {
      async upsert(input: {
        workspaceId: number
        provider: string
        customerId: string
        email: string | null
      }) {
        const at = now()
        await sql`
          INSERT INTO billing_customers (workspace_id, provider, customer_id, email, created_at, updated_at)
          VALUES (${input.workspaceId}, ${input.provider}, ${input.customerId}, ${input.email}, ${at}, ${at})
          ON CONFLICT (workspace_id) DO UPDATE SET
            email = COALESCE(excluded.email, billing_customers.email), updated_at = excluded.updated_at
        `
      },
      /**
       * A user's address changed: every customer record holding the old one (stored as the
       * provider reported it, any case) now holds the new one. The provider itself is not told.
       */
      async followEmail(from: string, to: string) {
        await sql`
          UPDATE billing_customers SET email = ${to}, updated_at = ${now()}
          WHERE lower(email) = ${from.toLowerCase()}
        `
      },
      /**
       * Points a workspace at a different provider customer. Only the mirror calls it, and only
       * once the workspace has no live subscription (a new checkout under a new customer).
       */
      async replace(input: {
        workspaceId: number
        provider: string
        customerId: string
        email: string | null
      }) {
        await sql`
          UPDATE billing_customers SET provider = ${input.provider}, customer_id = ${input.customerId},
            email = COALESCE(${input.email}, email), updated_at = ${now()}
          WHERE workspace_id = ${input.workspaceId}
        `
      },
      async find(workspaceId: number): Promise<CustomerRow | undefined> {
        const rows: CustomerRow[] =
          await sql`SELECT * FROM billing_customers WHERE workspace_id = ${workspaceId}`
        return rows[0]
      },
      async findByCustomerId(
        provider: string,
        customerId: string
      ): Promise<CustomerRow | undefined> {
        const rows: CustomerRow[] =
          await sql`SELECT * FROM billing_customers WHERE provider = ${provider} AND customer_id = ${customerId}`
        return rows[0]
      },
    },
    subscriptions: {
      async upsert(input: {
        workspaceId: number
        provider: string
        subscriptionId: string
        plan: Exclude<PlanKey, "free">
        interval: Interval
        status: BillingStatus
        currentPeriodEnd: string | null
        cancelAtPeriodEnd: boolean
        /** When the provider created the event (ISO): an older event than the row's is skipped. */
        sourceUpdatedAt: string
      }): Promise<boolean> {
        const at = now()
        // `>=`, not `>`: two events stamped the same second apply in delivery order.
        const rows: { id: number }[] = await sql`
          INSERT INTO billing_subscriptions
            (workspace_id, provider, subscription_id, plan, interval, status, current_period_end, cancel_at_period_end, source_updated_at, created_at, updated_at)
          VALUES (${input.workspaceId}, ${input.provider}, ${input.subscriptionId}, ${input.plan}, ${input.interval}, ${input.status}, ${input.currentPeriodEnd}, ${input.cancelAtPeriodEnd ? 1 : 0}, ${input.sourceUpdatedAt}, ${at}, ${at})
          ON CONFLICT (provider, subscription_id) DO UPDATE SET
            workspace_id = excluded.workspace_id, plan = excluded.plan, interval = excluded.interval,
            status = excluded.status, current_period_end = excluded.current_period_end,
            cancel_at_period_end = excluded.cancel_at_period_end,
            source_updated_at = excluded.source_updated_at, updated_at = excluded.updated_at
          WHERE billing_subscriptions.source_updated_at IS NULL
            OR excluded.source_updated_at >= billing_subscriptions.source_updated_at
          RETURNING id
        `
        /** False when the row holds a newer event's state and this one was skipped. */
        return rows.length > 0
      },
      /**
       * The subscription that decides a workspace's plan: a live one (active, trialing, past_due)
       * before any ended one, then the newest event, so a late event for an old subscription id
       * never hides a newer live subscription. Canceled ones are returned when nothing is live.
       */
      async latest(workspaceId: number): Promise<SubscriptionRow | undefined> {
        const rows: SubscriptionRow[] = await sql`
          SELECT * FROM billing_subscriptions WHERE workspace_id = ${workspaceId}
          ORDER BY CASE WHEN status IN ('active', 'trialing', 'past_due') THEN 0 ELSE 1 END,
            source_updated_at DESC, updated_at DESC, id DESC
          LIMIT 1
        `
        return rows[0]
      },
      async findBySubscriptionId(
        provider: string,
        subscriptionId: string
      ): Promise<SubscriptionRow | undefined> {
        const rows: SubscriptionRow[] = await sql`
          SELECT * FROM billing_subscriptions WHERE provider = ${provider} AND subscription_id = ${subscriptionId}
        `
        return rows[0]
      },
    },
    events: {
      /** Records the event id; false when it was already recorded (a redelivery). */
      async record(id: string, provider: string, type: string): Promise<boolean> {
        const rows: { id: string }[] = await sql`
          INSERT INTO billing_events (id, provider, type, received_at)
          VALUES (${id}, ${provider}, ${type}, ${now()})
          ON CONFLICT (id) DO NOTHING RETURNING id
        `
        return rows.length > 0
      },
    },
  }
}
