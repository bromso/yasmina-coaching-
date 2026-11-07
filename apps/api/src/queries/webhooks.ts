import type { SQL } from "bun"

/** One `webhook_endpoints` row. `secret` (encrypted) never leaves the api: the summary drops it. */
export type WebhookEndpointRow = {
  id: number
  workspace_id: number
  url: string
  description: string | null
  /** JSON array text of subscribed event types. */
  events: string
  /** `v1:<iv>:<ct>`: the `whsec_…` secret, AES-256-GCM under TWO_FACTOR_ENCRYPTION_KEY. */
  secret: string
  /** No foreign key: may name a user whose account was purged. */
  created_by: number | null
  created_at: string
  enabled: boolean
  consecutive_failures: number
  disabled_at: string | null
  disabled_reason: "failures" | "gone" | "manual" | null
}

/** One `webhook_deliveries` row: a status or an error class, never a body. */
export type WebhookDeliveryRow = {
  id: number
  endpoint_id: number
  event_id: string
  event_type: string
  attempt: number
  status: number | null
  error: "timeout" | "network" | "blocked" | "redirect" | "http" | null
  duration_ms: number
  created_at: string
}

/** An endpoint for the workspace's own list: the creator's current name (null once the account is
 * gone) and its newest delivery attempt (null before the first). Never the secret, not even
 * encrypted: only `find` (the delivery job) reads that column. */
export type WebhookEndpointListRow = Omit<WebhookEndpointRow, "secret"> & {
  creator_name: string | null
  last_delivery: WebhookDeliveryRow | null
}

type RawEndpoint = Omit<WebhookEndpointRow, "enabled"> & { enabled: number | string | boolean }
type RawListRow = Omit<RawEndpoint, "secret"> & {
  creator_name: string | null
  ld_id: number | string | null
  ld_event_id: string | null
  ld_event_type: string | null
  ld_attempt: number | string | null
  ld_status: number | string | null
  ld_error: WebhookDeliveryRow["error"]
  ld_duration_ms: number | string | null
  ld_created_at: string | null
}

const nullableNumber = (value: number | string | null) => (value === null ? null : Number(value))

/** Postgres may hand back numeric columns as strings in some shapes; keep callers on numbers. */
const toEndpointFields = (
  row: Omit<RawEndpoint, "secret">
): Omit<WebhookEndpointRow, "secret"> => ({
  id: Number(row.id),
  workspace_id: Number(row.workspace_id),
  url: row.url,
  description: row.description,
  events: row.events,
  created_by: nullableNumber(row.created_by),
  created_at: row.created_at,
  enabled: Number(row.enabled) === 1 || row.enabled === true,
  consecutive_failures: Number(row.consecutive_failures),
  disabled_at: row.disabled_at,
  disabled_reason: row.disabled_reason,
})

const toEndpoint = (row: RawEndpoint): WebhookEndpointRow => ({
  ...toEndpointFields(row),
  secret: row.secret,
})

const toDelivery = (row: WebhookDeliveryRow): WebhookDeliveryRow => ({
  ...row,
  id: Number(row.id),
  endpoint_id: Number(row.endpoint_id),
  attempt: Number(row.attempt),
  status: nullableNumber(row.status),
  duration_ms: Number(row.duration_ms),
})

const toListRow = (row: RawListRow): WebhookEndpointListRow => {
  const endpoint = toEndpointFields(row)
  return {
    ...endpoint,
    creator_name: row.creator_name,
    last_delivery:
      row.ld_id === null
        ? null
        : {
            id: Number(row.ld_id),
            endpoint_id: endpoint.id,
            event_id: row.ld_event_id as string,
            event_type: row.ld_event_type as string,
            attempt: Number(row.ld_attempt),
            status: nullableNumber(row.ld_status),
            error: row.ld_error,
            duration_ms: Number(row.ld_duration_ms),
            created_at: row.ld_created_at as string,
          },
  }
}

/** The stored events column as the event names it holds (anything unparseable reads as none). */
export const parseWebhookEvents = (text: string): string[] => {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
  } catch {
    return []
  }
}

