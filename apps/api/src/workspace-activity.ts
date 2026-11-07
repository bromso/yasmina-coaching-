import {
  WORKSPACE_ACTIVITY_ACTIONS,
  WORKSPACE_ACTIVITY_CURSOR_PATTERN,
  WORKSPACE_ACTIVITY_DAYS,
  WORKSPACE_ACTIVITY_TARGET_TYPES,
  type WorkspaceActivityAction,
  type WorkspaceActivityActor,
  type WorkspaceActivityDetails,
  type WorkspaceActivityItem,
  type WorkspaceActivityPage,
  type WorkspaceActivityTargetType,
} from "@repo/api-contract"
import type { Queries } from "./db"
import type { WorkspaceActivityRow } from "./queries/audit"

// `workspaces.activity.list` (Phase 12 A): a workspace's audit rows, as its admins may see them.
// Everything shown is chosen here by name — the row was read by an explicit column list
// (`audit.listForWorkspace`), and its metadata is cut to the display allowlist below.

const DAY_MS = 86_400_000

/** The earliest `at` the list reads: exactly `WORKSPACE_ACTIVITY_DAYS` before `now`, inclusive. */
export const activitySince = (now: Date) =>
  new Date(now.getTime() - WORKSPACE_ACTIVITY_DAYS * DAY_MS).toISOString()

export const encodeActivityCursor = (row: { at: string; id: number }) => `${row.at}_${row.id}`

/** The `(at, id)` a cursor names; undefined for a malformed one (the contract refuses those). */
export function decodeActivityCursor(cursor: string): { at: string; id: number } | undefined {
  const match = WORKSPACE_ACTIVITY_CURSOR_PATTERN.exec(cursor)
  if (!match) return undefined
  return { at: match[1] as string, id: Number(match[2]) }
}

type DetailKey = keyof WorkspaceActivityDetails

/** Per action, the stored metadata keys a workspace admin sees (design §2); nothing else is. */
export const ACTIVITY_DETAILS: Readonly<Record<WorkspaceActivityAction, readonly DetailKey[]>> = {
  "workspace.created": ["name"],
  "workspace.renamed": ["from", "to"],
  "workspace.logo_set": [],
  "workspace.logo_removed": [],
  "workspace.ownership_transferred": [],
  "workspace.plan_changed": ["plan", "interval", "status"],
  "invitation.accepted": ["role"],
  "member.role_changed": ["from", "to"],
  "member.removed": [],
  "workspace.left": [],
  "invitation.created": ["role", "email"],
  "invitation.revoked": ["role", "email"],
  "workspace.api_key_created": ["name", "scopes"],
  "workspace.api_key_revoked": ["name", "scopes"],
  "workspace.webhook_created": ["host", "events"],
  "workspace.webhook_updated": ["host", "events"],
  "workspace.webhook_secret_rotated": ["host"],
  "workspace.webhook_deleted": ["host", "events"],
  "workspace.webhook_disabled": ["host", "events", "reason"],
  "workspace.two_factor_requirement_changed": ["enabled"],
  "workspace.invite_domains_changed": ["added", "removed"],
}

/**
 * The only actions the system (no user, no API key) ever records: a provider webhook's plan
 * change and the delivery job disabling an endpoint. Any other row with no actor was written by an
 * account since purged (the purge nulls `actor_user_id`).
 */
const SYSTEM_ACTIONS: ReadonlySet<string> = new Set([
  "workspace.plan_changed",
  "workspace.webhook_disabled",
])

const LIST_KEYS: ReadonlySet<DetailKey> = new Set(["scopes", "events", "added", "removed"])

