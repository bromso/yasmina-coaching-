import {
  API_KEY_EXPIRY_DAYS,
  type ApiClient,
  type ApiKeyExpiryDays,
  ApiKeyIdSchema,
  type ApiKeySummary,
  CreateApiKeySchema,
  CreateInvitationSchema,
  CreateWebhookEndpointSchema,
  InvitationIdSchema,
  MemberTargetSchema,
  OWNER_TWO_FACTOR_REASON,
  SetInviteDomainsSchema,
  SetRoleSchema,
  UpdateWebhookEndpointSchema,
  UpdateWorkspaceSchema,
  type WebhookEndpoint,
  WebhookEndpointIdSchema,
  WorkspaceIdSchema,
} from "@repo/api-contract"
import {
  INVITE_DOMAIN_INVALID_REASON,
  INVITE_DOMAIN_LIMIT_REASON,
  normalizeInviteDomains,
} from "@repo/api-contract/invite-domains"
import type { Locale } from "@repo/i18n/locales"
import { type FormState, fieldErrors } from "@repo/ui/components/form-feedback"
import { apiError, checkImageFile, failure } from "@/lib/actions"
import { type AccountT, accountTranslator, zodMessage } from "@/lib/i18n"
import { displayDomains, type FormatList } from "@/lib/invite-domains"

type Workspaces = ApiClient["workspaces"]

export type WorkspaceApi = Pick<Workspaces, "update" | "delete" | "leave" | "transferOwnership"> & {
  members: Pick<Workspaces["members"], "setRole" | "remove">
  invitations: Pick<Workspaces["invitations"], "create" | "revoke">
  logo: Pick<Workspaces["logo"], "set" | "remove">
  apiKeys: Pick<Workspaces["apiKeys"], "create" | "revoke">
  webhooks: Pick<Workspaces["webhooks"], "create" | "update" | "rotateSecret" | "delete" | "test">
  security: Pick<Workspaces["security"], "get" | "set" | "setInviteDomains">
}

/**
 * Everything a Workspace form action needs. `workspaceId` is the current workspace as
 * `requireWorkspace()` resolved it on the server, never a value from the form. `locale` is the
 * request's language for this app's own sentences and field errors (English by default); the
 * api's messages already arrive in it.
 */
export type WorkspaceDeps = { api: WorkspaceApi; workspaceId: number; locale?: Locale }

/** A `FormState` that can also say the caller is no longer in the workspace. */
export type WorkspaceFormState =
  | FormState
  | { ok: true; message?: string; left?: true; deleted?: true }

const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}

/** The answer to a form rendered for another workspace than the current one, in `locale`. */
export const switchedMessage = (locale?: Locale) => accountTranslator(locale)("workspace.switched")

/**
 * The form was rendered for `workspaceId`. A second tab may have switched the current workspace
 * since: the action must refuse rather than act on a workspace the page never showed.
 */
export function sameWorkspace(fd: FormData, workspaceId: number): boolean {
  const parsed = WorkspaceIdSchema.safeParse({ workspaceId: fd.get("workspaceId") })
  return parsed.success && parsed.data.workspaceId === workspaceId
}

export async function renameWorkspaceCore(deps: WorkspaceDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const values = { name: str(fd, "name") }
  const parsed = UpdateWorkspaceSchema.safeParse({ workspaceId: deps.workspaceId, ...values })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)), values }
  }
  try {
    await deps.api.update(parsed.data)
    return { ok: true, message: t("workspace.renamed") }
  } catch (error) {
    return { ok: false, message: failure(error, ["NOT_FOUND", "FORBIDDEN"], "rename", t), values }
  }
}

export async function setLogoCore(deps: WorkspaceDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const checked = checkImageFile(fd, "file", t)
  if (!("file" in checked)) return checked
  try {
    await deps.api.logo.set({ workspaceId: deps.workspaceId, file: checked.file })
    return { ok: true, message: t("workspace.logoUpdated") }
  } catch (error) {
    const known = apiError(error, ["BAD_REQUEST"])
    if (known) return { ok: false, fieldErrors: { file: known.message } }
    const codes = ["NOT_FOUND", "FORBIDDEN", "TOO_MANY_REQUESTS", "SERVICE_UNAVAILABLE"]
    return { ok: false, message: failure(error, codes, "setLogo", t) }
  }
}

