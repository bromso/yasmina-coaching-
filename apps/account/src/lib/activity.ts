import type { WorkspaceActivityItem } from "@repo/api-contract"
import { PLANS } from "@repo/api-contract/billing-plans"
import { ROLES, type Role } from "@repo/api-contract/roles"
import {
  WORKSPACE_ACTIVITY_ACTIONS,
  WORKSPACE_ACTIVITY_CURSOR_PATTERN,
  type WorkspaceActivityAction,
} from "@repo/api-contract/workspace-activity"
import type { AccountT } from "./i18n"
import { displayDomains, type FormatList } from "./invite-domains"

// The Workspace page's Activity card (Phase 12 A): its query string, and the words for each row.
// Rendered by server components only (`page.tsx`, `workspace-view.tsx`); its values still come
// from the contract's Zod-free subpaths, so nothing here would pull the whole contract along.

/** The card's own query parameters, apart from anything else the page might read. */
export const ACTIVITY_ACTION_PARAM = "activityAction"
export const ACTIVITY_CURSOR_PARAM = "activityCursor"
/** The card's title id: the paging links land on it, so the reader stays on the card. */
export const ACTIVITY_HEADING_ID = "activity-heading"

export type ActivityParams = { action?: WorkspaceActivityAction; cursor?: string }

type SearchValue = string | string[] | undefined
const first = (value: SearchValue) => (Array.isArray(value) ? value[0] : value)

const isAction = (value: string): value is WorkspaceActivityAction =>
  (WORKSPACE_ACTIVITY_ACTIONS as readonly string[]).includes(value)

/** The same test the contract applies: the pattern, and a time that round-trips. */
function isCursor(value: string): boolean {
  const match = WORKSPACE_ACTIVITY_CURSOR_PATTERN.exec(value)
  if (!match) return false
  const at = match[1] as string
  const time = new Date(at)
  return !Number.isNaN(time.getTime()) && time.toISOString() === at
}

/**
 * The filter and page the URL asks for. Anything the api would refuse — an unknown action, a
 * malformed cursor — is dropped rather than passed on, so a hand-edited URL shows the first page
 * of everything instead of a failed card.
 */
export function activityParams(search: Record<string, SearchValue>): ActivityParams {
  const action = first(search[ACTIVITY_ACTION_PARAM])
  const cursor = first(search[ACTIVITY_CURSOR_PARAM])
  return {
    ...(action !== undefined && isAction(action) ? { action } : {}),
    ...(cursor !== undefined && isCursor(cursor) ? { cursor } : {}),
  }
}

/**
 * The Workspace page's URL for one page of the card: the filter kept, the cursor when there is
 * one, landing on the card's title. No parameters → the page's own first view.
 */
export function activityHref({ action, cursor }: ActivityParams): string {
  const query = new URLSearchParams()
  if (action) query.set(ACTIVITY_ACTION_PARAM, action)
  if (cursor) query.set(ACTIVITY_CURSOR_PARAM, cursor)
  const search = query.toString()
  return `/workspace${search ? `?${search}` : ""}#${ACTIVITY_HEADING_ID}`
}

/** Each action's catalog key, under `activity.actions` (the row's sentence) and
 * `activity.filters` (the filter's option). `invitation.accepted` reads as "joined". */
export const ACTION_KEYS: Readonly<Record<WorkspaceActivityAction, string>> = {
  "workspace.created": "workspaceCreated",
  "workspace.renamed": "workspaceRenamed",
  "workspace.logo_set": "logoSet",
  "workspace.logo_removed": "logoRemoved",
  "workspace.ownership_transferred": "ownershipTransferred",
  "workspace.plan_changed": "planChanged",
  "invitation.accepted": "joined",
  "member.role_changed": "roleChanged",
  "member.removed": "memberRemoved",
  "workspace.left": "left",
  "invitation.created": "invited",
  "invitation.revoked": "invitationRevoked",
  "workspace.api_key_created": "apiKeyCreated",
  "workspace.api_key_revoked": "apiKeyRevoked",
  "workspace.webhook_created": "webhookCreated",
  "workspace.webhook_updated": "webhookUpdated",
  "workspace.webhook_secret_rotated": "webhookSecretRotated",
  "workspace.webhook_deleted": "webhookDeleted",
  "workspace.webhook_disabled": "webhookDisabled",
  "workspace.two_factor_requirement_changed": "twoFactorRequirementChanged",
  "workspace.invite_domains_changed": "inviteDomainsChanged",
}

type Actor = WorkspaceActivityItem["actor"]

/** Who the row names, as one line: a member's name, "API key <name>", "System", "Deleted user".
 * A member's address and the "by support" badge are rendered beside it, not in it. */
