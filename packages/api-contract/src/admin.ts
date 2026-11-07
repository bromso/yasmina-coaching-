import { z } from "zod"
import { AUTH_ERRORS, ClientInfoSchema, ProviderIdSchema, UserSchema } from "./auth"
import { BillingStatusSchema, IntervalSchema, PlanKeySchema } from "./billing"
import { APPLICATION_STATUSES } from "./jobs"
import { SUPPORT_STATUSES, SUPPORT_TOPICS } from "./support"
import { RoleSchema } from "./workspace"

/** Copy the api returns and the apps show; one definition each. */
export const IMPERSONATING_MESSAGE = "Not available while impersonating"
export const SUPERADMIN_TARGET_MESSAGE = "Superadmins cannot be impersonated"
/** `admin.users.resetTwoFactor`'s refusal for a superadmin target (impersonate has its own). */
export const SUPERADMIN_RESET_MESSAGE = "A superadmin's two-step verification cannot be reset"
export const SELF_TARGET_MESSAGE = "You cannot impersonate yourself"
/** `admin.users.impersonate`'s refusal for a suspended account: its session could never act. */
export const SUSPENDED_TARGET_MESSAGE = "A suspended account cannot be impersonated"
/** `admin.users.resetTwoFactor`'s refusal for your own account. */
export const SELF_RESET_MESSAGE = "You cannot reset your own two-step verification here"
/** `admin.users.removePasskeys`'s refusal for a superadmin target (own message, like resetTwoFactor's). */
export const SUPERADMIN_REMOVE_PASSKEYS_MESSAGE = "A superadmin's passkeys cannot be removed"
/** `admin.users.removePasskeys`'s refusal for your own account. */
export const SELF_REMOVE_PASSKEYS_MESSAGE = "You cannot remove your own passkeys here"
/** `admin.jobs.retry`'s refusal when resurrecting would collide with a newer live dedupe key. */
export const JOB_RETRY_CONFLICT_MESSAGE = "A newer copy of this job is already queued"
/** `admin.users.suspend` / `unsuspend`'s refusal for your own account — one message for both,
 * since the underlying rule is the same ("you cannot change your own suspension status here"). */
export const SELF_SUSPEND_MESSAGE = "You cannot change your own suspension status here"
/** `admin.users.suspend` / `unsuspend`'s refusal for a superadmin target. */
export const SUPERADMIN_SUSPEND_MESSAGE = "A superadmin's suspension status cannot be changed"
/** `admin.users.suspend`'s `until`: strictly in the future, at most this many days ahead. */
export const SUSPEND_UNTIL_MAX_DAYS = 365
export const SUSPEND_UNTIL_INVALID_MESSAGE = `The end date must be in the future and at most ${SUSPEND_UNTIL_MAX_DAYS} days from now.`
/** `admin.users.suspend` / `unsuspend`'s TOO_MANY_REQUESTS — one message, since they share one
 * limiter and one budget (`suspend:<adminId>`). */
export const SUSPEND_RATE_MESSAGE = "Too many suspension changes, try again later"

/** Everything under `admin` answers NOT_FOUND to anyone who is not a superadmin. */
export const ADMIN_ERRORS = { ...AUTH_ERRORS, NOT_FOUND: { message: "Not found" } } as const

const Id = z.number().int().positive()
const CoercedId = z.coerce.number().int().positive()
const Iso = z.iso.datetime()
const Email = z.string()

export const AdminIdSchema = z.object({ id: CoercedId })
export const AdminListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  cursor: CoercedId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
export const OkSchema = z.object({ ok: z.literal(true) })

export const AdminMetricsSchema = z.object({
  users: z.number().int(),
  verifiedUsers: z.number().int(),
  signUps7d: z.number().int(),
  signUps30d: z.number().int(),
  workspaces: z.number().int(),
  workspacesByPlan: z.object({
    free: z.number().int(),
    pro: z.number().int(),
    team: z.number().int(),
  }),
  pastDueWorkspaces: z.number().int(),
  pendingInvitations: z.number().int(),
  waitlist: z.number().int(),
  activeSessions: z.number().int(),
})
export type AdminMetrics = z.infer<typeof AdminMetricsSchema>