/** `fd` carries the card's hidden `workspaceId` (for the outer action's `sameWorkspace` check);
 * the core itself always acts on `deps.workspaceId`, never a value the form claims. */
export async function removeLogoCore(deps: WorkspaceDeps, _fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  try {
    await deps.api.logo.remove({ workspaceId: deps.workspaceId })
    return { ok: true, message: t("workspace.logoRemoved") }
  } catch (error) {
    return { ok: false, message: failure(error, ["NOT_FOUND", "FORBIDDEN"], "removeLogo", t) }
  }
}

export async function inviteCore(deps: WorkspaceDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const values = { email: str(fd, "email"), role: str(fd, "role") }
  const parsed = CreateInvitationSchema.safeParse({ workspaceId: deps.workspaceId, ...values })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)), values }
  }
  try {
    await deps.api.invitations.create(parsed.data)
    return { ok: true, message: t("invite.sent", { email: parsed.data.email }) }
  } catch (error) {
    const codes = ["NOT_FOUND", "FORBIDDEN", "CONFLICT", "TOO_MANY_REQUESTS"]
    return { ok: false, message: failure(error, codes, "invite", t), values }
  }
}

export async function setRoleCore(deps: WorkspaceDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const parsed = SetRoleSchema.safeParse({
    workspaceId: deps.workspaceId,
    userId: str(fd, "userId"),
    role: str(fd, "role"),
  })
  if (!parsed.success) {
    const bad = fieldErrors(parsed.error.issues)
    return {
      ok: false,
      message: bad.userId ? t("members.notAMember") : t("members.chooseRole"),
    }
  }
  try {
    await deps.api.members.setRole(parsed.data)
    return { ok: true, message: t("members.roleUpdated") }
  } catch (error) {
    const codes = ["NOT_FOUND", "FORBIDDEN", "CONFLICT", "BAD_REQUEST"]
    return { ok: false, message: failure(error, codes, "setRole", t) }
  }
}

export async function removeMemberCore(deps: WorkspaceDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const parsed = MemberTargetSchema.safeParse({
    workspaceId: deps.workspaceId,
    userId: str(fd, "userId"),
  })
  if (!parsed.success) return { ok: false, message: t("members.notAMember") }
  try {
    await deps.api.members.remove(parsed.data)
    return { ok: true, message: t("members.removed") }
  } catch (error) {
    const codes = ["NOT_FOUND", "FORBIDDEN", "CONFLICT", "BAD_REQUEST"]
    return { ok: false, message: failure(error, codes, "removeMember", t) }
  }
}

/** The last owner is refused by the api (`CONFLICT`); its message is shown as is. */
export async function leaveCore(deps: WorkspaceDeps): Promise<WorkspaceFormState> {
  const t = accountTranslator(deps.locale)
  try {
    await deps.api.leave({ workspaceId: deps.workspaceId })
    return { ok: true, left: true, message: t("members.left") }
  } catch (error) {
    const codes = ["NOT_FOUND", "FORBIDDEN", "CONFLICT"]
    return { ok: false, message: failure(error, codes, "leave", t) }
  }
}

export async function revokeInvitationCore(deps: WorkspaceDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const parsed = InvitationIdSchema.safeParse({
    workspaceId: deps.workspaceId,
    id: str(fd, "invitationId"),
  })
  if (!parsed.success) return { ok: false, message: t("invitations.notFound") }
  try {
    await deps.api.invitations.revoke(parsed.data)
    return { ok: true, message: t("invitations.revoked") }
  } catch (error) {
    const codes = ["NOT_FOUND", "FORBIDDEN"]
    return { ok: false, message: failure(error, codes, "revokeInvitation", t) }
  }
}