function parseMetadata(text: string | null): Record<string, unknown> {
  if (!text) return {}
  try {
    const value: unknown = JSON.parse(text)
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** The allowlisted keys of `metadata`, each kept only when it has the shape the schema declares. */
export function activityDetails(
  action: WorkspaceActivityAction,
  metadata: Record<string, unknown>
): WorkspaceActivityDetails {
  const details: Record<string, unknown> = {}
  for (const key of ACTIVITY_DETAILS[action]) {
    const value = metadata[key]
    if (LIST_KEYS.has(key)) {
      if (Array.isArray(value) && value.every((item) => typeof item === "string"))
        details[key] = value
    } else if (key === "reason") {
      if (value === "failures" || value === "gone") details[key] = value
    } else if (key === "enabled") {
      if (typeof value === "boolean") details[key] = value
    } else if (typeof value === "string") {
      details[key] = value
    }
  }
  return details as WorkspaceActivityDetails
}

const positiveId = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined

const isAction = (action: string): action is WorkspaceActivityAction =>
  (WORKSPACE_ACTIVITY_ACTIONS as readonly string[]).includes(action)

const isTargetType = (type: string | null): type is WorkspaceActivityTargetType =>
  type !== null && (WORKSPACE_ACTIVITY_TARGET_TYPES as readonly string[]).includes(type)

/**
 * One page of the workspace's activity: rows at or after `activitySince(now)`, older than
 * `cursor` when given, with actors and targets resolved against the accounts and keys that still
 * exist. Platform staff never appear: an impersonated row names the member, `bySupport`.
 */
export async function listWorkspaceActivity(
  db: Pick<Queries, "audit">,
  input: {
    workspaceId: number
    now: Date
    cursor?: string
    limit: number
    action?: WorkspaceActivityAction
  }
): Promise<WorkspaceActivityPage> {
  const before = input.cursor === undefined ? undefined : decodeActivityCursor(input.cursor)
  const rows = await db.audit.listForWorkspace({
    workspaceId: input.workspaceId,
    sinceIso: activitySince(input.now),
    before,
    action: input.action,
    limit: input.limit + 1,
  })
  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  const nextCursor = rows.length > input.limit && last ? encodeActivityCursor(last) : null

  const parsed = page.map((row) => ({ row, metadata: parseMetadata(row.metadata) }))
  const userIds = new Set<number>()
  const keyIds = new Set<number>()
  for (const { row, metadata } of parsed) {
    const who = actorUserId(row, metadata)
    if (who !== undefined) userIds.add(who)
    if (row.target_type === "user") {
      const id = positiveId(Number(row.target_id))
      if (id !== undefined) userIds.add(id)
    }
    if (row.target_type === "api_key") {
      const id = positiveId(Number(row.target_id))
      if (id !== undefined) keyIds.add(id)
    }
    const keyId = positiveId(metadata.apiKeyId)
    if (keyId !== undefined) keyIds.add(keyId)
  }
  const [people, keyNames] = await Promise.all([
    db.audit.peopleIn(input.workspaceId, [...userIds]),
    db.audit.apiKeyNamesIn(input.workspaceId, [...keyIds]),
  ])

  const items: WorkspaceActivityItem[] = []
  for (const { row, metadata } of parsed) {
    if (!isAction(row.action)) continue
    items.push({
      id: row.id,
      at: row.at,
      action: row.action,
      actor: actorOf(row, metadata, people, keyNames),
      target: targetOf(row, metadata, people, keyNames),
      details: activityDetails(row.action, metadata),
    })
  }
  return { items, nextCursor }
}

/**
 * The account a row is by, as the workspace sees it: the member who was impersonated, or the
 * actor when nobody was. Undefined for an impersonated row whose member is gone (`bySupport`
 * kept, `impersonated_user_id` nulled by the purge) — the actor left there is staff.
 */
function actorUserId(
  row: WorkspaceActivityRow,
  metadata: Record<string, unknown>
): number | undefined {
  if (row.impersonated_user_id !== null) return row.impersonated_user_id
  if (metadata.bySupport === true) return undefined
  return row.actor_user_id ?? undefined
}

function actorOf(
  row: WorkspaceActivityRow,
  metadata: Record<string, unknown>,
  people: Map<number, { name: string; email: string | null }>,
  keyNames: Map<number, string>
): WorkspaceActivityActor {
  const bySupport = row.impersonated_user_id !== null || metadata.bySupport === true
  const userId = actorUserId(row, metadata)
  if (userId !== undefined) {
    const person = people.get(userId)
    // Every caller is admin or above, so a current member's address is shown; a former member's
    // is not (`peopleIn` returns it null).
    return person
      ? { kind: "member", userId, name: person.name, email: person.email, bySupport }
      : { kind: "deleted" }
  }
  if (bySupport) return { kind: "deleted" }
  const keyId = positiveId(metadata.apiKeyId)
  if (keyId !== undefined) {
    const stored = typeof metadata.apiKeyName === "string" ? metadata.apiKeyName : undefined
    return { kind: "apiKey", id: keyId, name: stored ?? keyNames.get(keyId) ?? "" }
  }
  return SYSTEM_ACTIONS.has(row.action) ? { kind: "system" } : { kind: "deleted" }
}

function targetOf(
  row: WorkspaceActivityRow,
  metadata: Record<string, unknown>,
  people: Map<number, { name: string; email: string | null }>,
  keyNames: Map<number, string>
): WorkspaceActivityItem["target"] {
  if (!isTargetType(row.target_type) || row.target_id === null) return null
  const id = row.target_id
  switch (row.target_type) {
    case "user":
      return { type: "user", id, label: people.get(Number(id))?.name ?? null }
    case "api_key": {
      const stored = typeof metadata.name === "string" ? metadata.name : undefined
      return { type: "api_key", id, label: stored ?? keyNames.get(Number(id)) ?? null }
    }
    case "webhook":
      return {
        type: "webhook",
        id,
        label: typeof metadata.host === "string" ? metadata.host : null,
      }
    default:
      return { type: row.target_type, id, label: null }
  }
}
