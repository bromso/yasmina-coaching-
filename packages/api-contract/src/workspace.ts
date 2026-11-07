import { z } from "zod"
import { AUTH_ERRORS, EmailSchema } from "./auth"
import { EntitlementsSchema } from "./billing"
import { WorkspaceIdSchema } from "./ids"
import {
  INVITE_DOMAIN_INVALID_REASON,
  INVITE_DOMAIN_LIMIT_REASON,
  INVITE_DOMAIN_REASON,
  MAX_INVITE_DOMAINS,
} from "./invite-domains"
import { ASSIGNABLE_ROLES, type AssignableRole, ROLES, type Role, roleAtLeast } from "./roles"

export * from "./invite-domains"
export type { AssignableRole, Role }
export { ASSIGNABLE_ROLES, ROLES, roleAtLeast, WorkspaceIdSchema }

export const RoleSchema = z.enum(ROLES)
export const AssignableRoleSchema = z.enum(ASSIGNABLE_ROLES)

const id = z.coerce.number().int().positive()
// No control characters: the name reaches mail subjects, where a CR/LF must never land.
export const WorkspaceNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[^\p{Cc}]*$/u, "Name contains an invalid character")

// Output: plain, so a stored name that predates the input rules never fails the response.
export const WorkspaceSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().max(100),
  slug: z.string(),
  createdAt: z.iso.datetime(),
  /** A URL to the workspace logo (see STORAGE_PUBLIC_URL), or null for none. */
  logoUrl: z.string().nullable(),
})
export type Workspace = z.infer<typeof WorkspaceSchema>
export const WorkspaceSummarySchema = WorkspaceSchema.extend({
  role: RoleSchema,
  memberCount: z.number().int().nonnegative(),
  entitlements: EntitlementsSchema,
  /** Whether the owner requires every member to have two-step verification or a passkey. */
  requireTwoFactor: z.boolean(),
})
export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>

export const MemberSchema = z.object({
  userId: z.number().int().positive(),
  name: z.string(),
  /** Null for callers below admin. */
  email: z.string().nullable(),
  role: RoleSchema,
  joinedAt: z.iso.datetime(),
  /**
   * Whether the member satisfies a two-step requirement (two-step on, or a passkey) — a yes/no
   * only, never which factor. Null for callers below admin, like `email`.
   */
  twoFactor: z.boolean().nullable(),
})
export type Member = z.infer<typeof MemberSchema>

const inviter = z.object({ name: z.string() })
export const InvitationSchema = z.object({
  id: z.number().int().positive(),
  email: z.string(),
  role: AssignableRoleSchema,
  invitedBy: inviter,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
})
export type Invitation = z.infer<typeof InvitationSchema>
export const InvitationPreviewSchema = z.object({
  workspace: z.object({ name: z.string() }),
  invitedBy: inviter,
  /** Masked, e.g. `a***@example.com`. */
  email: z.string(),
  role: AssignableRoleSchema,
  expiresAt: z.iso.datetime(),
  /** Whether the workspace requires two-step verification of its members. */
  requireTwoFactor: z.boolean(),
  /**
   * Whether the invitation's address is allowed under the workspace's current invitation domain
   * list (always true for an empty list). False: accepting it is refused, it stays pending.
   */
  domainAllowed: z.boolean(),
})
export type InvitationPreview = z.infer<typeof InvitationPreviewSchema>
export const PendingInvitationSchema = z.object({
  id: z.number().int().positive(),
  workspace: z.object({ name: z.string() }),
  role: AssignableRoleSchema,
  invitedBy: inviter,
  expiresAt: z.iso.datetime(),
})
export type PendingInvitation = z.infer<typeof PendingInvitationSchema>

export const WorkspaceListSchema = z.object({
  items: z.array(WorkspaceSummarySchema),
  pendingInvitations: z.array(PendingInvitationSchema),
})
export type WorkspaceList = z.infer<typeof WorkspaceListSchema>
export const CreateWorkspaceSchema = z.object({ name: WorkspaceNameSchema })
export const UpdateWorkspaceSchema = WorkspaceIdSchema.extend({ name: WorkspaceNameSchema })
// Here, not in files.ts: building this needs WorkspaceIdSchema, and importing it from files.ts
// would make files.ts a workspace-shaped module instead of the plain file-upload leaf it is.
export const WorkspaceImageUploadSchema = WorkspaceIdSchema.extend({ file: z.file() })
export const MemberTargetSchema = WorkspaceIdSchema.extend({ userId: id })
export const SetRoleSchema = MemberTargetSchema.extend({ role: AssignableRoleSchema })
export const MemberListSchema = z.object({ items: z.array(MemberSchema) })
export const CreateInvitationSchema = WorkspaceIdSchema.extend({
  email: EmailSchema,
  role: AssignableRoleSchema,
})
export const InvitationIdSchema = WorkspaceIdSchema.extend({ id })
export const InvitationListSchema = z.object({ items: z.array(InvitationSchema) })
export const InvitationTokenSchema = z.object({ token: z.string().min(1).max(128) })
export const AcceptByIdSchema = z.object({ id })
export const AcceptResultSchema = z.object({ workspace: WorkspaceSummarySchema })