export async function transferOwnershipCore(deps: WorkspaceDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const parsed = MemberTargetSchema.safeParse({
    workspaceId: deps.workspaceId,
    userId: str(fd, "userId"),
  })
  if (!parsed.success) return { ok: false, message: t("dangerZone.chooseOwner") }
  try {
    await deps.api.transferOwnership(parsed.data)
    return { ok: true, message: t("dangerZone.transferred") }
  } catch (error) {
    const codes = ["NOT_FOUND", "FORBIDDEN", "BAD_REQUEST"]
    return { ok: false, message: failure(error, codes, "transferOwnership", t) }
  }
}

/**
 * `workspaceName` is the name the server resolved with the workspace, never a form field: the typed
 * confirmation is checked against it before the api is called.
 */
export async function deleteWorkspaceCore(
  deps: WorkspaceDeps & { workspaceName: string },
  fd: FormData
): Promise<WorkspaceFormState> {
  const t = accountTranslator(deps.locale)
  if (str(fd, "confirm").trim() !== deps.workspaceName)
    return { ok: false, fieldErrors: { confirm: t("dangerZone.confirmName") } }
  try {
    await deps.api.delete({ workspaceId: deps.workspaceId })
    return { ok: true, deleted: true, message: t("dangerZone.deleted") }
  } catch (error) {
    const codes = ["NOT_FOUND", "FORBIDDEN"]
    return { ok: false, message: failure(error, codes, "deleteWorkspace", t) }
  }
}

// API keys. The create form's expiry `<select>` carries one of these four option values; anything
// else is a tampered request and is a field error before the api ever sees it, same as `invite`'s
// role select. `CreateApiKeySchema` wants a real `number | null`, never the string a <select> sends.
const EXPIRY_OPTION_VALUES = new Set<string>(["none", ...API_KEY_EXPIRY_DAYS.map(String)])

export type CreateApiKeyState =
  | { ok: true; key: string; apiKey: ApiKeySummary }
  | {
      ok: false
      message?: string
      fieldErrors?: Record<string, string>
      values?: { name: string; scopes: string[]; expiresInDays: string }
    }

/**
 * Creates a workspace API key: `create`'s own answer carries the full key, here and nowhere
 * else — the caller must never persist it (no cookie, no URL, no revalidated prop), only hold it
 * in memory until the show-once panel is dismissed or the page reloads.
 */
export async function createApiKeyCore(
  deps: WorkspaceDeps,
  fd: FormData
): Promise<CreateApiKeyState> {
  const t = accountTranslator(deps.locale)
  const name = str(fd, "name")
  const scopes = fd.getAll("scopes").filter((v): v is string => typeof v === "string")
  const expiryRaw = str(fd, "expiresInDays")
  const values = { name, scopes, expiresInDays: expiryRaw }
  if (!EXPIRY_OPTION_VALUES.has(expiryRaw)) {
    return { ok: false, fieldErrors: { expiresInDays: t("validation.choose") }, values }
  }
  const expiresInDays: ApiKeyExpiryDays | null =
    expiryRaw === "none" ? null : (Number(expiryRaw) as ApiKeyExpiryDays)
  const parsed = CreateApiKeySchema.safeParse({
    workspaceId: deps.workspaceId,
    name,
    scopes,
    expiresInDays,
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)), values }
  }
  try {
    const { key, apiKey } = await deps.api.apiKeys.create(parsed.data)
    return { ok: true, key, apiKey }
  } catch (error) {
    // FORBIDDEN: the role check, impersonation, or the workspace lacks the `api` feature.
    // CONFLICT: the workspace already holds MAX_API_KEYS live keys.
    const codes = ["FORBIDDEN", "CONFLICT"]
    return { ok: false, message: failure(error, codes, "apiKeys.create", t), values }
  }
}

/** Revokes a workspace API key. Idempotent on the api side: revoking an already-revoked key is a
 * silent success, never a second audit row. */
export async function revokeApiKeyCore(deps: WorkspaceDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const parsed = ApiKeyIdSchema.safeParse({ workspaceId: deps.workspaceId, id: str(fd, "id") })
  if (!parsed.success) return { ok: false, message: t("apiKeys.notFound") }
  try {
    await deps.api.apiKeys.revoke(parsed.data)
    return { ok: true, message: t("apiKeys.revoked") }
  } catch (error) {
    return { ok: false, message: failure(error, ["NOT_FOUND", "FORBIDDEN"], "apiKeys.revoke", t) }
  }
}