export function webhooksQueries(sql: SQL) {
  // The newest delivery of each endpoint — the same order `listDeliveries` uses, so the list's
  // "last delivery" is always that page's first row — joined in. Explicit columns: no secret.
  const listSelect = (where: SQL.Query<unknown>) => sql`
    SELECT e.id, e.workspace_id, e.url, e.description, e.events, e.created_by, e.created_at,
      e.enabled, e.consecutive_failures, e.disabled_at, e.disabled_reason,
      u.name AS creator_name,
      d.id AS ld_id, d.event_id AS ld_event_id, d.event_type AS ld_event_type,
      d.attempt AS ld_attempt, d.status AS ld_status, d.error AS ld_error,
      d.duration_ms AS ld_duration_ms, d.created_at AS ld_created_at
    FROM webhook_endpoints e
    LEFT JOIN users u ON u.id = e.created_by
    LEFT JOIN webhook_deliveries d ON d.id = (
      SELECT x.id FROM webhook_deliveries x WHERE x.endpoint_id = e.id
      ORDER BY x.created_at DESC, x.id DESC LIMIT 1
    )
    WHERE ${where}
    ORDER BY e.created_at DESC, e.id DESC
  `

  return {
    async create(input: {
      workspaceId: number
      url: string
      description: string | null
      events: readonly string[]
      /** Already encrypted (`encryptWebhookSecret`). */
      secret: string
      createdBy: number
      createdAt: string
    }): Promise<WebhookEndpointRow> {
      const [row]: RawEndpoint[] = await sql`
        INSERT INTO webhook_endpoints (workspace_id, url, description, events, secret, created_by,
          created_at)
        VALUES (${input.workspaceId}, ${input.url}, ${input.description},
          ${JSON.stringify(input.events)}, ${input.secret}, ${input.createdBy}, ${input.createdAt})
        RETURNING *
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return toEndpoint(row)
    },

    /** Every endpoint of the workspace, newest first, with its creator and last delivery. */
    async listForWorkspace(workspaceId: number): Promise<WebhookEndpointListRow[]> {
      const rows: RawListRow[] = await listSelect(sql`e.workspace_id = ${workspaceId}`)
      return rows.map(toListRow)
    },

    /** One of the workspace's own endpoints — undefined for another workspace's id. */
    async findInWorkspace(
      id: number,
      workspaceId: number
    ): Promise<WebhookEndpointListRow | undefined> {
      const [row]: RawListRow[] = await listSelect(
        sql`e.id = ${id} AND e.workspace_id = ${workspaceId}`
      )
      return row && toListRow(row)
    },

    /** One endpoint by id, whatever its workspace (the delivery job re-loads it this way). */
    async find(id: number): Promise<WebhookEndpointRow | undefined> {
      const [row]: RawEndpoint[] = await sql`SELECT * FROM webhook_endpoints WHERE id = ${id}`
      return row && toEndpoint(row)
    },

    /** The workspace's enabled endpoints subscribed to `eventType`, oldest first. */
    async listSubscribed(workspaceId: number, eventType: string): Promise<WebhookEndpointRow[]> {
      const rows: RawEndpoint[] = await sql`
        SELECT * FROM webhook_endpoints WHERE workspace_id = ${workspaceId} AND enabled = 1
        ORDER BY id
      `
      return rows
        .map(toEndpoint)
        .filter((row) => parseWebhookEvents(row.events).includes(eventType))
    },

    /** What the cap counts: every endpoint, enabled or not. */
    async countForWorkspace(workspaceId: number): Promise<number> {
      const [row]: Array<{ n: number | string }> = await sql`
        SELECT COUNT(*) AS n FROM webhook_endpoints WHERE workspace_id = ${workspaceId}
      `
      return Number(row?.n ?? 0)
    },

    /** Changes the given fields of one of the workspace's endpoints; false when there is none. */
    async update(
      id: number,
      workspaceId: number,
      fields: { url?: string; description?: string | null; events?: readonly string[] }
    ): Promise<boolean> {
      const current = await sql`
        SELECT url, description, events FROM webhook_endpoints
        WHERE id = ${id} AND workspace_id = ${workspaceId}
      `
      const [row] = current as Array<{ url: string; description: string | null; events: string }>
      if (!row) return false
      const url = fields.url ?? row.url
      const description = fields.description === undefined ? row.description : fields.description
      const events = fields.events === undefined ? row.events : JSON.stringify(fields.events)
      await sql`
        UPDATE webhook_endpoints SET url = ${url}, description = ${description}, events = ${events}
        WHERE id = ${id} AND workspace_id = ${workspaceId}
      `
      return true
    },

    /** Turns an endpoint back on: clears the reason and the failure count. False when it was on. */
    async enable(id: number, workspaceId: number): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE webhook_endpoints
        SET enabled = 1, disabled_at = NULL, disabled_reason = NULL, consecutive_failures = 0
        WHERE id = ${id} AND workspace_id = ${workspaceId} AND enabled = 0
        RETURNING id
      `
      return rows.length > 0
    },

    /** Turns an endpoint off with `reason`, stamping `at`. False when it was already off (its
     * first reason and time are kept). */
    async disable(
      id: number,
      reason: "failures" | "gone" | "manual",
      at: string
    ): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE webhook_endpoints SET enabled = 0, disabled_at = ${at}, disabled_reason = ${reason}
        WHERE id = ${id} AND enabled = 1
        RETURNING id
      `
      return rows.length > 0
    },

    /** Replaces the (encrypted) signing secret; false when there is no such endpoint. */
    async setSecret(id: number, workspaceId: number, secret: string): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE webhook_endpoints SET secret = ${secret}
        WHERE id = ${id} AND workspace_id = ${workspaceId}
        RETURNING id
      `
      return rows.length > 0
    },

    /** Deletes one of the workspace's endpoints and its delivery log (explicitly — SQLite may not
     * enforce the cascade). False when there is no such endpoint. */
    async delete(id: number, workspaceId: number): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        SELECT id FROM webhook_endpoints WHERE id = ${id} AND workspace_id = ${workspaceId}
      `
      if (rows.length === 0) return false
      await sql`DELETE FROM webhook_deliveries WHERE endpoint_id = ${id}`
      await sql`DELETE FROM webhook_endpoints WHERE id = ${id}`
      return true
    },

    /** A success: the failure count back to 0. */
    async resetFailures(id: number): Promise<void> {
      await sql`UPDATE webhook_endpoints SET consecutive_failures = 0 WHERE id = ${id}`
    },

    /** A dead delivery: the failure count plus one; resolves to the new count (0 when gone). */
    async incrementFailures(id: number): Promise<number> {
      const [row]: Array<{ consecutive_failures: number | string }> = await sql`
        UPDATE webhook_endpoints SET consecutive_failures = consecutive_failures + 1
        WHERE id = ${id}
        RETURNING consecutive_failures
      `
      return Number(row?.consecutive_failures ?? 0)
    },

    /** Records one delivery attempt. */
    async recordDelivery(input: {
      endpointId: number
      eventId: string
      eventType: string
      attempt: number
      status: number | null
      error: WebhookDeliveryRow["error"]
      durationMs: number
      createdAt: string
    }): Promise<WebhookDeliveryRow> {
      const [row]: WebhookDeliveryRow[] = await sql`
        INSERT INTO webhook_deliveries (endpoint_id, event_id, event_type, attempt, status, error,
          duration_ms, created_at)
        VALUES (${input.endpointId}, ${input.eventId}, ${input.eventType}, ${input.attempt},
          ${input.status}, ${input.error}, ${Math.max(0, Math.round(input.durationMs))},
          ${input.createdAt})
        RETURNING *
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return toDelivery(row)
    },

    /** The endpoint's newest `limit` attempts, newest first. */
    async listDeliveries(endpointId: number, limit: number): Promise<WebhookDeliveryRow[]> {
      const rows: WebhookDeliveryRow[] = await sql`
        SELECT * FROM webhook_deliveries WHERE endpoint_id = ${endpointId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit}
      `
      return rows.map(toDelivery)
    },

    /** Deletes delivery rows created before `before` (ISO); resolves to how many. */
    async pruneDeliveries(before: string): Promise<number> {
      const rows: Array<{ id: number }> = await sql`
        DELETE FROM webhook_deliveries WHERE created_at < ${before} RETURNING id
      `
      return rows.length
    },
  }
}