export function actorLabel(actor: Actor, t: AccountT): string {
  switch (actor.kind) {
    case "member":
      return actor.name.trim() || t("members.unnamed")
    case "apiKey":
      return actor.name
        ? t("activity.actorApiKey", { name: actor.name })
        : t("activity.actorApiKeyUnnamed")
    case "system":
      return t("activity.actorSystem")
    case "deleted":
      return t("activity.actorDeleted")
  }
}

const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value)

/** A stored role as the page shows it; an unknown value as stored. */
function roleName(value: string | undefined, t: AccountT): string {
  return value !== undefined && isRole(value) ? t(`roles.${value}`) : (value ?? "")
}

function planName(value: string | undefined): string {
  if (value === undefined) return ""
  return Object.hasOwn(PLANS, value) ? PLANS[value as keyof typeof PLANS].name : value
}

/** `month` / `year` as the sentence's "billed …" word; anything else as stored. */
function intervalName(value: string | undefined, t: AccountT): string {
  if (value === "month") return t("activity.intervalMonth")
  if (value === "year") return t("activity.intervalYear")
  return value ?? ""
}

const STATUS_KEYS: Readonly<Record<string, string>> = {
  active: "statusActive",
  trialing: "statusTrialing",
  past_due: "statusPastDue",
  canceled: "statusCanceled",
  incomplete: "statusIncomplete",
  unpaid: "statusUnpaid",
}

const yes = (value: string | undefined) => (value ? "yes" : "no")
const list = (value: readonly string[] | undefined) => (value ?? []).join(", ")

/**
 * The row's sentence, in the page's language, from its action, its `details` and its target's
 * label. Every value an ICU message names is always passed — a missing detail as `""` with its
 * `has…` flag `"no"`, which the message uses to leave that part out — so an older row with less
 * metadata still reads as a sentence, never as a raw key. `formatList` formats a list of domains
 * in the page's language (next-intl's `format.list`, see `conjunction`).
 */
export function activitySentence(
  item: WorkspaceActivityItem,
  t: AccountT,
  formatList: FormatList
): string {
  const { details, target } = item
  const label = target?.label ?? undefined
  const host = details.host ?? (target?.type === "webhook" ? label : undefined)
  const keyName = details.name ?? (target?.type === "api_key" ? label : undefined)
  const member = target?.type === "user" ? label : undefined
  const status = details.status
  const statusKey = status !== undefined ? STATUS_KEYS[status] : undefined
  // A cancellation lands on Free (the billing mirror records `plan: "free"` with the old
  // interval, since Stripe sends one even then): no "billed monthly" for a plan nobody pays for.
  const cancelled = status === "canceled"
  const toFree = cancelled || details.plan === "free"
  // An allowed-domains change: the domains it added and removed, in their readable form.
  const added = displayDomains(details.added ?? [])
  const removed = displayDomains(details.removed ?? [])
  const values: Record<string, string> = {
    name: details.name ?? "",
    hasName: yes(details.name),
    from: details.from ?? "",
    hasFrom: yes(details.from),
    to: details.to ?? "",
    hasTo: yes(details.to),
    fromRole: roleName(details.from, t),
    toRole: roleName(details.to, t),
    role: roleName(details.role, t),
    hasRole: yes(details.role),
    email: details.email ?? "",
    hasEmail: yes(details.email),
    member: member ?? "",
    hasMember: yes(member),
    key: keyName ?? "",
    hasKey: yes(keyName),
    scopes: list(details.scopes),
    hasScopes: yes(list(details.scopes)),
    host: host ?? "",
    hasHost: yes(host),
    events: list(details.events),
    hasEvents: yes(list(details.events)),
    plan: planName(cancelled ? "free" : details.plan),
    hasPlan: yes(details.plan),
    interval: intervalName(details.interval, t),
    hasInterval: toFree ? "no" : yes(details.interval),
    status: statusKey ? t(`activity.${statusKey}`) : (status ?? ""),
    hasStatus: !cancelled && status !== undefined && status !== "active" ? "yes" : "no",
    cancelled: cancelled ? "yes" : "no",
    reason: details.reason ?? "",
    enabled: details.enabled === true ? "yes" : "no",
    added: formatList(added),
    hasAdded: added.length > 0 ? "yes" : "no",
    removed: formatList(removed),
    hasRemoved: removed.length > 0 ? "yes" : "no",
  }
  return t(`activity.actions.${ACTION_KEYS[item.action]}`, values)
}

/**
 * One page of the card, or null when it could not be read — the card then says so in place of
 * the list, rather than taking the whole Workspace page down into its error boundary.
 */
export async function readActivity<Page>(fetchPage: () => Promise<Page>): Promise<Page | null> {
  try {
    return await fetchPage()
  } catch {
    return null
  }
}