// Webhook endpoints. `id` arrives as a hidden field on every row form (edit, rotate, test,
// delete), the same way `revokeApiKeyCore`'s does: a junk or missing one is a tampered request or
// a stale page, answered as "not found" rather than a field error nobody can see.

export type CreateWebhookState =
  | { ok: true; secret: string; endpoint: WebhookEndpoint }
  | {
      ok: false
      message?: string
      fieldErrors?: Record<string, string>
      values?: { url: string; description: string; events: string[] }
    }

/**
 * Creates a workspace webhook endpoint: `create`'s own answer carries the full signing secret,
 * here and nowhere else — the caller must never persist it, only hold it in memory until the
 * show-once panel is dismissed or the page reloads. A blank description stores none; the events
 * checkboxes may arrive in any order (the api canonicalises them).
 */
export async function createWebhookCore(
  deps: WorkspaceDeps,
  fd: FormData
): Promise<CreateWebhookState> {
  const t = accountTranslator(deps.locale)
  const url = str(fd, "url")
  const description = str(fd, "description")
  const events = fd.getAll("events").filter((v): v is string => typeof v === "string")
  const values = { url, description, events }
  const parsed = CreateWebhookEndpointSchema.safeParse({
    workspaceId: deps.workspaceId,
    url,
    description,
    events,
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)), values }
  }
  try {
    const { secret, endpoint } = await deps.api.webhooks.create(parsed.data)
    return { ok: true, secret, endpoint }
  } catch (error) {
    // BAD_REQUEST: the SSRF guard (not https, blocked, or unresolvable) — shown on the url field.
    const known = apiError(error, ["BAD_REQUEST"])
    if (known) return { ok: false, fieldErrors: { url: known.message }, values }
    // FORBIDDEN: the api feature, the admin role, or impersonation. CONFLICT: MAX_WEBHOOK_ENDPOINTS.
    const codes = ["FORBIDDEN", "CONFLICT", "NOT_FOUND"]
    return { ok: false, message: failure(error, codes, "webhooks.create", t), values }
  }
}

export type UpdateWebhookState =
  | { ok: true; endpoint: WebhookEndpoint; message: string }
  | {
      ok: false
      message?: string
      fieldErrors?: Record<string, string>
      values?: { url: string; description: string; events: string[]; enabled: boolean }
    }

/**
 * Edits an endpoint's URL, description and events, and sets `enabled` from the row's checkbox —
 * every field the form carries, always, never a partial patch: unlike the api's own `update`
 * (every field optional, "no change" when omitted), this form always submits its full state, so
 * unchecking **Enabled** always disables the endpoint (`manual`) rather than being silently
 * dropped as "no change".
 */
export async function updateWebhookCore(
  deps: WorkspaceDeps,
  fd: FormData
): Promise<UpdateWebhookState> {
  const t = accountTranslator(deps.locale)
  const url = str(fd, "url")
  const description = str(fd, "description")
  const events = fd.getAll("events").filter((v): v is string => typeof v === "string")
  const enabled = fd.get("enabled") === "on"
  const values = { url, description, events, enabled }
  const parsed = UpdateWebhookEndpointSchema.safeParse({
    workspaceId: deps.workspaceId,
    id: str(fd, "id"),
    url,
    description,
    events,
    enabled,
  })
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path[0] === "id")) {
      return { ok: false, message: t("webhooks.notFound") }
    }
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)), values }
  }
  try {
    const endpoint = await deps.api.webhooks.update(parsed.data)
    return { ok: true, endpoint, message: t("webhooks.updated") }
  } catch (error) {
    const known = apiError(error, ["BAD_REQUEST"])
    if (known) return { ok: false, fieldErrors: { url: known.message }, values }
    return {
      ok: false,
      message: failure(error, ["FORBIDDEN", "NOT_FOUND"], "webhooks.update", t),
      values,
    }
  }
}