/**
 * `data.reason` on the FORBIDDEN every workspace-scoped procedure answers when the workspace
 * requires two-step verification and the caller has neither two-step on nor a passkey. The data
 * carries this reason only — never a member, a count or a factor detail.
 */
export const WORKSPACE_TWO_FACTOR_REASON = "two_factor_required"
/** The English text of that refusal, `{workspace}` the workspace's name. */
export const WORKSPACE_TWO_FACTOR_REQUIRED_MESSAGE =
  "Turn on two-step verification to access {workspace}."
/**
 * The optional `data` a workspace-scoped FORBIDDEN may carry. Spread into every FORBIDDEN a
 * workspace-scoped procedure declares (oRPC keeps one declaration per code), so a typed client
 * reads `error.data?.reason` whichever message the procedure's own default names.
 */
export const WorkspaceForbiddenDataSchema = z
  .object({ reason: z.literal(WORKSPACE_TWO_FACTOR_REASON) })
  .optional()
export const WORKSPACE_ERRORS = {
  ...AUTH_ERRORS,
  NOT_FOUND: { message: "Workspace not found" },
  // Also thrown with "Requires the <role> role" and, when the workspace requires two-step
  // verification, WORKSPACE_TWO_FACTOR_REQUIRED_MESSAGE with `data.reason`.
  FORBIDDEN: { message: "Requires a higher role", data: WorkspaceForbiddenDataSchema },
} as const

/**
 * `workspaces.invitations.create`'s FORBIDDEN data: the middleware's `two_factor_required`, or
 * `invite_domain` for an address outside the workspace's invitation domain list. The reason code
 * only, never the address.
 */
export const InvitationCreateForbiddenDataSchema = z
  .object({ reason: z.enum([WORKSPACE_TWO_FACTOR_REASON, INVITE_DOMAIN_REASON]) })
  .optional()
/**
 * `invitations.accept` / `acceptById`'s FORBIDDEN data: `invite_domain` when the workspace's
 * invitation domain list no longer allows the invitation's address. The reason code only.
 */
export const InvitationAcceptForbiddenDataSchema = z
  .object({ reason: z.literal(INVITE_DOMAIN_REASON) })
  .optional()

/**
 * `data.reason` on `workspaces.security.set`'s FORBIDDEN when an owner without two-step
 * verification (or a passkey) tries to turn the requirement on: they would lock themselves out.
 */
export const OWNER_TWO_FACTOR_REASON = "owner_two_factor"
export const OWNER_TWO_FACTOR_MESSAGE = "Turn on two-step verification for your own account first."
/**
 * `workspaces.security.set`'s FORBIDDEN data: the middleware's `two_factor_required` (the
 * workspace already requires it and the owner no longer satisfies it) or `owner_two_factor`. The
 * reason code only, never a name, a count or an id.
 */
export const WorkspaceSecurityForbiddenDataSchema = z
  .object({ reason: z.enum([WORKSPACE_TWO_FACTOR_REASON, OWNER_TWO_FACTOR_REASON]) })
  .optional()
export const SetWorkspaceSecuritySchema = WorkspaceIdSchema.extend({
  requireTwoFactor: z.boolean(),
})
export const WorkspaceSecuritySchema = z.object({
  requireTwoFactor: z.boolean(),
  /** Members (any role) with neither two-step verification on nor a passkey. */
  membersWithoutTwoFactor: z.number().int().nonnegative(),
  /** The domains invitations are limited to (A-label form); empty = any address. */
  inviteDomains: z.array(z.string()),
})
export type WorkspaceSecurity = z.infer<typeof WorkspaceSecuritySchema>
export const SetWorkspaceSecurityResultSchema = z.object({ requireTwoFactor: z.boolean() })

/**
 * `workspaces.security.setInviteDomains`' input: the owner's lines as typed, each normalised by the
 * api (`normalizeInviteDomain`). Generous bounds, so a line that is not a domain comes back as
 * `invite_domain_invalid` with its index rather than as a bare validation error; blank lines are
 * skipped. More than `MAX_INVITE_DOMAINS` distinct domains is `invite_domain_limit`.
 */
export const SetInviteDomainsSchema = WorkspaceIdSchema.extend({
  domains: z.array(z.string().max(1000)).max(MAX_INVITE_DOMAINS * 5),
})
export const InviteDomainsResultSchema = z.object({ inviteDomains: z.array(z.string()) })
/**
 * `workspaces.security.setInviteDomains`' BAD_REQUEST data: the reason code and, for invalid
 * lines, their 0-based indexes in `domains` — never the text of a line.
 */
export const InviteDomainsBadRequestDataSchema = z
  .object({
    reason: z.enum([INVITE_DOMAIN_INVALID_REASON, INVITE_DOMAIN_LIMIT_REASON]),
    indexes: z.array(z.number().int().nonnegative()).optional(),
  })
  .optional()

export const LAST_OWNER = { CONFLICT: { message: "Transfer ownership before leaving." } } as const
