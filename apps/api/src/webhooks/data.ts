// Each event's `data`, built from the same rows (and, for notes, the same serialiser) `/v1`
// answers with, so a webhook never shows a resource differently from the API. Never an email:
// `emitWebhookEvent` also parses every payload through the public schema, which drops anything
// it does not declare.
import type { Member, Workspace } from "@repo/public-api-contract"
import type { WebhookData } from "@repo/public-api-contract/webhooks"
import { parseScopes } from "../api-keys"
import { entitlementsForWorkspace } from "../billing/entitlements"
import type { BillingProvider } from "../billing/provider"
import type { Db, Queries } from "../db"
import type { ApiKeyRow } from "../queries/api-keys"
import type { MembershipRow } from "../queries/memberships"
import { toV1Note } from "../v1/note"

type Reads = Db | Queries

/** `note.created`: the note as `GET /v1/notes/{id}` shows it; null once it is gone. */
export async function noteData(
  queries: Reads,
  key: { workspaceId: number; id: number }
): Promise<WebhookData<"note.created"> | null> {
  const row = await queries.notes.findDetail(key)
  return row ? toV1Note(row) : null
}

/** `member.*`: the membership as `/v1/members` lists it (`role` as given in `membership`). */
export async function memberData(
  queries: Reads,
  membership: Pick<MembershipRow, "user_id" | "role" | "created_at">
): Promise<Member | null> {
  const user = await queries.users.find(membership.user_id)
  if (!user) return null
  return {
    userId: membership.user_id,
    name: user.name,
    role: membership.role,
    joinedAt: membership.created_at,
  }
}

/** `workspace.updated`: the workspace as `GET /v1/workspace` shows it. */
export async function workspaceData(
  queries: Reads,
  billing: Pick<BillingProvider, "kind">,
  workspaceId: number
): Promise<Workspace | null> {
  const workspace = await queries.workspaces.find(workspaceId)
  if (!workspace) return null
  const { plan } = await entitlementsForWorkspace(queries, workspaceId, billing)
  return { id: Number(workspace.id), name: workspace.name, slug: workspace.slug, plan }
}

/** `api_key.*`: never the key or its hash. */
export const apiKeyData = (row: ApiKeyRow): WebhookData<"api_key.created"> => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  scopes: parseScopes(row.scopes),
  expiresAt: row.expires_at,
})
