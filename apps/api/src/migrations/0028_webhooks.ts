import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// Outgoing webhooks (Phase 11 B). `webhook_endpoints`: one row per endpoint a workspace admin
// registered. `events` is a JSON array of subscribed event types (at least one). `secret` is
// what Standard Webhooks signs with, stored encrypted (AES-256-GCM, in the same format as TOTP
// secrets) so it can be read back to sign. `created_by` carries
// no foreign key, like `api_keys.created_by`: the endpoint belongs to the workspace. `enabled` is
// 0/1; `disabled_reason` says why it is off (`failures`, `gone` after a 410, `manual`).
//
// `webhook_deliveries`: one row per delivery attempt — the HTTP status or an error class, never a
// request or response body. Both cascade on Postgres; `workspaces.delete` also deletes the rows
// explicitly, since SQLite may not enforce foreign keys.
const webhooks: Migration = {
  name: "0028_webhooks",
  async up(sql, dialect) {
    await sql.unsafe(`
      CREATE TABLE webhook_endpoints (
        id ${ddl.serialId(dialect)},
        workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        url TEXT NOT NULL CHECK (length(url) BETWEEN 1 AND 2000),
        description TEXT CHECK (description IS NULL OR length(description) <= 200),
        events TEXT NOT NULL CHECK (events <> '[]' AND length(events) > 2),
        secret TEXT NOT NULL,
        created_by INTEGER,
        created_at TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        disabled_at TEXT,
        disabled_reason TEXT CHECK (
          disabled_reason IS NULL OR disabled_reason IN ('failures', 'gone', 'manual')
        )
      )
    `)
    await sql.unsafe(
      "CREATE INDEX webhook_endpoints_workspace_id ON webhook_endpoints (workspace_id)"
    )
    await sql.unsafe(`
      CREATE TABLE webhook_deliveries (
        id ${ddl.serialId(dialect)},
        endpoint_id INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
        event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        status INTEGER,
        error TEXT CHECK (
          error IS NULL OR error IN ('timeout', 'network', 'blocked', 'redirect', 'http')
        ),
        duration_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    await sql.unsafe(
      "CREATE INDEX webhook_deliveries_endpoint_created ON webhook_deliveries (endpoint_id, created_at)"
    )
    // webhooks.prune's nightly `DELETE … WHERE created_at < ?` across every endpoint.
    await sql.unsafe(
      "CREATE INDEX webhook_deliveries_created_at ON webhook_deliveries (created_at)"
    )
  },
}

export default webhooks