const Who = z.object({ id: Id, email: Email })
export const AuditEntrySchema = z.object({
  id: Id,
  at: Iso,
  /** Null once the actor's account is gone (ON DELETE SET NULL). */
  actor: Who.nullable(),
  impersonated: Who.nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  reason: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
})
export type AuditEntry = z.infer<typeof AuditEntrySchema>

/**
 * `AdminUser.suspended`: present whenever the account has a suspension record, expired or not —
 * `admin.users.suspend` / `unsuspend` is how it is cleared, not time passing. `active` is the
 * answer to "is this in force right now" (`isSuspended(user, now)` in `apps/api`, computed at read
 * time so the client never has to re-derive it from `until`); the object itself still carries
 * `until` for display even once `active` is false. `reason` is the admin's own, for this admin
 * view only: it never reaches the suspended user (mail, sign-in message) or an export.
 */
export const AdminUserSuspensionSchema = z.object({
  at: Iso,
  /** Null = indefinite. */
  until: Iso.nullable(),
  /** Whether `isSuspended` would say true right now — false for an expired, uncleared record. */
  active: z.boolean(),
  reason: z.string(),
  /** Null once the admin who suspended the account is purged. */
  by: Who.nullable(),
})
export type AdminUserSuspension = z.infer<typeof AdminUserSuspensionSchema>

export const AdminUserSchema = z.object({
  id: Id,
  email: Email,
  name: z.string(),
  emailVerified: z.boolean(),
  createdAt: Iso,
  hasPassword: z.boolean(),
  providers: z.array(ProviderIdSchema),
  workspaceCount: z.number().int(),
  superadmin: z.boolean(),
  avatarUrl: z.string().nullable(),
  /** How many passkeys the account holds; `admin.users.removePasskeys` clears them all. */
  passkeys: z.number().int(),
  suspended: AdminUserSuspensionSchema.nullable(),
})
export type AdminUser = z.infer<typeof AdminUserSchema>
export const AdminUserPageSchema = z.object({
  items: z.array(AdminUserSchema),
  nextCursor: Id.nullable(),
})
export const AdminUserDetailSchema = AdminUserSchema.extend({
  twoFactorEnabled: z.boolean(),
  /** When the user's requested deletion purges the account; null when none is scheduled. */
  deletionScheduledAt: Iso.nullable(),
  memberships: z.array(
    z.object({
      workspace: z.object({ id: Id, name: z.string(), slug: z.string() }),
      role: RoleSchema,
      plan: PlanKeySchema,
    })
  ),
  sessions: z.object({
    count: z.number().int(),
    lastSeenAt: Iso.nullable(),
    impersonations: z.number().int(),
  }),
  audit: z.array(AuditEntrySchema),
})
export type AdminUserDetail = z.infer<typeof AdminUserDetailSchema>

export const AdminWorkspaceSchema = z.object({
  id: Id,
  name: z.string(),
  slug: z.string(),
  owners: z.array(Who),
  memberCount: z.number().int(),
  /** The plan the workspace is entitled to right now (free when nothing live is mirrored). */
  plan: PlanKeySchema,
  /** The mirrored subscription's status, null when there is none. */
  status: BillingStatusSchema.nullable(),
  createdAt: Iso,
  logoUrl: z.string().nullable(),
})
export type AdminWorkspace = z.infer<typeof AdminWorkspaceSchema>
export const AdminWorkspacePageSchema = z.object({
  items: z.array(AdminWorkspaceSchema),
  nextCursor: Id.nullable(),
})
export const AdminWorkspaceDetailSchema = AdminWorkspaceSchema.extend({
  members: z.array(z.object({ userId: Id, email: Email, role: RoleSchema })),
  billing: z
    .object({
      provider: z.string(),
      subscriptionId: z.string(),
      status: BillingStatusSchema,
      interval: IntervalSchema,
      currentPeriodEnd: Iso.nullable(),
    })
    .nullable(),
  audit: z.array(AuditEntrySchema),
})
export type AdminWorkspaceDetail = z.infer<typeof AdminWorkspaceDetailSchema>

