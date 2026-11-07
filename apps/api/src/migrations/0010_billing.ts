import { type Dialect, ddl } from "../dialect"
import type { Migration } from "../migrate"

// Billing mirror per workspace: who the provider knows us as, the latest subscription state the
// webhooks reported, and every event id we have applied (so a redelivery is a no-op).
const billing: Migration = {
  name: "0010_billing",
  async up(sql, dialect: Dialect) {
    await sql.unsafe(`
      CREATE TABLE billing_customers (
        workspace_id INTEGER PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (provider, customer_id)
      )
    `)
    await sql.unsafe(`
      CREATE TABLE billing_subscriptions (
        id ${ddl.serialId(dialect)},
        workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        subscription_id TEXT NOT NULL,
        plan TEXT NOT NULL CHECK (plan IN ('pro', 'team')),
        interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
        status TEXT NOT NULL CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'unpaid')),
        current_period_end TEXT,
        cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
        -- When the provider created the event this row reflects (ISO); an older event never
        -- overwrites a newer one. Added in place: 0010 is not merged yet, and the forward-only
        -- rule protects merged migrations only.
        source_updated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (provider, subscription_id)
      )
    `)
    await sql.unsafe(
      "CREATE INDEX billing_subscriptions_workspace ON billing_subscriptions (workspace_id, updated_at)"
    )
    await sql.unsafe(`
      CREATE TABLE billing_events (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        type TEXT NOT NULL,
        received_at TEXT NOT NULL
      )
    `)
    // For pruning: rows older than the provider's retry window can go.
    await sql.unsafe("CREATE INDEX billing_events_received ON billing_events (received_at)")
  },
}

export default billing
