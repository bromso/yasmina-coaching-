/**
 * Dependency-free workspace activity vocabulary: safe for a browser bundle that must not pull in
 * zod or the oRPC contract (both rooted in this package's index, which re-exports this module).
 *
 * The administrative actions `apps/api` always records with their workspace (`auditWorkspace` in
 * apps/api/src/admin.ts) and `workspaces.activity.list` reads back for the workspace's admins.
 * The names are the stored `audit_log.action` values, unchanged from before the activity log
 * (`invitation.accepted` is shown as "joined"). Notes are deliberately absent: their audit rows
 * are written only while impersonating and never carry a workspace.
 */
export const WORKSPACE_ACTIVITY_ACTIONS = [
  "workspace.created",
  "workspace.renamed",
  "workspace.logo_set",
  "workspace.logo_removed",
  "workspace.ownership_transferred",
  "workspace.plan_changed",
  "invitation.accepted",
  "member.role_changed",
  "member.removed",
  "workspace.left",
  "invitation.created",
  "invitation.revoked",
  "workspace.api_key_created",
  "workspace.api_key_revoked",
  "workspace.webhook_created",
  "workspace.webhook_updated",
  "workspace.webhook_secret_rotated",
  "workspace.webhook_deleted",
  "workspace.webhook_disabled",
  "workspace.two_factor_requirement_changed",
  "workspace.invite_domains_changed",
] as const
export type WorkspaceActivityAction = (typeof WORKSPACE_ACTIVITY_ACTIONS)[number]

/** How far back `workspaces.activity.list` reads: rows at or after `now − 90 days` (`Context.now()`). */
export const WORKSPACE_ACTIVITY_DAYS = 90
/** `workspaces.activity.list`'s page size: the default, and the most a caller may ask for. */
export const WORKSPACE_ACTIVITY_PAGE_SIZE = 50
export const WORKSPACE_ACTIVITY_MAX_PAGE_SIZE = 100

/** The `target_type` values an activity row stores (the member, invitation, key or endpoint). */
export const WORKSPACE_ACTIVITY_TARGET_TYPES = [
  "workspace",
  "user",
  "invitation",
  "api_key",
  "webhook",
] as const
export type WorkspaceActivityTargetType = (typeof WORKSPACE_ACTIVITY_TARGET_TYPES)[number]

/**
 * Who an activity row names: a member (`bySupport` when platform support acted as them — staff
 * are never named), one of the workspace's API keys, the system (a billing provider's webhook, a
 * disabled endpoint), or `deleted` (an account since purged).
 */
export const WORKSPACE_ACTIVITY_ACTOR_KINDS = ["member", "apiKey", "system", "deleted"] as const
export type WorkspaceActivityActorKind = (typeof WORKSPACE_ACTIVITY_ACTOR_KINDS)[number]

/**
 * A page cursor: the last row's `at` (ISO 8601 UTC, millisecond precision — how every audit row's
 * time is written) and id, joined by `_`. Opaque to callers; only its shape is checked, and the
 * list is always scoped to the caller's own workspace, so a forged cursor can only page within it.
 */
export const WORKSPACE_ACTIVITY_CURSOR_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([1-9]\d{0,9})$/