export type RotateWebhookSecretState = { ok: true; secret: string } | { ok: false; message: string }

/** Replaces an endpoint's signing secret: the new one rides back in this response only, shown
 * once, the same rule as `create`'s. The old secret stops signing at once. */
export async function rotateWebhookSecretCore(
  deps: WorkspaceDeps,
  fd: FormData
): Promise<RotateWebhookSecretState> {
  const t = accountTranslator(deps.locale)
  const parsed = WebhookEndpointIdSchema.safeParse({
    workspaceId: deps.workspaceId,
    id: str(fd, "id"),
  })
  if (!parsed.success) return { ok: false, message: t("webhooks.notFound") }
  try {
    const { secret } = await deps.api.webhooks.rotateSecret(parsed.data)
    return { ok: true, secret }
  } catch (error) {
    const codes = ["FORBIDDEN", "NOT_FOUND"]
    return { ok: false, message: failure(error, codes, "webhooks.rotateSecret", t) }
  }
}

export type TestWebhookState = { ok: true; eventId: string } | { ok: false; message: string }

/** Queues a signed `ping` to one endpoint. The endpoint needs no subscription to `ping`; a
 * disabled endpoint refuses (`CONFLICT`) since nothing is ever delivered to one. */
export async function testWebhookCore(
  deps: WorkspaceDeps,
  fd: FormData
): Promise<TestWebhookState> {
  const t = accountTranslator(deps.locale)
  const parsed = WebhookEndpointIdSchema.safeParse({
    workspaceId: deps.workspaceId,
    id: str(fd, "id"),
  })
  if (!parsed.success) return { ok: false, message: t("webhooks.notFound") }
  try {
    const { eventId } = await deps.api.webhooks.test(parsed.data)
    return { ok: true, eventId }
  } catch (error) {
    const codes = ["FORBIDDEN", "NOT_FOUND", "CONFLICT"]
    return { ok: false, message: failure(error, codes, "webhooks.test", t) }
  }
}

/** Deletes an endpoint and its delivery log. */
export async function deleteWebhookCore(deps: WorkspaceDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const parsed = WebhookEndpointIdSchema.safeParse({
    workspaceId: deps.workspaceId,
    id: str(fd, "id"),
  })
  if (!parsed.success) return { ok: false, message: t("webhooks.notFound") }
  try {
    await deps.api.webhooks.delete(parsed.data)
    return { ok: true, message: t("webhooks.deleted") }
  } catch (error) {
    const codes = ["FORBIDDEN", "NOT_FOUND"]
    return { ok: false, message: failure(error, codes, "webhooks.delete", t) }
  }
}

// Requiring two-step verification (the Workspace page's Security card, owner only). Turning it on
// is two submissions, so it works without JavaScript: the first (`stage` "save") only answers
// with a confirmation naming how many members it would block; the second (`stage` "confirm")
// applies it. Turning it off, or saving what is already in force, applies at once.

export type WorkspaceSecurityState =
  | { ok: true; message: string }
  | {
      ok: false
      message?: string
      /** Turning it on waits for this confirmation: `count` members would be blocked. */
      confirm?: { count: number }
      /** The owner has no two-step verification of their own: the card links to `/security`. */
      ownerTwoFactor?: true
    }

/** The card's own stage field: anything but these two is a plain save. */
const SECURITY_STAGES = new Set(["confirm", "cancel"])