export const AuditListSchema = z.object({
  actorId: CoercedId.optional(),
  targetType: z.string().trim().max(50).optional(),
  targetId: z.string().trim().max(100).optional(),
  cursor: CoercedId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
/** The limits `audit.prune` runs under right now: AUDIT_PII_RETENTION_DAYS / AUDIT_RETENTION_DAYS. */
export const AuditRetentionSchema = z.object({
  piiDays: z.number().int(),
  rowDays: z.number().int(),
})
export type AuditRetention = z.infer<typeof AuditRetentionSchema>

export const AuditPageSchema = z.object({
  items: z.array(AuditEntrySchema),
  nextCursor: Id.nullable(),
  retention: AuditRetentionSchema,
})

/** `admin.audit.export`'s formats: a CSV spreadsheets open directly, or JSON Lines for a SIEM. */
export const AUDIT_EXPORT_FORMATS = ["csv", "jsonl"] as const
export type AuditExportFormat = (typeof AUDIT_EXPORT_FORMATS)[number]
/** `admin.audit.export`'s `from`/`to`: whole UTC days, inclusive, at most this many apart. */
export const AUDIT_EXPORT_RANGE_MAX_DAYS = 366
/**
 * `admin.audit.export`'s refusal once the filtered range matches too many rows — the handler
 * selects one row past the cap and refuses rather than returning a truncated file. This exact
 * string (the default cap, 100 000) is only the contract's declared default for a bare
 * `errors.CONFLICT()`; it does **not** follow `ServerOptions.auditExportMaxRows` when a caller
 * overrides it (every test does, with a small cap) — the handler builds the real message with
 * `auditExportCapMessage(cap)` below instead. Don't "fix" this constant to read the override; fix
 * the handler if it ever stops calling `auditExportCapMessage`.
 */
export const AUDIT_EXPORT_CAP_MESSAGE = "Narrow the date range: more than 100 000 entries match."
/**
 * Formats `maxRows` with a space thousands separator (matching `AUDIT_EXPORT_CAP_MESSAGE`'s own
 * "100 000") and returns `admin.audit.export`'s real CONFLICT message for whatever cap is
 * actually in force — `auditExportCapMessage(100_000) === AUDIT_EXPORT_CAP_MESSAGE` (pinned by a
 * test), so the two can never read differently for the production default.
 */
export function auditExportCapMessage(maxRows: number): string {
  const formatted = Math.trunc(maxRows)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  return `Narrow the date range: more than ${formatted} entries match.`
}
/** `admin.audit.export`'s TOO_MANY_REQUESTS, one shared budget (`audit-export:<adminId>`). */
export const AUDIT_EXPORT_RATE_MESSAGE = "Too many exports, try again later"
/** `admin.audit.export`'s BAD_REQUEST for a malformed `from`/`to`, `from` after `to`, or a range
 * over `AUDIT_EXPORT_RANGE_MAX_DAYS` — the schema itself refuses these (`superRefine`), so this is
 * only the default message a bare `errors.BAD_REQUEST()` would carry. */
export const AUDIT_EXPORT_DATE_MESSAGE =
  "from and to must be valid YYYY-MM-DD dates, from on or before to, at most 366 days apart, and to no later than tomorrow (UTC)."

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * True only for a string that is both `YYYY-MM-DD` and a real calendar date. `Date.UTC` silently
 * normalises an out-of-range month or day (`2024-02-30` becomes March 1st) rather than refusing
 * it, so the round trip through `Date.UTC` and back is the check: a real date survives it
 * unchanged, an invalid one does not.
 */
function isCalendarDate(value: string): boolean {
  const match = DATE_RE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/**
 * `admin.audit.export`'s input. `from`/`to` are checked together (real calendar dates, `from` on
 * or before `to`, at most `AUDIT_EXPORT_RANGE_MAX_DAYS` apart) in one `superRefine`, so a single
 * malformed value does not hide a second problem — oRPC turns any issue here into `BAD_REQUEST`
 * the same way it does for every other procedure's input. The filters mirror `AuditListSchema`'s.
 */
export const AuditExportSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    format: z.enum(AUDIT_EXPORT_FORMATS),
    actorId: CoercedId.optional(),
    targetType: z.string().trim().max(50).optional(),
    targetId: z.string().trim().max(100).optional(),
  })
  .superRefine((value, ctx) => {
    const fromOk = isCalendarDate(value.from)
    const toOk = isCalendarDate(value.to)
    if (!fromOk) {
      ctx.addIssue({ code: "custom", path: ["from"], message: AUDIT_EXPORT_DATE_MESSAGE })
    }
    if (!toOk) {
      ctx.addIssue({ code: "custom", path: ["to"], message: AUDIT_EXPORT_DATE_MESSAGE })
    }
    if (!fromOk || !toOk) return
    if (value.from > value.to) {
      ctx.addIssue({ code: "custom", path: ["to"], message: AUDIT_EXPORT_DATE_MESSAGE })
      return
    }
    const fromMs = Date.parse(`${value.from}T00:00:00.000Z`)
    const toMs = Date.parse(`${value.to}T00:00:00.000Z`)
    const days = Math.round((toMs - fromMs) / 86_400_000)
    if (days > AUDIT_EXPORT_RANGE_MAX_DAYS) {
      ctx.addIssue({ code: "custom", path: ["to"], message: AUDIT_EXPORT_DATE_MESSAGE })
    }
  })
export type AuditExport = z.infer<typeof AuditExportSchema>

export const ImpersonateSchema = z.object({
  id: CoercedId,
  reason: z.string().trim().min(3).max(200),
  /** The admin's browser, recorded on the issued session like any sign-in. */
  client: ClientInfoSchema,
})
export const ImpersonationResultSchema = z.object({
  token: z.string(),
  expiresAt: Iso,
  user: UserSchema,
})
export type ImpersonationResult = z.infer<typeof ImpersonationResultSchema>

/** `admin.users.resetTwoFactor`: `userId` names the path param, unlike `AdminIdSchema`'s `id`. */
export const ResetTwoFactorSchema = z.object({
  userId: CoercedId,
  reason: z.string().trim().min(3).max(200),
})

/** `admin.users.removePasskeys`: `userId` names the path param, like `ResetTwoFactorSchema`'s. */
export const RemovePasskeysSchema = z.object({
  userId: CoercedId,
  reason: z.string().trim().min(3).max(200),
})

/**
 * `admin.users.list`'s own input: `AdminListSchema` plus a `suspended=true` filter (its absence
 * means no filter — there is no `suspended=false`, since that is every other user). Kept separate
 * from `AdminListSchema` so `admin.workspaces.list`, which shares that schema, never sees it.
 */
export const AdminUserListSchema = AdminListSchema.extend({
  suspended: z.literal("true").optional(),
})

/**
 * `admin.users.suspend`: `userId` names the path param, like `ResetTwoFactorSchema`'s. `until` is
 * optional (omitted = indefinite) and checked against "now" in the handler, not here — a schema
 * cannot know the request's own clock.
 */
export const SuspendUserSchema = z.object({
  userId: CoercedId,
  reason: z.string().trim().min(3).max(200),
  until: Iso.optional(),
})

/** `admin.users.unsuspend`: `userId` names the path param, like `SuspendUserSchema`'s. */
export const UnsuspendUserSchema = z.object({
  userId: CoercedId,
  reason: z.string().trim().min(3).max(200),
})

/** A dead job, as `admin.jobs.list` shows it — never the payload. */
export const AdminJobSchema = z.object({
  id: Id,
  name: z.string(),
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  lastError: z.string().nullable(),
  runAt: Iso,
  finishedAt: Iso.nullable(),
})
export type AdminJob = z.infer<typeof AdminJobSchema>

export const AdminJobsSchema = z.object({
  counts: z.object({
    queued: z.number().int(),
    running: z.number().int(),
    dead: z.number().int(),
  }),
  /** The 20 most recently dead jobs, newest first. */
  dead: z.array(AdminJobSchema),
})
export type AdminJobs = z.infer<typeof AdminJobsSchema>

/** How many `admin.support.list` returns per page, newest first. */
export const ADMIN_SUPPORT_PAGE_SIZE = 50

/** `admin.support.list`'s `status` filter: a real status, or every request regardless of it. */
export const AdminSupportStatusFilterSchema = z.enum([...SUPPORT_STATUSES, "all"])
export type AdminSupportStatusFilter = z.infer<typeof AdminSupportStatusFilterSchema>
export const AdminSupportListSchema = z.object({
  status: AdminSupportStatusFilterSchema.default("open"),
  cursor: CoercedId.optional(),
})

/** A help-center contact request, as the admin UI shows it — the message is plain text, never
 * rendered as HTML (see `/admin/support`). */
export const SupportRequestSchema = z.object({
  id: Id,
  /** `HELP-<id>`, the same reference the sender and the support mail were given. */
  reference: z.string(),
  email: Email,
  name: z.string().nullable(),
  topic: z.enum(SUPPORT_TOPICS),
  message: z.string(),
  page: z.string().nullable(),
  /** The signed-in user the request was sent from, when there was one. */
  userId: Id.nullable(),
  status: z.enum(SUPPORT_STATUSES),
  createdAt: Iso,
  resolvedAt: Iso.nullable(),
  resolvedBy: Who.nullable(),
})
export type SupportRequest = z.infer<typeof SupportRequestSchema>
export const AdminSupportPageSchema = z.object({
  items: z.array(SupportRequestSchema),
  nextCursor: Id.nullable(),
})

/** How many `admin.applications.list` returns per page, newest first. */
export const ADMIN_APPLICATIONS_PAGE_SIZE = 50

/** `admin.applications.list`'s `status` filter: a real status, or every application regardless. */
export const AdminApplicationStatusFilterSchema = z.enum([...APPLICATION_STATUSES, "all"])
export type AdminApplicationStatusFilter = z.infer<typeof AdminApplicationStatusFilterSchema>
export const AdminApplicationListSchema = z.object({
  status: AdminApplicationStatusFilterSchema.default("all"),
  job: z.string().trim().min(1).max(100).optional(),
  cursor: CoercedId.optional(),
})

/** A job application, as `/admin/applications` shows it — the note is plain text, never rendered
 * as HTML (see the page). */
export const AdminApplicationSchema = z.object({
  id: Id,
  /** `JOB-<id>`, the same reference the applicant and the hiring mail were given. */
  reference: z.string(),
  job: z.object({ slug: z.string(), title: z.string() }),
  name: z.string(),
  email: Email,
  link: z.string().nullable(),
  note: z.string().nullable(),
  status: z.enum(APPLICATION_STATUSES),
  createdAt: Iso,
  statusChangedAt: Iso.nullable(),
  statusChangedBy: Who.nullable(),
})
export type AdminApplication = z.infer<typeof AdminApplicationSchema>
export const AdminApplicationPageSchema = z.object({
  items: z.array(AdminApplicationSchema),
  nextCursor: Id.nullable(),
})

export const AdminApplicationSetStatusSchema = z.object({
  id: CoercedId,
  status: z.enum(APPLICATION_STATUSES),
})

/** `admin.analytics.summary`'s input: `?days=` on the page falls back to 7 for anything else
 * (not an error), but the procedure itself only ever accepts these three. */
export const AdminAnalyticsDaysSchema = z.union([z.literal(7), z.literal(30), z.literal(90)])
export const AdminAnalyticsSummarySchema = z.object({ days: AdminAnalyticsDaysSchema })

/**
 * `admin.analytics.summary`'s output. `days` covers every UTC day in the range (zeros filled
 * in): past days from `analytics_daily`, today from the raw tables with the same aggregation.
 * `topPages` and `topReferrers` are each the top 10 for the range; `events` is per (day, name);
 * `funnel` is nested sets within the range — `signed_up`, then of those `email_verified`, then
 * `workspace_created`, then `activated` (`invitation_accepted` or `note_created`) — never
 * ordered by timestamp against each other.
 */
export const AnalyticsSummarySchema = z.object({
  days: z.array(
    z.object({ day: z.string(), visitors: z.number().int(), pageviews: z.number().int() })
  ),
  topPages: z.array(z.object({ app: z.string(), path: z.string(), pageviews: z.number().int() })),
  topReferrers: z.array(z.object({ host: z.string(), pageviews: z.number().int() })),
  events: z.array(z.object({ day: z.string(), name: z.string(), count: z.number().int() })),
  funnel: z.array(z.object({ step: z.string(), users: z.number().int() })),
  /**
   * ANALYTICS_RETENTION_DAYS. `funnel` and `topReferrers` read raw rows, so a range longer than
   * this covers only the retained days for those two (the dashboard says so).
   */
  retentionDays: z.number().int().positive(),
})
export type AnalyticsSummary = z.infer<typeof AnalyticsSummarySchema>