export async function setWorkspaceSecurityCore(
  deps: WorkspaceDeps,
  fd: FormData
): Promise<WorkspaceSecurityState> {
  const t = accountTranslator(deps.locale)
  const raw = str(fd, "stage")
  const stage = SECURITY_STAGES.has(raw) ? raw : "save"
  // Cancel from the confirmation: back to the form, nothing sent.
  if (stage === "cancel") return { ok: false }
  const requireTwoFactor = fd.get("requireTwoFactor") === "on"
  const input = { workspaceId: deps.workspaceId, requireTwoFactor }
  try {
    if (requireTwoFactor && stage !== "confirm") {
      // Read now rather than trust the page: how many it would block, and whether it is already
      // on (saving what is in force needs no confirmation — the api writes nothing for it).
      const current = await deps.api.security.get({ workspaceId: deps.workspaceId })
      if (!current.requireTwoFactor) {
        return { ok: false, confirm: { count: current.membersWithoutTwoFactor } }
      }
    }
    await deps.api.security.set(input)
    return {
      ok: true,
      message: t(requireTwoFactor ? "workspaceSecurity.turnedOn" : "workspaceSecurity.turnedOff"),
    }
  } catch (error) {
    const known = apiError(error, ["FORBIDDEN"])
    const reason = (known?.data as { reason?: unknown } | undefined)?.reason
    if (known && reason === OWNER_TWO_FACTOR_REASON) {
      return { ok: false, message: known.message, ownerTwoFactor: true }
    }
    const codes = ["NOT_FOUND", "FORBIDDEN"]
    return { ok: false, message: failure(error, codes, "workspaces.security.set", t) }
  }
}

// The allowed invitation domains (the same Security card, owner only): one domain per line. The
// lines are sent as typed — the api normalises each — with blank ones left out; the api's line
// indexes are then mapped back to the textarea's own line numbers, blank lines counted.

/** `setInviteDomainsCore`'s deps: `formatList` formats the saved list for the success message. */
export type InviteDomainsDeps = WorkspaceDeps & { formatList: FormatList }

/** The textarea's own field name (its errors are keyed by it). */
export const INVITE_DOMAINS_FIELD = "domains"

/** One "Line N: not a valid domain." per refused line, N 1-based, as one field error. */
function lineErrors(lines: readonly number[], t: AccountT): string {
  return lines.map((index) => t("inviteDomains.lineInvalid", { line: String(index + 1) })).join(" ")
}

export async function setInviteDomainsCore(
  deps: InviteDomainsDeps,
  fd: FormData
): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const text = str(fd, INVITE_DOMAINS_FIELD)
  const values = { [INVITE_DOMAINS_FIELD]: text }
  const lines = text.split(/\r\n|\r|\n/)
  // Each sent entry's line in the textarea.
  const lineOf = lines.flatMap((line, index) => (line.trim() === "" ? [] : [index]))
  const domains = lineOf.map((index) => lines[index] as string)
  const invalid = (indexes: readonly number[], message: string): FormState => ({
    ok: false,
    message,
    fieldErrors: { [INVITE_DOMAINS_FIELD]: lineErrors(indexes, t) },
    values,
  })
  const input = { workspaceId: deps.workspaceId, domains }
  if (!SetInviteDomainsSchema.safeParse(input).success) {
    // More lines, or a longer line, than the api's input takes — no list it would keep looks like
    // that. The very rule the api applies (a Zod-free subpath) says which, without asking it.
    const local = normalizeInviteDomains(lines)
    if (local.invalid.length > 0) return invalid(local.invalid, t("inviteDomains.invalid"))
    return { ok: false, message: t("inviteDomains.limit"), values }
  }
  try {
    const out = await deps.api.security.setInviteDomains(input)
    const shown = displayDomains(out.inviteDomains)
    return {
      ok: true,
      message:
        shown.length > 0
          ? t("inviteDomains.saved", { domains: deps.formatList(shown) })
          : t("inviteDomains.cleared"),
    }
  } catch (error) {
    const known = apiError(error, ["BAD_REQUEST"])
    const data = known?.data as { reason?: unknown; indexes?: unknown } | undefined
    if (known && data?.reason === INVITE_DOMAIN_INVALID_REASON) {
      const indexes = Array.isArray(data.indexes) ? data.indexes : []
      const refused = indexes.flatMap((i) =>
        typeof i === "number" && lineOf[i] !== undefined ? [lineOf[i]] : []
      )
      return invalid(refused, known.message)
    }
    if (known && data?.reason === INVITE_DOMAIN_LIMIT_REASON) {
      return { ok: false, message: known.message, values }
    }
    const codes = ["NOT_FOUND", "FORBIDDEN"]
    return {
      ok: false,
      message: failure(error, codes, "workspaces.security.setInviteDomains", t),
      values,
    }
  }
}
