import { implement, ORPCError } from "@orpc/server"
import {
  ADMIN_APPLICATIONS_PAGE_SIZE,
  ADMIN_LEADS_PAGE_SIZE,
  ADMIN_SUPPORT_PAGE_SIZE,
  type AdminApplication,
  type AdminJob,
  type AdminUser,
  type AdminWorkspace,
  API_SCOPES,
  type ApiKeySummary,
  AUDIT_EXPORT_DATE_MESSAGE,
  type AuditEntry,
  auditExportCapMessage,
  type BillingStatus,
  BOOKING_AVAILABILITY_MAX_DAYS,
  BOOKING_CANCEL_CUTOFF_HOURS,
  BOOKING_EARLY_START_FIELD,
  BOOKING_PACKAGE_FULL_FIELD,
  BOOKING_TIMEZONE,
  type BookingAudience,
  type BookingSlot,
  bookingReference,
  contract,
  DEFAULT_PAGE_SIZE,
  DELETION_GRACE_MS,
  EMAIL_CHANGE_CODE_REASON,
  EmailSchema,
  EXPORT_REQUEST_INTERVAL_MS,
  earlyStartRequired,
  entitlementsFor,
  INVITE_DOMAIN_INVALID_REASON,
  INVITE_DOMAIN_LIMIT_REASON,
  INVITE_DOMAIN_REASON,
  type Invitation,
  inviteDomainAllowed,
  JOB_RETRY_CONFLICT_MESSAGE,
  jobReference,
  MAX_API_KEYS,
  MAX_PASSKEYS,
  MAX_WEBHOOK_ENDPOINTS,
  NOTIFICATION_UNREAD_CAP,
  normalizeInviteDomains,
  OFFERINGS,
  type OfferingKey,
  OWNER_TWO_FACTOR_REASON,
  opensNewContract,
  type Passkey,
  type PlanKey,
  REAUTH_WINDOW_MS,
  type Role,
  roleAtLeast,
  SELF_REMOVE_PASSKEYS_MESSAGE,
  SELF_RESET_MESSAGE,
  SELF_SUSPEND_MESSAGE,
  SELF_TARGET_MESSAGE,
  type SessionSummary,
  SUPERADMIN_REMOVE_PASSKEYS_MESSAGE,
  SUPERADMIN_RESET_MESSAGE,
  SUPERADMIN_SUSPEND_MESSAGE,
  SUPERADMIN_TARGET_MESSAGE,
  SUSPEND_UNTIL_INVALID_MESSAGE,
  SUSPEND_UNTIL_MAX_DAYS,
  SUSPENDED_TARGET_MESSAGE,
  type SupportRequest,
  supportPage,
  supportReference,
  TWO_FACTOR_PASSWORD_REASON,
  TWO_FACTOR_REAUTH_REASON,
  TWO_FACTOR_WRONG_CODE_REASON,
  type User,
  WEBHOOK_DELIVERIES_LIMIT,
  WEBHOOK_EVENT_TYPES,
  type WebhookDelivery,
  type WebhookEndpoint,
  WORKSPACE_TWO_FACTOR_REASON,
  workspaceChannel,
} from "@repo/api-contract"
import { TERMS_VERSION } from "@repo/api-contract/legal"
import { formatUtcDate } from "@repo/i18n/dates"
import { DEFAULT_LOCALE, isLocale, type Locale } from "@repo/i18n/locales"
import type { FailureLimiter, RateLimiter } from "@repo/service-kit"
import { BRAND_NAME } from "@repo/sites/brand"
import * as arctic from "arctic"
import { blockedByTwoFactor, findMembership, resolveSession, satisfiesTwoFactor } from "./access"
import {
  audit,
  auditWhileImpersonating,
  auditWorkspace,
  IMPERSONATION_TTL_MS,
  isSuperadmin,
  refuseWhileImpersonating,
} from "./admin"
import { shapeIngest, toForwardItem } from "./analytics/ingest"
import type { AnalyticsProvider } from "./analytics/providers/provider"
import { recordEvent } from "./analytics/record"
import { visitorId } from "./analytics/visitor"
import { apiKeyStatus, type generateApiKey, parseScopes } from "./api-keys"
import { submitApplication } from "./applications"
import { auditExportRange, isToWithinBounds, toCsv, toJsonl } from "./audit-export"
import {
  assertEntitled,
  assertSeatAvailable,
  entitlementsForWorkspace,
} from "./billing/entitlements"
import { isMockBilling } from "./billing/mock"
import type { BillingProvider } from "./billing/provider"
import {
  daysBetween as bookingDays,
  endOf,
  isOfferedSlot,
  overlaps,
  shiftDay as shiftBookingDay,
  slotsForDay,
  zonedDay,
  zonedInstant,
} from "./booking/availability"
import { formatWhen, formatWhere } from "./booking/format"
import {
  cancellableAt,
  mailBasics,
  manageUrlFor,
  memberBookingUrlFor,
  newBookingMailProps,
  newManageToken,
  offeringLabel,
  termsMailProps,
  termsUrlFor,
  toAdminBooking,
  toBlock,
  toSummary as toBookingSummary,
  toGroupEvent,
} from "./booking/service"
import {
  DUMMY_HASH,
  EMAIL_CHANGE_REVERT_TTL_MS,
  EMAIL_CHANGE_TTL_MS,
  hashPassword,
  INVITE_TTL_MS,
  MAGIC_TTL_MS,
  newToken,
  PASSKEY_CHALLENGE_TTL_MS,
  RESET_TTL_MS,
  SESSION_TTL_MS,
  TOUCH_INTERVAL_MS,
  TWO_FACTOR_CHALLENGE_TTL_MS,
  tokenHash,
  VERIFY_TTL_MS,
  verifyPassword,
} from "./credentials"
import type { Db, Queries } from "./db"
import { type ApiMessageKey, apiMessage, requiresRoleMessage } from "./i18n"
import { analyticsForwardJob, DAY_MS, dayOf } from "./jobs/builtin/analytics"
import { enqueueMail } from "./jobs/builtin/mail"
import { privacyExportJob } from "./jobs/builtin/privacy"
import { enqueueStorageDelete } from "./jobs/builtin/storage"
import type { JobDefinition } from "./jobs/define"
import type { EnqueueOptions } from "./jobs/enqueue"
import { submitLead, toAdminLead } from "./leads"
import { detach, type Mailer, maskEmail } from "./mail/mailer"
import {
  notificationPreferencesFor,
  setNotificationEmail,
  verifyUnsubscribeToken,
} from "./notification-email"
import { isActor, listNotifications, notifyUser } from "./notifications"
import { type Profile, type Provider, ProviderExchangeError } from "./oauth/provider"
import {
  assertionIds,
  authenticationOptions,
  counterAdvances,
  type RelyingParty,
  registrationOptions,
  userHandleFor,
  verifyAuthentication,
  verifyRegistration,
} from "./passkeys"
import type { AdminUserRow, AdminWorkspaceRow } from "./queries/admin"
import type { ApiKeyListRow, ApiKeyRow } from "./queries/api-keys"
import type { AdminApplicationRow } from "./queries/applications"
import type { AuditDetailRow } from "./queries/audit"
import type { GroupEventWithSeats } from "./queries/booking"
import type { IdentityRow, ProviderId } from "./queries/identities"
import type { InvitationDetailRow } from "./queries/invitations"
import { isDedupeConflict, type JobRow } from "./queries/jobs"
import type { MembershipRow } from "./queries/memberships"
import type { PasskeyRow } from "./queries/passkeys"
import type { SessionRow } from "./queries/sessions"
import type { AdminSupportRequestRow } from "./queries/support"
import { EmailTakenError, isSuspended, normalizeEmail, type UserRow } from "./queries/users"
import {
  parseWebhookEvents,
  type WebhookDeliveryRow,
  type WebhookEndpointListRow,
} from "./queries/webhooks"
import {
  INVITE_DOMAINS_UNREADABLE,
  inviteDomainAllowedUnder,
  inviteDomainsOf,
  requiresTwoFactor,
} from "./queries/workspaces"
import { publishAfterCommit } from "./realtime/after-commit"
import type { Broadcaster } from "./realtime/broadcaster"
import { slugify } from "./slug"
import type { Storage } from "./storage/storage"
import { vitalsByApp } from "./telemetry/p75"
import type { TelemetryProvider } from "./telemetry/provider"
import { recordBatch } from "./telemetry/record"
import {
  generateRecoveryCodes,
  looksLikeRecoveryCode,
  normalizeRecoveryCode,
} from "./two-factor/recovery"
import { decryptSecret, encryptSecret } from "./two-factor/secret"
import { encodeSecret, generateTotpSecret, otpauthUrl, verifyTotp } from "./two-factor/totp"
import { newFileKey, replaceImage } from "./uploads"
import { apiKeyData, memberData, noteData, workspaceData } from "./webhooks/data"
import { emitWebhookEvent, sendWebhookPing } from "./webhooks/emit"
import { encryptWebhookSecret } from "./webhooks/secret"
import { newWebhookSecret } from "./webhooks/sign"
import { checkWebhookUrl, type Resolver, type WebhookUrlRefusal } from "./webhooks/ssrf"
import { listWorkspaceActivity } from "./workspace-activity"
import {
  acceptInvitation,
  cancelLiveSubscription,
  deleteWorkspaceInTx,
  isPendingInviteTaken,
  isSlugTaken,
  removeMemberInTx,
  setRoleInTx,
  toWorkspace,
  transferOwnershipInTx,
  uniqueSlug,
} from "./workspaces"

/** Subscription statuses after which a new checkout may start. */
const ENDED_STATUSES: readonly BillingStatus[] = ["canceled", "incomplete", "unpaid"]

export type Context = {
  db: Db
  /** The x-session-token header, if the caller forwarded one. */
  sessionToken: string | null
  /** The api's clock (the system clock, or a test's): what a suspension's end date is read against. */
  now: () => Date
  mailer: Mailer
  authUrl: string
  /** Base URL of the account app, for links in account mail. */
  accountUrl: string
  signInLimiter: RateLimiter
  /** Throttles reset requests per email; a tripped limit answers exactly like success. */
  resetLimiter: RateLimiter
  /** Caps password-reset requests api-wide (rotating client ids, many addresses); silent too. */
  resetGlobalLimiter: RateLimiter
  /** Throttles verification resends per user. */
  verifyLimiter: RateLimiter
  /** Throttles magic-link requests per email; a tripped limit answers exactly like success. */
  magicLimiter: RateLimiter
  /** Caps magic-link requests api-wide (rotating client ids, many addresses); silent too. */
  magicGlobalLimiter: RateLimiter
  /** Throttles waitlist joins per calling client; checked before anything is stored. */
  waitlistLimiter: RateLimiter
  /** Throttles support requests per calling client (`support:<ip hash>`); checked first. */
  supportLimiter: RateLimiter
  /**
   * Throttles support requests per typed address (`support-to:<normalised email>`): each one
   * mails a confirmation to it, so this caps what one address can be sent. Checked second.
   */
  supportRecipientLimiter: RateLimiter
  /** Caps support requests api-wide (rotating client ids); checked last of the three. */
  supportGlobalLimiter: RateLimiter
  /**
   * Throttles `auth.notificationEmail.unsubscribe` and `peek` per calling client
   * (`notification-email:<x-api-client-id>`), only once the token has verified.
   */
  notificationEmailLimiter: RateLimiter
  /** Caps both api-wide (rotating client ids); checked after the per-client limit. */
  notificationEmailGlobalLimiter: RateLimiter
  /** Where support requests are mailed: SUPPORT_EMAIL, else MAIL_FROM's address. */
  supportEmail: string
  /** Throttles job applications per calling client (`jobs:<ip hash>`); checked first. */
  jobsLimiter: RateLimiter
  /**
   * Throttles job applications per typed address (`jobs-to:<normalised email>`): each one mails a
   * confirmation to it, so this caps what one address can be sent. Checked second.
   */
  jobsRecipientLimiter: RateLimiter
  /** Caps job applications api-wide (rotating client ids); checked last of the three. */
  jobsGlobalLimiter: RateLimiter
  /** Where job applications are mailed: HIRING_EMAIL, else `supportEmail`. */
  hiringEmail: string
  /** Throttles booking writes per calling client (`booking:<ip hash>`); checked first. */
  bookingLimiter: RateLimiter
  /** Throttles booking writes per typed address (`booking-to:<normalised email>`); second. */
  bookingRecipientLimiter: RateLimiter
  /** Caps booking writes api-wide (rotating client ids); checked last of the three. */
  bookingGlobalLimiter: RateLimiter
  /** Where new bookings and requests are mailed: BOOKING_EMAIL, else `supportEmail`. */
  bookingEmail: string
  /** Throttles contact requests (`leads.create`) per calling client (`leads:<ip hash>`); first. */
  leadsLimiter: RateLimiter
  /**
   * Throttles contact requests per typed address (`leads-to:<normalised email>`): each one mails
   * a confirmation to it, so this caps what one address can be sent. Checked second.
   */
  leadsRecipientLimiter: RateLimiter
  /** Caps contact requests api-wide (rotating client ids); checked last of the three. */
  leadsGlobalLimiter: RateLimiter
  /** Caps sign-ups api-wide: the client id is not trusted for this (it is ip-derived). */
  signUpLimiter: RateLimiter
  /** Caps sign-ups per normalised email, before anything is checked or mailed. */
  signUpEmailLimiter: RateLimiter
  /** Base URL of the app, for invitation links. */
  appUrl: string
  /** Throttles invitations per workspace; checked before anything is stored. */
  inviteLimiter: RateLimiter
  /** Throttles invitations per inviting user, across workspaces; checked after `inviteLimiter`. */
  inviterLimiter: RateLimiter
  /** Throttles workspace creation per user; checked before anything else. */
  workspaceCreateLimiter: RateLimiter
  /** The x-api-client-id header (trimmed, at most 128 chars), or null when absent. */
  clientId: string | null
  /** What user-facing messages answer in: the x-locale header, negotiated, else English. */
  locale: Locale
  /** The supported locale x-locale actually named, or null; what account creation stores. */
  requestedLocale: Locale | null
  /** Base URL of the marketing site, for links in waitlist mail. */
  wwwUrl: string
  /** The configured sign-in providers; an id missing here answers NOT_FOUND. */
  providers: Map<ProviderId, Provider>
  log: (message: string, error: unknown) => void
  /** The billing provider (Stripe, or the keyless mock); the mirror tables are its record. */
  billing: BillingProvider
  /** Normalised SUPERADMIN_EMAILS; `isSuperadmin` checks a user against it per request. */
  superadminEmails: Set<string>
  /** Throttles impersonation starts per admin. */
  impersonateLimiter: RateLimiter
  /** Where new errors go besides the tables (store = nowhere else; sentry = forwarded). */
  telemetry: TelemetryProvider
  /** Throttles telemetry batches per calling client (the Next routes key it per browser). */
  telemetryLimiter: RateLimiter
  /** The per-app backstop behind `telemetryLimiter`: one bucket per app, whatever the client id. */
  telemetryAppLimiter: RateLimiter
  /** Throttles analytics ingest per calling client (the Next routes key it per browser). */
  analyticsLimiter: RateLimiter
  /** The per-app backstop behind `analyticsLimiter`: one bucket per app, whatever the client id. */
  analyticsAppLimiter: RateLimiter
  /** Where new pageviews/events also go besides the tables (store = nowhere else; forwarded). */
  analytics: AnalyticsProvider
  /** ANALYTICS_RETENTION_DAYS: how many days of raw pageview/event rows `analytics.prune` keeps. */
  analyticsRetentionDays: number
  /** AUDIT_PII_RETENTION_DAYS: how many days an audit row keeps its ip/user_agent. */
  auditPiiRetentionDays: number
  /** AUDIT_RETENTION_DAYS: how many days an audit row lives before `audit.prune` deletes it. */
  auditRetentionDays: number
  /**
   * For a detached failure (a mail send, a prune): logs it and records it as a `server` row for
   * app "api", masked. The detached work has no response to fail, so this is its only trace.
   */
  recordFailure: (message: string, error: unknown) => void
  /** Logs that an api-wide cap refused a request, throttled per key (see `capTripLogger`). */
  noteCapTripped: (key: string) => void
  /** TWO_FACTOR_ENCRYPTION_KEY: decrypts the stored TOTP secrets. */
  twoFactorKey: string
  /**
   * Counts only wrong codes (or passwords), per user: `auth.twoFactor.verify` and the
   * `account.twoFactor.*` mutations each reserve an attempt before checking and refund it when it
   * turns out right, under their own key (`verifyKey` / `manageKey`),
   * so a stolen session grinding sign-in codes cannot also burn a legitimate management attempt.
   */
  twoFactorUserLimiter: FailureLimiter
  /**
   * Counts wrong codes per challenge; refusing one means the code that tripped it was the last
   * allowed, so the challenge is burnt (sized `TWO_FACTOR_MAX_WRONG_CODES - 1`).
   */
  twoFactorChallengeLimiter: RateLimiter
  /** Throttles `admin.users.resetTwoFactor` per admin. */
  resetTwoFactorLimiter: RateLimiter
  /** Throttles `admin.users.removePasskeys` per admin. */
  removePasskeysLimiter: RateLimiter
  /** Throttles `admin.users.suspend` and `unsuspend` per admin, under one shared budget. */
  suspendLimiter: RateLimiter
  /** Throttles `admin.audit.export` per admin (`audit-export:<adminId>`). */
  auditExportLimiter: RateLimiter
  /** `admin.audit.export`'s row cap: a filtered range matching more is a CONFLICT, not truncated. */
  auditExportMaxRows: number
  /** The WebAuthn relying party: PASSKEY_RP_ID, PASSKEY_RP_NAME and the auth/account origins. */
  passkeyRp: RelyingParty
  /**
   * Counts failed passkey sign-ins per calling client (`passkey:<x-api-client-id>`): reserved
   * before anything is checked, refunded on success, so only a failure stays counted.
   */
  passkeyLimiter: FailureLimiter
  /** Where uploaded files live (local disk by default, or any S3-compatible bucket). */
  storage: Storage
  /** Throttles avatar/logo uploads per calling user. */
  uploadLimiter: RateLimiter
  /** Throttles `account.email.requestChange` per user (`email-change:<userId>`). */
  emailChangeLimiter: RateLimiter
  /** `workspaces.webhooks.test`, per workspace (`webhook-test:<workspaceId>`). */
  webhookTestLimiter: RateLimiter
  /**
   * A browser-reachable URL for a storage key — overloaded so a freshly minted key (never null)
   * gets back a non-null string, while a stored one (which may be null) stays nullable.
   */
  fileUrl: {
    (key: string): string
    (key: string | null): string | null
  }
  /**
   * Puts a job on the queue (validated against its payload schema; with `options.tx`, inside the
   * caller's transaction) and nudges the local worker. Resolves to the job's id.
   */
  enqueue: <P>(def: JobDefinition<P>, payload: P, options?: EnqueueOptions) => Promise<number>
  /**
   * Publishes realtime events (note.created/deleted, presence, resync) to workspace subscribers.
   * Picked at boot from the database dialect, overridable with REALTIME_BUS; see
   * apps/api/src/realtime/.
   */
  broadcaster: Broadcaster
  /** Draws a fresh API key (`generateApiKey`); a test injects one to force a prefix collision. */
  generateApiKey: typeof generateApiKey
  /** Resolves a webhook URL's host to every A/AAAA address (the SSRF guard's DNS; tests stub it). */
  webhookResolve: Resolver
  /** Outside production: webhook URLs may be `http`/`https` to `localhost` and `*.localhost`. */
  webhookAllowLocalhostHttp: boolean
}

/** `passkeyCount` is read separately (it has no column on `users`) — every caller fetches it with
 * `db.passkeys.countForUser` right before building the `User` it returns. */
const toUser = (
  row: UserRow,
  superadminEmails: ReadonlySet<string>,
  fileUrl: Context["fileUrl"],
  passkeyCount: number
): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  createdAt: row.created_at,
  emailVerified: row.email_verified_at !== null,
  hasPassword: row.password_hash !== null,
  superadmin: isSuperadmin(row, superadminEmails),
  avatarUrl: fileUrl(row.avatar_key),
  locale: isLocale(row.locale) ? row.locale : DEFAULT_LOCALE,
  deletionScheduledAt: row.deletion_scheduled_at,
  passkeys: passkeyCount,
  twoFactorSatisfied: satisfiesTwoFactor(row, passkeyCount),
})

/** A user row's own saved locale, mapped to English when unset or invalid — same rule as `toUser`. Mail the account receives without asking (password changed, 2FA notices, account reset) renders in it; see `selfInitiatedLocale` for mail the user asked for, and the invitation for the third rule. */
const userLocale = (row: UserRow): Locale => (isLocale(row.locale) ? row.locale : DEFAULT_LOCALE)

/**
 * The locale for a mail the recipient asked for themselves (a password reset, a magic link, a
 * verify link): their saved locale when they ever chose one, else the locale this very request
 * named (`requestedLocale`, the browser's cookie or language), else English.
 */
const selfInitiatedLocale = (context: Context, row: UserRow | null | undefined): Locale =>
  row && isLocale(row.locale) ? row.locale : (context.requestedLocale ?? DEFAULT_LOCALE)

/**
 * The session user (with the session's own token and expiry) when the caller forwarded a live
 * token, else null (missing or expired token, or a suspended user's). Connecting a provider is a security mutation: an
 * impersonator must not be able to link their own identity to the impersonated user's account and
 * keep access past the impersonation's hour.
 */
async function optionalSessionUser(context: Context): Promise<{
  user: UserRow
  session: { token: string; expiresAt: string }
  createdAt: string
} | null> {
  const token = context.sessionToken
  const session = token ? await context.db.sessions.findByToken(tokenHash(token)) : undefined
  if (session && session.impersonated_by !== null) {
    throw new ORPCError("FORBIDDEN", { message: apiMessage(context, "impersonating") })
  }
  const user = session ? await context.db.users.find(session.user_id) : undefined
  if (!token || !session || !user) return null
  // A suspended user's session is dead, as `resolveSession` has it: the callback then carries on
  // as a sign-in, which refuses the suspended account at its own door.
  if (isSuspended(user, context.now())) return null
  return { user, session: { token, expiresAt: session.expires_at }, createdAt: session.created_at }
}

/**
 * Whether a session is too old to connect a provider (or set up two-step verification, or set a
 * first password) without signing in again: `REAUTH_WINDOW_MS` from its `created_at`.
 */
const pastReauthWindow = (createdAt: string) =>
  Date.now() - Date.parse(createdAt) >= REAUTH_WINDOW_MS

/** Connecting a provider on a session past the re-auth window: the client sends the browser to sign in again. */
const connectReauth = (context: Context) => ({
  message: apiMessage(context, "connectReauth"),
  data: { reason: TWO_FACTOR_REAUTH_REASON } as const,
})

// SQLite: "UNIQUE constraint failed: identities.provider, identities.provider_user_id".
// Postgres: duplicate key … "identities_provider_provider_user_id_key" (match the message, as
// `isEmailTaken` does).
const isIdentityTaken = (error: unknown) =>
  error instanceof Error &&
  /UNIQUE constraint failed: identities\.provider|identities_provider_provider_user_id_key/.test(
    error.message
  )

// The user already holds an identity for this provider (index `identities_user_provider`).
const isProviderTakenForUser = (error: unknown) =>
  error instanceof Error &&
  /UNIQUE constraint failed: identities\.user_id, identities\.provider|identities_user_provider/.test(
    error.message
  )

/**
 * Links the provider identity to `userId`. When a concurrent callback won the insert — for the
 * same provider user, or for another identity of this provider on this user — returns the row it
 * wrote instead; the caller compares its owner and provider user id with what it asked for.
 */
async function linkIdentity(
  db: Db,
  userId: number,
  provider: ProviderId,
  profile: Profile
): Promise<IdentityRow | undefined> {
  try {
    await db.identities.create({
      userId,
      provider,
      providerUserId: profile.providerUserId,
      email: profile.email,
    })
    return undefined
  } catch (error) {
    let winner: IdentityRow | undefined
    if (isIdentityTaken(error)) {
      winner = await db.identities.findByProviderUser(provider, profile.providerUserId)
    } else if (isProviderTakenForUser(error)) {
      winner = await db.identities.findForUserProvider(userId, provider)
    } else {
      throw error
    }
    if (!winner) throw error
    return winner
  }
}

/** The declared errors `requireFreshCredential` throws through, so they stay the procedure's own. */
type FreshCredentialErrors = {
  TOO_MANY_REQUESTS: (options: { message: string }) => Error
  UNAUTHORIZED: (options: {
    message: string
    data: { reason: typeof TWO_FACTOR_PASSWORD_REASON }
  }) => Error
  FORBIDDEN: (options: {
    message: string
    data: { reason: typeof TWO_FACTOR_REAUTH_REASON }
  }) => Error
}

/**
 * Re-checks who is asking before a new second factor or sign-in credential is minted (two-step
 * setup, adding a passkey) or the sign-in address is changed: the current password on an account that has one — reserved against
 * the per-user management budget first and refunded when right, so only a wrong one counts — else
 * a session younger than REAUTH_WINDOW_MS (a passwordless account has nothing to re-verify with).
 */
async function requireFreshCredential(
  context: Context & { user: UserRow; session: SessionRow },
  errors: FreshCredentialErrors,
  password: string | undefined,
  reauthKey: "twoFactorReauth" | "passkeyReauth" | "emailChangeReauth"
) {
  const { user } = context
  if (user.password_hash) {
    if (!(await reserveTwoFactorAttempt(context, manageKey(user.id))))
      throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "tooManyAttempts") })
    if (!(await verifyPassword(password ?? "", user.password_hash))) {
      throw errors.UNAUTHORIZED({
        message: apiMessage(context, "currentPasswordIncorrect"),
        data: { reason: TWO_FACTOR_PASSWORD_REASON },
      })
    }
    await refundTwoFactorAttempt(context, manageKey(user.id))
  } else if (pastReauthWindow(context.session.created_at)) {
    throw errors.FORBIDDEN({
      message: apiMessage(context, reauthKey),
      data: { reason: TWO_FACTOR_REAUTH_REASON },
    })
  }
}

/** A wrong 2FA code: translated, and told apart from "Sign in required" by `data.reason`. */
const wrongCode = (context: { locale: Locale }) => ({
  message: apiMessage(context, "twoFactorWrongCode"),
  data: { reason: TWO_FACTOR_WRONG_CODE_REASON } as const,
})

/** `twoFactorUserLimiter`'s key for a sign-in challenge attempt (`auth.twoFactor.verify`). */
const verifyKey = (id: number) => `2fa:verify:${id}`
/** `twoFactorUserLimiter`'s key for an account-management attempt (the three `account.twoFactor.*`
 * mutations), kept separate from `verifyKey` so the two never share a budget. */
const manageKey = (id: number) => `2fa:manage:${id}`

/**
 * Reserves one attempt of `key`'s failure budget before a code (or password) is checked, so a
 * concurrent burst cannot all slip past a peek: false when the budget is spent. Every attempt that
 * turns out right (or never gets checked) gives its reservation back with
 * `refundTwoFactorAttempt`, so only a wrong one is ever counted.
 */
async function reserveTwoFactorAttempt(context: Context, key: string) {
  return (await context.twoFactorUserLimiter.hit(key)).allowed
}

/** Gives back a reservation from `reserveTwoFactorAttempt`: the attempt was not a failure. */
async function refundTwoFactorAttempt(context: Context, key: string) {
  await context.twoFactorUserLimiter.refund(key)
}

/** `workspaces.apiKeys.*`'s row shape: never the key, never its hash. The creator "left" when the
 * id is missing, no longer a member, or no longer an account (purged). */
const toApiKeySummary = (row: ApiKeyListRow, now: Date): ApiKeySummary => {
  const creatorExists = row.created_by !== null && row.creator_name !== null
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: parseScopes(row.scopes),
    createdBy: creatorExists
      ? { id: row.created_by as number, name: row.creator_name as string }
      : null,
    creatorLeft: !creatorExists || !Number(row.creator_is_member),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    status: apiKeyStatus(row, now),
  }
}

/** How many fresh keys `workspaces.apiKeys.create` draws before a prefix collision is a 500. */
export const API_KEY_CREATE_ATTEMPTS = 3

// SQLite: "UNIQUE constraint failed: api_keys.prefix". Postgres: … "api_keys_prefix_key".
const isPrefixTaken = (error: unknown) =>
  error instanceof Error &&
  /UNIQUE constraint failed: api_keys\.prefix|api_keys_prefix_key/.test(error.message)

/** `workspaces.webhooks.deliveries`' row shape (and an endpoint's `lastDelivery`). */
const toWebhookDelivery = (row: WebhookDeliveryRow): WebhookDelivery => ({
  id: row.id,
  eventId: row.event_id,
  eventType: row.event_type as WebhookDelivery["eventType"],
  attempt: row.attempt,
  status: row.status,
  error: row.error,
  durationMs: row.duration_ms,
  createdAt: row.created_at,
})

/** `workspaces.webhooks.*`'s endpoint shape: never the secret, encrypted or not. */
const toWebhookEndpoint = (row: WebhookEndpointListRow): WebhookEndpoint => {
  const stored = parseWebhookEvents(row.events)
  return {
    id: row.id,
    url: row.url,
    description: row.description,
    // Known events only, in canonical order.
    events: WEBHOOK_EVENT_TYPES.filter((event) => stored.includes(event)),
    enabled: row.enabled,
    disabledReason: row.disabled_reason,
    disabledAt: row.disabled_at,
    consecutiveFailures: row.consecutive_failures,
    createdBy:
      row.created_by !== null && row.creator_name !== null
        ? { id: row.created_by, name: row.creator_name }
        : null,
    createdAt: row.created_at,
    lastDelivery: row.last_delivery ? toWebhookDelivery(row.last_delivery) : null,
  }
}

/** The message each SSRF-guard refusal answers with (all BAD_REQUEST). */
const WEBHOOK_URL_MESSAGE_KEYS: Record<WebhookUrlRefusal, ApiMessageKey> = {
  invalid: "webhookUrlInvalid",
  scheme: "webhookUrlInvalid",
  credentials: "webhookUrlInvalid",
  fragment: "webhookUrlInvalid",
  too_long: "webhookUrlInvalid",
  unresolvable: "webhookUrlUnresolved",
  blocked: "webhookUrlBlocked",
}

/** A webhook URL's host, for audit metadata (never the path or query, which may carry tokens). */
const webhookHost = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return ""
  }
}

/**
 * Runs the SSRF guard on a URL an admin typed (resolving its host now) and answers the URL to
 * store — the WHATWG-normalised one the guard checked — or throws BAD_REQUEST naming why.
 */
async function checkedWebhookUrl(context: Context, url: string): Promise<string> {
  const check = await checkWebhookUrl(url, {
    resolve: context.webhookResolve,
    allowLocalhostHttp: context.webhookAllowLocalhostHttp,
  })
  if (!check.ok) {
    throw new ORPCError("BAD_REQUEST", {
      message: apiMessage(context, WEBHOOK_URL_MESSAGE_KEYS[check.reason]),
    })
  }
  return check.url.href
}

/** Canonical order, whatever order the form sent the events in. */
const canonicalEvents = (events: readonly string[]) =>
  WEBHOOK_EVENT_TYPES.filter((event) => events.includes(event))

/** An empty (or blank) description stores none. */
const descriptionOrNull = (description: string | null | undefined) =>
  description ? description : null

/** `account.passkeys.*`'s row shape: never the credential id or the public key. */
const toPasskey = (row: PasskeyRow): Passkey => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
})

/** A blank name, from the authenticator's own transports: a platform or phone passkey is "This
 * device", anything else (a roaming key, or no transports reported) "Security key". */
const defaultPasskeyName = (context: { locale: Locale }, transports: readonly string[] = []) =>
  apiMessage(
    context,
    transports.includes("internal") || transports.includes("hybrid")
      ? "passkeyNameDevice"
      : "passkeyNameSecurityKey"
  )

// SQLite: "UNIQUE constraint failed: passkeys.credential_id". Postgres: duplicate key …
// "passkeys_credential_id_key".
const isCredentialTaken = (error: unknown) =>
  error instanceof Error &&
  /UNIQUE constraint failed: passkeys\.credential_id|passkeys_credential_id_key/.test(error.message)

/** Mints a single-use passkey challenge row (only its hash is stored) for `ceremony`. */
async function storePasskeyChallenge(
  context: Context,
  challenge: string,
  ceremony: "register" | "authenticate",
  userId: number | null
) {
  await context.db.tokens.create({
    userId,
    purpose: "passkey_challenge",
    tokenHash: tokenHash(challenge),
    expiresAt: new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS).toISOString(),
    ceremony,
  })
}

const api = implement(contract).$context<Context>()

// Resolves the forwarded session token into the user, or refuses. Every ⚑ procedure uses it.
// An impersonation session also needs its admin to still exist and still be a superadmin:
// removing an address from SUPERADMIN_EMAILS ends their impersonations at the next request.
const requireSession = api.middleware(async ({ context, next }) => {
  const resolved = await resolveSession(
    context.db,
    context.sessionToken,
    context.superadminEmails,
    context.now()
  )
  if (!resolved) {
    throw new ORPCError("UNAUTHORIZED", { message: apiMessage(context, "signInRequired") })
  }
  const { user, session, impersonator } = resolved
  return next({ context: { user, session, impersonating: impersonator !== null, impersonator } })
})
const authed = api.use(requireSession)

type SessionContext = Context & {
  user: UserRow
  session: SessionRow
  impersonating: boolean
  impersonator: UserRow | null
}
const sessionApi = implement(contract).$context<SessionContext>()

/**
 * Loads the caller's membership of `input.workspaceId`; outsiders see NOT_FOUND, low roles
 * FORBIDDEN. When the workspace requires two-step verification and the caller has neither two-step
 * on nor a passkey, FORBIDDEN with `data: { reason: "two_factor_required" }` — the data carries
 * that reason only, and the message names the workspace (the caller is a member of it). An
 * impersonation session acts as the member, so it is refused the same way.
 *
 * `twoFactorExempt` is for `workspaces.leave` alone: a blocked member can always leave. Every other
 * exempt procedure (`workspaces.list`, the invitation ones, `account.*`, `auth.*`) never uses this
 * middleware.
 */
const member = (min: Role, options: { twoFactorExempt?: boolean } = {}) =>
  sessionApi.middleware(async ({ context, next }, input: { workspaceId: number }) => {
    const found = await findMembership(context.db, input.workspaceId, context.user.id)
    if (!found) {
      throw new ORPCError("NOT_FOUND", { message: apiMessage(context, "workspaceNotFound") })
    }
    const { membership, workspace } = found
    if (!roleAtLeast(membership.role, min)) {
      throw new ORPCError("FORBIDDEN", { message: requiresRoleMessage(context, min) })
    }
    if (
      !options.twoFactorExempt &&
      (await blockedByTwoFactor(context.db, workspace, context.user))
    ) {
      throw new ORPCError("FORBIDDEN", {
        message: apiMessage(context, "workspaceTwoFactorRequired", { workspace: workspace.name }),
        data: { reason: WORKSPACE_TWO_FACTOR_REASON },
      })
    }
    return next({ context: { workspace, role: membership.role } })
  })

/** The admin namespace does not exist for anyone else: NOT_FOUND, also for impersonation sessions. */
const superadmin = sessionApi.middleware(async ({ context, next }) => {
  if (context.impersonating || !isSuperadmin(context.user, context.superadminEmails)) {
    throw new ORPCError("NOT_FOUND", { message: "Not found" })
  }
  return next({})
})
const adminApi = authed.use(superadmin)

const toAuditEntry = (row: AuditDetailRow): AuditEntry => {
  let metadata: Record<string, unknown> | null = null
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>
    } catch {
      metadata = { raw: row.metadata }
    }
  }
  return {
    id: row.id,
    at: row.at,
    actor:
      row.actor_user_id !== null && row.actor_email !== null
        ? { id: row.actor_user_id, email: row.actor_email }
        : null,
    impersonated:
      row.impersonated_user_id !== null && row.impersonated_email !== null
        ? { id: row.impersonated_user_id, email: row.impersonated_email }
        : null,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    metadata,
  }
}

/** The plan a mirrored (plan, status) pair entitles — the same rule the user sees. */
const planOf = (plan: Exclude<PlanKey, "free"> | null, status: BillingStatus | null): PlanKey =>
  plan && status
    ? entitlementsFor({
        subscription: {
          plan,
          status,
          interval: "month",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
        memberCount: 0,
        portalAvailable: false,
      }).plan
    : "free"

/** `AdminUser.suspended`: present whenever the row holds a suspension record, expired or not —
 * `admin.users.suspend` / `unsuspend` is how it is cleared, not time passing. `active` is
 * `isSuspended`'s own answer for `now`, so a client never has to re-derive it from `until`. */
const toSuspended = (row: AdminUserRow, now: string): AdminUser["suspended"] =>
  row.suspended_at === null
    ? null
    : {
        at: row.suspended_at,
        until: row.suspended_until,
        active: isSuspended(row, now),
        reason: row.suspension_reason ?? "",
        by:
          row.suspended_by === null
            ? null
            : { id: row.suspended_by, email: row.suspended_by_email ?? "" },
      }

const toAdminUser = (
  row: AdminUserRow,
  providers: ProviderId[],
  superadminEmails: ReadonlySet<string>,
  fileUrl: Context["fileUrl"],
  now: string
): AdminUser => ({
  id: row.id,
  email: row.email,
  name: row.name,
  emailVerified: row.email_verified_at !== null,
  createdAt: row.created_at,
  hasPassword: row.password_hash !== null,
  providers,
  workspaceCount: Number(row.workspace_count),
  superadmin: isSuperadmin(row, superadminEmails),
  avatarUrl: fileUrl(row.avatar_key),
  passkeys: Number(row.passkey_count),
  suspended: toSuspended(row, now),
})

/** The declared refusals shared by every admin action that targets one user by id: never
 * yourself, never another superadmin. `resetTwoFactor` and `removePasskeys` share this gate
 * rather than each re-checking it their own way. */
type AdminTargetErrors = {
  FORBIDDEN: (options: { message: string }) => Error
  NOT_FOUND: () => Error
}

async function loadAdminTarget(
  context: SessionContext,
  errors: AdminTargetErrors,
  userId: number,
  selfMessage: string,
  superadminMessage: string
): Promise<UserRow> {
  if (userId === context.user.id) throw errors.FORBIDDEN({ message: selfMessage })
  const target = await context.db.users.find(userId)
  if (!target) throw errors.NOT_FOUND()
  if (isSuperadmin(target, context.superadminEmails)) {
    throw errors.FORBIDDEN({ message: superadminMessage })
  }
  return target
}

const toAdminWorkspace = (
  row: AdminWorkspaceRow,
  owners: { id: number; email: string }[],
  fileUrl: Context["fileUrl"]
): AdminWorkspace => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  owners,
  memberCount: Number(row.member_count),
  plan: planOf(row.sub_plan, row.sub_status),
  status: row.sub_status,
  createdAt: row.created_at,
  logoUrl: fileUrl(row.logo_key),
})

const toAdminJob = (row: Omit<JobRow, "payload">): AdminJob => ({
  id: row.id,
  name: row.name,
  attempts: row.attempts,
  maxAttempts: row.max_attempts,
  lastError: row.last_error,
  runAt: row.run_at,
  finishedAt: row.finished_at,
})

const toSupportRequest = (row: AdminSupportRequestRow): SupportRequest => ({
  id: row.id,
  reference: supportReference(row.id),
  email: row.email,
  name: row.name,
  topic: row.topic,
  message: row.message,
  page: row.page,
  userId: row.user_id,
  status: row.status,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
  resolvedBy:
    row.resolved_by !== null && row.resolved_by_email !== null
      ? { id: row.resolved_by, email: row.resolved_by_email }
      : null,
})

const toAdminApplication = (row: AdminApplicationRow): AdminApplication => ({
  id: row.id,
  reference: jobReference(row.id),
  job: { slug: row.job_slug, title: row.job_title },
  name: row.name,
  email: row.email,
  link: row.link,
  note: row.note,
  status: row.status,
  createdAt: row.created_at,
  statusChangedAt: row.status_changed_at,
  statusChangedBy:
    row.status_changed_by !== null && row.status_changed_by_email !== null
      ? { id: row.status_changed_by, email: row.status_changed_by_email }
      : null,
})

/**
 * A booking's consent to start within the withdrawal period (lag (2005:59) 2 kap. 11 § 1), judged
 * from the sessions' actual start times with `earlyStartRequired`, never from anything the client
 * says about them: `"missing"` when a private client books a session inside the period without
 * `earlyStart`; the time to stamp (`now`) when it was needed and given; `null` when it was not
 * needed, ticked or not.
 */
function earlyStartAt(
  input: { audience: BookingAudience; earlyStart?: boolean },
  offering: OfferingKey,
  startsAts: readonly string[],
  now: Date
): string | null | "missing" {
  if (!earlyStartRequired(offering, input.audience, startsAts, now)) return null
  return input.earlyStart === true ? now.toISOString() : "missing"
}

/**
 * The package a booking adds sessions to: the one whose manage token the order carries
 * (`manageToken`, from the "Book another" link on its manage page), which proves it is the
 * holder's, when it is of the same offering. `"full"` when that package has no room for every
 * slot: the holder is refused (`bookingPackageFull`), never sold a new package instead. `null`
 * for no token, or one that names no package of this offering: the order is then a new purchase,
 * answered exactly as one. Called under the calendar lock, so two orders cannot both take the
 * last session.
 */
async function extendedPackage(
  tx: Pick<Context["db"], "booking">,
  input: { offering: OfferingKey; manageToken?: string },
  sessions: number
) {
  if (input.manageToken === undefined) return null
  const pkg = await tx.booking.packages.byToken(tokenHash(input.manageToken))
  if (!pkg || pkg.offering !== input.offering) return null
  const booked = await tx.booking.packages.sessionsBooked(pkg.id)
  return booked + sessions <= pkg.sessions_total ? pkg : ("full" as const)
}

/** One page of rows (fetched as `limit + 1`) → items and the keyset cursor. */
/**
 * The three booking limiters, in the same order as support's: per client, per typed address,
 * api-wide. Each refusal is the translated `bookingRate`; nothing is stored before all three pass.
 */
async function bookingLimits(context: Context, email: string): Promise<void> {
  const refuse = () =>
    new ORPCError("TOO_MANY_REQUESTS", { message: apiMessage(context, "bookingRate") })
  const perClient = await context.bookingLimiter.hit(`booking:${context.clientId ?? "unknown"}`)
  if (!perClient.allowed) throw refuse()
  const perRecipient = await context.bookingRecipientLimiter.hit(
    `booking-to:${normalizeEmail(email)}`
  )
  if (!perRecipient.allowed) throw refuse()
  const global = await context.bookingGlobalLimiter.hit("booking:global")
  if (!global.allowed) {
    context.noteCapTripped("booking:global")
    throw refuse()
  }
}

function page<T extends { id: number }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit)
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null }
}

/** `day` shifted by `deltaDays` (negative moves earlier), as a `YYYY-MM-DD` UTC day string. */
const shiftDay = (day: string, deltaDays: number) =>
  dayOf(new Date(Date.parse(`${day}T00:00:00.000Z`) + deltaDays * DAY_MS).toISOString())

/** Every UTC day from `start` through `end`, inclusive, ascending. */
function daysBetween(start: string, end: string): string[] {
  const out: string[] = []
  for (let day = start; day <= end; day = shiftDay(day, 1)) out.push(day)
  return out
}

/** `a` with only the members also in `b` — `admin.analytics.summary`'s funnel, one step at a
 * time: each step keeps only the users the step before it already kept. */
const intersect = (a: Set<number>, b: Set<number>) => new Set([...a].filter((id) => b.has(id)))

const toInvitation = (
  row: Omit<InvitationDetailRow, "workspace_require_two_factor" | "workspace_invite_domains">
): Invitation => ({
  id: row.id,
  email: row.email,
  role: row.role,
  invitedBy: { name: row.inviter_name },
  expiresAt: row.expires_at,
  createdAt: row.created_at,
})

/**
 * The two limits `auth.notificationEmail.*` share: per calling client, then api-wide. Called only
 * once a token has verified, so a forged one spends neither. The auth app's one-click route keys
 * its client id on the token's hash (one bucket per real link); its confirm page on the ip hash.
 */
async function notificationEmailAllowed(context: Context): Promise<boolean> {
  const perClient = await context.notificationEmailLimiter.hit(
    `notification-email:${context.clientId ?? "unknown"}`
  )
  if (!perClient.allowed) return false
  const global = await context.notificationEmailGlobalLimiter.hit("notification-email:global")
  if (!global.allowed) {
    context.noteCapTripped("notification-email:global")
    return false
  }
  return true
}

/**
 * Removes `userId` from the workspace, unless that would leave it without an owner, and emits
 * `member.left` and records `action` (a leave or a removal) in the same transaction.
 */
async function removeMember(
  context: SessionContext,
  workspaceId: number,
  userId: number,
  action: "workspace.left" | "member.removed"
) {
  await context.db.transaction(async (tx) => {
    const removed = await removeMemberInTx(tx, workspaceId, userId, context.locale)
    if (!removed) return
    await emitWebhookEvent(context, workspaceId, "member.left", () => memberData(tx, removed), {
      tx,
    })
    await auditWorkspace({ ...context, db: tx }, workspaceId, {
      action,
      targetType: "user",
      targetId: userId,
    })
    // Removed by someone else: tell them. Leaving (or removing yourself) tells nobody.
    if (action === "member.removed" && !isActor(context, userId)) {
      const workspace = await tx.workspaces.find(workspaceId)
      if (workspace)
        await notifyUser(
          context,
          userId,
          "member.removed",
          { workspaceName: workspace.name },
          { tx, workspaceId }
        )
    }
  })
}

/** Emits `member.role_changed` for `membership` (as it was) now holding `role`, inside `tx`. */
async function emitRoleChanged(
  context: Context,
  tx: Queries,
  workspaceId: number,
  membership: MembershipRow,
  role: Role
) {
  await emitWebhookEvent(
    context,
    workspaceId,
    "member.role_changed",
    async () => {
      const member = await memberData(tx, { ...membership, role })
      return member && { ...member, previousRole: membership.role }
    },
    { tx }
  )
}

async function issueSession(
  context: Context,
  user: UserRow,
  client: { userAgent?: string; ip?: string } | undefined,
  impersonation?: { impersonatedBy: number; reason: string; ttlMs: number },
  /** The queries to write with: a transaction's (`tx`) when the caller is inside one. */
  db: Queries = context.db
) {
  const token = newToken()
  const now = Date.now()
  // Expired rows never authenticate; drop them here so a user's table cannot grow without bound.
  await db.sessions.deleteExpired(user.id, new Date(now).toISOString())
  const expiresAt = new Date(now + (impersonation?.ttlMs ?? SESSION_TTL_MS)).toISOString()
  await db.sessions.create({
    userId: user.id,
    tokenHash: tokenHash(token),
    expiresAt,
    userAgent: client?.userAgent ?? null,
    ip: client?.ip ?? null,
    impersonatedBy: impersonation?.impersonatedBy ?? null,
    reason: impersonation?.reason ?? null,
  })
  const passkeyCount = await db.passkeys.countForUser(user.id)
  return {
    user: toUser(user, context.superadminEmails, context.fileUrl, passkeyCount),
    session: { token, expiresAt },
  }
}

/**
 * Refuses a suspended account (`isSuspended` on the api's clock) with FORBIDDEN
 * `ACCOUNT_SUSPENDED_MESSAGE`. Every sign-in path calls it only once its own credential has
 * checked out, so the suspension never answers for a wrong password, a dead link or a bad
 * assertion — it would tell a stranger the account exists. A session a sign-in issues while
 * racing a suspension is refused later by `resolveSession`.
 */
function refuseSuspended(context: Context, user: UserRow) {
  if (isSuspended(user, context.now()))
    throw new ORPCError("FORBIDDEN", { message: apiMessage(context, "accountSuspended") })
}

/**
 * The one door every sign-in path (password, magic link, provider) goes through: an account with
 * two-step verification gets a 5-minute challenge instead of a session, and only
 * `auth.twoFactor.verify` turns that into one. Sign-up and impersonation call `issueSession`.
 */
async function issueSessionOrChallenge(
  context: Context,
  user: UserRow,
  client: { userAgent?: string; ip?: string } | undefined
) {
  refuseSuspended(context, user)
  if (!user.two_factor_enabled_at) {
    return issueSession(context, user, client)
  }
  const challenge = newToken()
  const expiresAt = new Date(Date.now() + TWO_FACTOR_CHALLENGE_TTL_MS).toISOString()
  await context.db.tokens.create({
    userId: user.id,
    purpose: "two_factor_challenge",
    tokenHash: tokenHash(challenge),
    expiresAt,
  })
  return { twoFactor: { challenge, expiresAt } }
}

/**
 * Whether `code` is a valid TOTP code for `user` right now; spends the matched step when it is.
 * Never accepts a recovery code — `enable` confirms the pending secret and must not be satisfied
 * by one of the codes it is about to hand out.
 */
async function checkTotpCode(context: Context, user: UserRow, code: string) {
  if (!user.two_factor_secret) return false
  let secret: Uint8Array
  try {
    secret = await decryptSecret(user.two_factor_secret, context.twoFactorKey)
  } catch (error) {
    // A stored secret the key cannot open (a rotated or wrong key): the user can still use a
    // recovery code, and the operator needs to know.
    context.recordFailure("two-factor secret decrypt failed", error)
    return false
  }
  const step = verifyTotp(secret, code.replace(/\s+/g, ""), user.two_factor_last_step)
  // A concurrent request may have accepted this step (or a later one) first: that is a replay.
  return step !== null && context.db.twoFactor.setLastStep(user.id, step)
}

/** Whether `code` is a valid second factor right now. A TOTP code spends its step here (the
 * replay guard); a recovery code is only matched — the caller spends it, in the transaction that
 * also consumes the challenge, so a losing request in a race spends nothing. */
async function matchSecondFactor(
  context: Context,
  user: UserRow,
  code: string
): Promise<{ kind: "totp" } | { kind: "recovery"; hash: string } | null> {
  if (looksLikeRecoveryCode(code)) {
    const normalized = normalizeRecoveryCode(code)
    if (normalized === null) return null
    const hash = tokenHash(normalized)
    return (await context.db.twoFactor.findUnusedRecoveryCode(user.id, hash))
      ? { kind: "recovery", hash }
      : null
  }
  return (await checkTotpCode(context, user, code)) ? { kind: "totp" } : null
}

/** For `disable` and `regenerateRecoveryCodes`: match and, for a recovery code, spend it now. */
async function checkSecondFactor(context: Context, user: UserRow, code: string, at: string) {
  const matched = await matchSecondFactor(context, user, code)
  if (!matched) return false
  if (matched.kind === "recovery")
    return context.db.twoFactor.useRecoveryCode(user.id, matched.hash, at)
  return true
}

/** Thrown inside `verify`'s transaction to roll it back: the recovery code it matched was spent
 * by a concurrent request on another challenge, so this one is a wrong code after all. */
class RecoveryCodeSpent extends Error {}

const toSummary = (row: SessionRow, currentId: number): SessionSummary => ({
  id: row.id,
  current: row.id === currentId,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
  userAgent: row.user_agent,
})

/** Issues a verification token (burning any earlier one) and queues the link to be mailed. */
async function sendVerification(context: Context, user: UserRow) {
  const now = Date.now()
  const token = newToken()
  const hash = tokenHash(token)
  await context.db.tokens.invalidateForUser(user.id, "email_verify", new Date(now).toISOString())
  await context.db.tokens.create({
    userId: user.id,
    purpose: "email_verify",
    tokenHash: hash,
    expiresAt: new Date(now + VERIFY_TTL_MS).toISOString(),
  })
  // Pruning moved to the tokens.prune schedule: a stale row here just waits for it now.
  const link = `${context.authUrl}/verify-email?token=${token}`
  await enqueueMail(
    context.enqueue,
    "verifyEmail",
    user.email,
    { name: user.name || undefined, link },
    // Sent on sign-up (which stored the request's locale) and on resend: the user's own request.
    {
      idempotencyKey: `verify:${user.id}:${hash.slice(0, 16)}`,
      locale: selfInitiatedLocale(context, user),
    }
  )
}

/**
 * Pre-account hijack: someone registered this email with a password before its owner arrived. A
 * provider (or a magic link) just proved who owns the email; whoever set that password never did.
 * So every session, every connected identity, the password and any reset link go, and the email is
 * marked verified: the owner sets a new password in account; the squatter is locked out (any
 * email change they had pending dies with the rest). Callers
 * run it only for an account whose email was never verified; a verified account is left untouched.
 * One transaction, sessions first, so no step is visible without the others. The owner is told.
 */
async function purgeUnverifiedAccount(context: Context, user: UserRow, at: string) {
  // Defense in depth: `account.twoFactor.setup` / `enable` refuse an unverified account, so no
  // 2FA should exist here — but one that somehow did (set before that rule, or directly) would
  // lock the real owner out behind a squatter's authenticator. First, and outside the transaction
  // (it opens its own): a failure below leaves the email unverified, so a retry purges again.
  await context.db.twoFactor.disable(user.id)
  await context.db.transaction(async (tx) => {
    // The user row first, the order every other writer takes (passkey sign-in, disconnect,
    // removePasskeys): a passkey sign-in racing this either commits first, so the session delete
    // below sees and removes its session, or waits here and then finds no passkey. Deleting the
    // passkey row before this lock would deadlock that sign-in, or let its session survive.
    await tx.users.lockForSession(user.id)
    await tx.sessions.deleteForUser(user.id)
    // An identity the squatter connected while signed in would let them straight back in.
    await tx.identities.deleteAllForUser(user.id)
    // So would a passkey they added (with the password they set), and a registration they began.
    await tx.passkeys.deleteAllForUser(user.id)
    await tx.users.update(user.id, { passwordHash: null })
    await tx.tokens.invalidateForUser(user.id, "password_reset", at)
    await tx.tokens.invalidateForUser(user.id, "two_factor_challenge", at)
    await tx.tokens.invalidateForUser(user.id, "passkey_challenge", at)
    // A change the squatter requested to their own mailbox: its confirm link is theirs, and the
    // owner, signed in now, could be talked into pressing it. Revert links too, in defence.
    await tx.tokens.invalidateForUser(user.id, "email_change", at)
    await tx.tokens.invalidateForUser(user.id, "email_change_cancel", at)
    await tx.tokens.invalidateForUser(user.id, "email_change_revert", at)
    // `revokeSessions` opens its own transaction, so only the stamp here.
    await tx.users.stampSessionsRevoked(user.id, at)
    // The purge is how this account's email becomes verified (only ever run on one that never
    // was, so this is normally its first and only email_verified) — except `user` was read before
    // this transaction, so a concurrent `auth.verifyEmail` for the same account can win the atomic
    // check-and-set first; `markEmailVerified`'s return is the single source of truth for whether
    // this call actually flipped the row, exactly as `auth.verifyEmail` itself gates its own event.
    const justVerified = await tx.users.markEmailVerified(user.id, at)
    if (justVerified)
      await recordEvent(
        context,
        "email_verified",
        { userId: user.id, workspaceId: null },
        {},
        { tx }
      )
    await enqueueMail(
      context.enqueue,
      "accountReset",
      user.email,
      { name: user.name || undefined, accountUrl: context.accountUrl },
      { tx, locale: userLocale(user) }
    )
  })
}

/**
 * Who holds `email` that a revert to it may displace, inside the revert's transaction (the
 * reverting user's row already locked): nobody (undefined), or an account that never verified it.
 * The revert link proves that mailbox, so an unverified holder is a squatter by the same rule as
 * `purgeUnverifiedAccount` — typically a sign-up on the address the change just freed, made to
 * defeat the undo. Throws `EmailTakenError` (thrown, so the rollback leaves the link usable) for a
 * verified holder, and for one that belongs to a workspace (unreachable: joining or creating one
 * needs a verified email, so it owns no workspace and no billing — but never purge one that does).
 * Its row is locked after the reverting user's, in ascending id order: a holder that signed up
 * after the change always has the higher id, and a lower one is refused rather than risk a
 * deadlock with a writer taking both rows in that order.
 */
async function squatterOn(tx: Queries, email: string, userId: number) {
  const holder = await tx.users.findByEmail(email)
  if (!holder || holder.id === userId) return undefined
  if (holder.email_verified_at || holder.id < userId) throw new EmailTakenError()
  await tx.users.lockForSession(holder.id)
  // Re-read under the lock: a magic link or provider sign-in may have verified it meanwhile.
  const locked = await tx.users.find(holder.id)
  if (!locked || locked.email !== holder.email) return undefined
  if (locked.email_verified_at) throw new EmailTakenError()
  if ((await tx.workspaces.listForUser(locked.id)).length > 0) throw new EmailTakenError()
  return locked
}

/** Purges the unverified holder `squatterOn` returned (sessions, tokens, identities — all of
 * `users.purge`), queues its files for deletion, and audits it as the system's doing. */
async function displaceSquatter(
  context: Context,
  tx: Queries,
  squatter: UserRow,
  revertedUserId: number,
  at: string
) {
  const { avatarKey, exportKeys } = await tx.users.purge(squatter.id, at)
  for (const key of [avatarKey, ...exportKeys]) {
    if (key) await enqueueStorageDelete(context.enqueue, key, { tx })
  }
  await tx.audit.create({
    actorUserId: null,
    impersonatedUserId: null,
    action: "user.displaced_by_revert",
    targetType: "user",
    targetId: String(squatter.id),
    reason: null,
    ip: null,
    userAgent: null,
    metadata: JSON.stringify({ email: maskEmail(squatter.email), revertedUserId }),
  })
}

/**
 * A normal password-reset link for the account: the token row (`RESET_TTL_MS`, like
 * `auth.requestPasswordReset`'s) written with `db` — a transaction's when the caller is in one —
 * and the `${AUTH_URL}/reset-password?token=…` link to mail.
 */
async function createResetLink(context: Context, userId: number, db: Queries = context.db) {
  const token = newToken()
  const hash = tokenHash(token)
  await db.tokens.create({
    userId,
    purpose: "password_reset",
    tokenHash: hash,
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
  })
  return { link: `${context.authUrl}/reset-password?token=${token}`, hash }
}

/** Tells the account owner their password changed. */
async function sendPasswordChanged(context: Context, user: UserRow) {
  const at = new Date().toISOString()
  await enqueueMail(
    context.enqueue,
    "passwordChanged",
    user.email,
    {
      name: user.name || undefined,
      at,
      accountUrl: `${context.accountUrl}/security`,
      // Someone who did not make the change is signed out everywhere: the reset is their way in.
      resetUrl: `${context.authUrl}/forgot-password`,
    },
    { locale: userLocale(user) }
  )
}

/** Tells the account owner two-step verification is now on. */
async function sendTwoFactorEnabled(context: Context, user: UserRow) {
  await enqueueMail(
    context.enqueue,
    "twoFactorEnabled",
    user.email,
    { name: user.name || undefined, accountUrl: context.accountUrl },
    { locale: userLocale(user) }
  )
}

/** Tells the account owner two-step verification is now off. */
async function sendTwoFactorDisabled(context: Context, user: UserRow) {
  await enqueueMail(
    context.enqueue,
    "twoFactorDisabled",
    user.email,
    { name: user.name || undefined, accountUrl: context.accountUrl },
    { locale: userLocale(user) }
  )
}

/** Tells the account owner a new passkey can now sign them in. */
async function sendPasskeyAdded(context: Context, user: UserRow, passkeyName: string) {
  await enqueueMail(
    context.enqueue,
    "passkeyAdded",
    user.email,
    { name: user.name || undefined, passkeyName, accountUrl: context.accountUrl },
    { locale: userLocale(user) }
  )
}

/** Tells the account owner one of their own passkeys was removed (their own `delete`). An admin's
 * `removePasskeys` mails its own "passkeysRemoved" template instead — different wording, since
 * that one also ends every session. */
async function sendPasskeyRemoved(context: Context, user: UserRow, passkeyName: string) {
  await enqueueMail(
    context.enqueue,
    "passkeyRemoved",
    user.email,
    { name: user.name || undefined, passkeyName, accountUrl: context.accountUrl },
    { locale: userLocale(user) }
  )
}

export const router = api.router({
  auth: {
    // Every sign-up mails a verify link to the address given, so both caps run first: per address
    // (repeats for one victim inbox, conflict probes) and api-wide (rotating client ids).
    signUp: api.auth.signUp.handler(async ({ input, context, errors }) => {
      const perEmail = await context.signUpEmailLimiter.hit(
        `signup:email:${normalizeEmail(input.email)}`
      )
      if (!perEmail.allowed)
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "signUpRate") })
      const global = await context.signUpLimiter.hit("signup:global")
      if (!global.allowed) {
        context.noteCapTripped("signup:global")
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "signUpRate") })
      }
      if (await context.db.users.findByEmail(input.email))
        throw errors.CONFLICT({ message: apiMessage(context, "emailTaken") })
      let user: UserRow
      try {
        user = await context.db.users.create({
          email: input.email,
          passwordHash: await hashPassword(input.password),
          name: input.name,
          locale: context.requestedLocale,
        })
      } catch (error) {
        // A concurrent sign-up for the same email passed the check above too.
        if (error instanceof EmailTakenError)
          throw errors.CONFLICT({ message: apiMessage(context, "emailTaken") })
        throw error
      }
      await recordEvent(
        context,
        "signed_up",
        { userId: user.id, workspaceId: null },
        {
          method: "password",
        }
      )
      await sendVerification(context, user)
      return issueSession(context, user, input.client)
    }),

    signIn: api.auth.signIn.handler(async ({ input, context, errors }) => {
      const limit = await context.signInLimiter.hit(`signin:${input.email}`)
      if (!limit.allowed)
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "tooManyAttempts") })
      const user = await context.db.users.findByEmail(input.email)
      // Verify even when the email is unknown, so both failures take the same time.
      const ok = await verifyPassword(input.password, user?.password_hash ?? (await DUMMY_HASH))
      if (!user || !ok)
        throw errors.UNAUTHORIZED({ message: apiMessage(context, "invalidCredentials") })
      return issueSessionOrChallenge(context, user, input.client)
    }),

    me: authed.auth.me.handler(async ({ context }) => {
      const { session, user, impersonator } = context
      const now = Date.now()
      // Impersonation sessions are never touched: their hour runs out whatever happens.
      if (!impersonator && now - Date.parse(session.last_seen_at) > TOUCH_INTERVAL_MS) {
        await context.db.sessions.touch(session.id, new Date(now).toISOString())
      }
      const passkeyCount = await context.db.passkeys.countForUser(user.id)
      return {
        user: toUser(user, context.superadminEmails, context.fileUrl, passkeyCount),
        session: { id: session.id, expiresAt: session.expires_at },
        impersonation: impersonator
          ? {
              by: { id: impersonator.id, name: impersonator.name, email: impersonator.email },
              reason: session.reason ?? "",
              expiresAt: session.expires_at,
            }
          : null,
        localeChosen: isLocale(user.locale),
      }
    }),

    signOut: authed.auth.signOut.handler(async ({ context }) => {
      await context.db.sessions.delete({ id: context.session.id, userId: context.user.id })
      if (context.impersonating) {
        await audit(context, {
          action: "impersonation.stopped",
          targetType: "user",
          targetId: context.user.id,
          metadata: { via: "sign_out" },
        })
      }
    }),

    requestPasswordReset: api.auth.requestPasswordReset.handler(async ({ input, context }) => {
      // Every early return answers exactly like success: no account enumeration. Pruning moved to
      // the tokens.prune schedule, so an unknown email and a known one still take the same path.
      const limit = await context.resetLimiter.hit(`reset:${input.email}`)
      if (!limit.allowed) return
      const global = await context.resetGlobalLimiter.hit("reset:global")
      if (!global.allowed) return context.noteCapTripped("reset:global")
      const user = await context.db.users.findByEmail(input.email)
      if (!user) return
      const { link, hash } = await createResetLink(context, user.id)
      // Detached on a macrotask: enqueueing starts only after the response is written, so a known
      // email answers no slower than an unknown one beyond the awaited token write, and the two
      // branches keep equal timing.
      detach(
        async () => {
          await enqueueMail(
            context.enqueue,
            "resetPassword",
            user.email,
            { name: user.name || undefined, link },
            {
              idempotencyKey: `reset:${user.id}:${hash.slice(0, 16)}`,
              locale: selfInitiatedLocale(context, user),
            }
          )
        },
        (error) => context.recordFailure("mail enqueue failed", error)
      )
    }),

    resetPassword: api.auth.resetPassword.handler(async ({ input, context, errors }) => {
      const at = new Date().toISOString()
      const consumed = await context.db.tokens.consume(tokenHash(input.token), "password_reset", at)
      if (!consumed) throw errors.BAD_REQUEST({ message: apiMessage(context, "resetLinkInvalid") })
      if (!consumed.userId)
        throw errors.BAD_REQUEST({ message: apiMessage(context, "resetLinkInvalid") })
      const userId = consumed.userId
      const passwordHash = await hashPassword(input.password)
      await context.db.transaction(async (tx) => {
        // Any other outstanding link for this account dies with the one just used.
        await tx.tokens.invalidateForUser(userId, "password_reset", at)
        await tx.users.update(userId, { passwordHash })
        // An account whose email was never verified may have been squatted: whoever set its first
        // password could have added a passkey, which would outlive this reset (it needs no
        // password, and no two-step code). The reset link just proved the mailbox, so those go.
        const owner = await tx.users.find(userId)
        if (owner && !owner.email_verified_at) {
          await tx.passkeys.deleteAllForUser(userId)
          await tx.tokens.invalidateForUser(userId, "passkey_challenge", at)
        }
      })
      // Every session ends, and a 2FA challenge issued before the reset can never verify into one.
      await context.db.users.revokeSessions(consumed.userId, at)
      const user = await context.db.users.find(consumed.userId)
      if (user) await sendPasswordChanged(context, user)
    }),

    verifyEmail: api.auth.verifyEmail.handler(async ({ input, context, errors }) => {
      const at = new Date().toISOString()
      const consumed = await context.db.tokens.consume(tokenHash(input.token), "email_verify", at)
      if (!consumed) throw errors.BAD_REQUEST({ message: apiMessage(context, "verifyLinkInvalid") })
      if (!consumed.userId)
        throw errors.BAD_REQUEST({ message: apiMessage(context, "verifyLinkInvalid") })
      // An account can already be verified here: a magic link or a provider verified it (and
      // recorded its email_verified) while this link was still valid, or a concurrent verify won
      // the race below. `markEmailVerified`'s `UPDATE … WHERE … RETURNING` is the single atomic
      // check-and-set, so only whichever call actually flips the row records the event.
      const justVerified = await context.db.users.markEmailVerified(consumed.userId, at)
      await context.db.tokens.invalidateForUser(consumed.userId, "email_verify", at)
      if (justVerified)
        await recordEvent(
          context,
          "email_verified",
          { userId: consumed.userId, workspaceId: null },
          {}
        )
    }),

    magicLink: {
      request: api.auth.magicLink.request.handler(async ({ input, context }) => {
        // Silent like the reset request: a known and an unknown email take the same path (burn,
        // write, detached enqueue) and the response never says whether the account exists.
        // Pruning moved to the tokens.prune schedule.
        const now = Date.now()
        const at = new Date(now).toISOString()
        const limit = await context.magicLimiter.hit(`magic:${input.email}`)
        if (!limit.allowed) return
        const global = await context.magicGlobalLimiter.hit("magic:global")
        if (!global.allowed) return context.noteCapTripped("magic:global")
        const user = await context.db.users.findByEmail(input.email)
        const token = newToken()
        const hash = tokenHash(token)
        if (user) await context.db.tokens.invalidateForUser(user.id, "magic_link", at)
        await context.db.tokens.invalidateForEmail(input.email, "magic_link", at)
        await context.db.tokens.create({
          userId: user?.id ?? null,
          purpose: "magic_link",
          tokenHash: hash,
          expiresAt: new Date(now + MAGIC_TTL_MS).toISOString(),
          email: user ? null : input.email,
        })
        const link = `${context.authUrl}/magic?token=${token}`
        const to = user?.email ?? input.email
        detach(
          async () => {
            await enqueueMail(
              context.enqueue,
              "magicLink",
              to,
              { link },
              {
                idempotencyKey: `magic:${hash.slice(0, 16)}`,
                // A known account's own saved locale; an account that never chose one, or an
                // address with no account yet, gets the locale this request named — the
                // requester is almost always the recipient.
                locale: selfInitiatedLocale(context, user),
              }
            )
          },
          (error) => context.recordFailure("mail enqueue failed", error)
        )
      }),

      consume: api.auth.magicLink.consume.handler(async ({ input, context, errors }) => {
        const at = new Date().toISOString()
        const consumed = await context.db.tokens.consume(tokenHash(input.token), "magic_link", at)
        if (!consumed)
          throw errors.BAD_REQUEST({ message: apiMessage(context, "magicLinkInvalid") })
        let user = consumed.userId ? await context.db.users.find(consumed.userId) : undefined
        if (!user && consumed.email) {
          // Addressed to an email with no account when requested: it may have one by now.
          user = await context.db.users.findByEmail(consumed.email)
          if (!user) {
            try {
              user = await context.db.users.create({
                email: consumed.email,
                passwordHash: null,
                name: "",
                emailVerifiedAt: at,
                locale: context.requestedLocale,
              })
              await recordEvent(
                context,
                "signed_up",
                { userId: user.id, workspaceId: null },
                { method: "magic_link" }
              )
              // Created verified (the link proved the mailbox): no auth.verifyEmail will follow.
              await recordEvent(
                context,
                "email_verified",
                { userId: user.id, workspaceId: null },
                {}
              )
            } catch (error) {
              // A concurrent sign-up (or callback) created the account first: sign that one in.
              if (!(error instanceof EmailTakenError)) throw error
              user = await context.db.users.findByEmail(consumed.email)
            }
          }
        }
        if (!user) throw errors.BAD_REQUEST({ message: apiMessage(context, "magicLinkInvalid") })
        // The link proved who owns the email; a password set by someone who never did goes.
        if (!user.email_verified_at) await purgeUnverifiedAccount(context, user, at)
        await context.db.tokens.invalidateForUser(user.id, "magic_link", at)
        await context.db.tokens.invalidateForEmail(user.email, "magic_link", at)
        const fresh = (await context.db.users.find(user.id)) ?? user
        return issueSessionOrChallenge(context, fresh, input.client)
      }),
    },

    // An optional notification mail's unsubscribe links (Phase 13 B). Anonymous: the token alone
    // names one user and one optional type (notification-email.ts). The token is verified first
    // (one HMAC, constant time): a forged one answers at once, exactly as a good one would, and
    // spends no budget and changes nothing — so invented tokens can never drain the api-wide cap
    // that real links share. Telling a good token from a bad one already needs the key, so the
    // order adds no oracle for a token, a user or a type.
    notificationEmail: {
      unsubscribe: api.auth.notificationEmail.unsubscribe.handler(
        async ({ input, context, errors }) => {
          const named = verifyUnsubscribeToken(context.twoFactorKey, input.token)
          if (!named) return { ok: true as const }
          if (!(await notificationEmailAllowed(context)))
            throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "tooManyRequests") })
          await context.db.transaction(async (tx) => {
            // The user row is locked first (every user writer's order), so a purge either
            // commits before — and the link changes nothing — or waits for this write and then
            // deletes the row with the rest: no row is left behind for a purged account.
            if (!(await tx.users.lockForSession(named.userId))) return
            await setNotificationEmail(tx, {
              userId: named.userId,
              type: named.type,
              email: false,
              at: context.now().toISOString(),
              via: "link",
            })
          })
          return { ok: true as const }
        }
      ),
      // Read-only, for the page that names what a link turns off. Never names the user. Verified
      // first like `unsubscribe`, so a forged token answers `null` and spends no budget.
      peek: api.auth.notificationEmail.peek.handler(async ({ input, context, errors }) => {
        const named = verifyUnsubscribeToken(context.twoFactorKey, input.token)
        if (!named) return null
        if (!(await notificationEmailAllowed(context)))
          throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "tooManyRequests") })
        if (!(await context.db.users.find(named.userId))) return null
        return { type: named.type }
      }),
    },

    // The two links mailed to the old address. Anonymous like the other one-time links (the
    // service token's per-client limit applies); the token alone names the account, and no
    // address from it ever reaches the answer.
    emailChange: {
      // Whoever asked may hold a stolen session: the change dies and every session ends.
      cancel: api.auth.emailChange.cancel.handler(async ({ input, context, errors }) => {
        const at = new Date().toISOString()
        const hash = tokenHash(input.token)
        const invalid = () =>
          errors.BAD_REQUEST({ message: apiMessage(context, "emailChangeLinkInvalid") })
        const peeked = await context.db.tokens.peek(hash, "email_change_cancel", at)
        const userId = peeked?.userId
        if (!userId) throw invalid()
        const cancelled = await context.db.transaction(async (tx) => {
          // The user row first, the order every session writer takes.
          if (!(await tx.users.lockForSession(userId))) return false
          const won = await tx.tokens.consume(hash, "email_change_cancel", at)
          if (!won) return false
          // Thrown, not returned: the rollback leaves a link that names someone else unspent.
          if (won.userId !== userId) throw invalid()
          const pending = await tx.tokens.latestLive(userId, "email_change", at)
          await tx.tokens.invalidateForUser(userId, "email_change", at)
          await tx.tokens.invalidateForUser(userId, "email_change_cancel", at)
          await tx.users.revokeSessionsInTransaction(userId, at)
          await tx.audit.create({
            actorUserId: userId,
            impersonatedUserId: null,
            action: "user.email_change_cancelled",
            targetType: "user",
            targetId: String(userId),
            reason: null,
            ip: null,
            userAgent: null,
            metadata: JSON.stringify({
              to: pending?.email ? maskEmail(pending.email) : null,
              via: "email_link",
            }),
          })
          return true
        })
        if (!cancelled) throw invalid()
      }),

      // Restores the address the link holds, if no other account has it, and locks the account
      // down: whoever changed the email may know the password and may have added a passkey. It
      // also rolls back what changed since the change was requested (the link carries that time):
      // sign-in providers linked since, two-step turned on since, a deletion requested since.
      // What was there before the change stays.
      // After a second change the account has two live links — the owner's (to the first
      // address) and a later one (to the address in between, maybe an attacker's). Using one
      // voids only the links issued after it: the owner's older link always kills the later one,
      // and the later one can never kill the owner's. So two reverts end on the oldest's address.
      revert: api.auth.emailChange.revert.handler(async ({ input, context, errors }) => {
        const at = new Date().toISOString()
        const hash = tokenHash(input.token)
        const invalid = () =>
          errors.BAD_REQUEST({ message: apiMessage(context, "emailChangeLinkInvalid") })
        const peeked = await context.db.tokens.peek(hash, "email_change_revert", at)
        const userId = peeked?.userId
        if (!userId) throw invalid()
        let reverted: { passwordReset: boolean } | null
        try {
          reverted = await context.db.transaction(async (tx) => {
            if (!(await tx.users.lockForSession(userId))) return null
            const current = await tx.users.find(userId)
            if (!current) return null
            const won = await tx.tokens.consume(hash, "email_change_revert", at)
            if (!won) return null
            // Thrown, not returned: the rollback leaves a link that names someone else unspent.
            if (!won.email || won.userId !== userId || !won.requestedAt) throw invalid()
            const to = won.email
            // When the change being undone was requested: whoever asked held a fresh session from
            // then, so what was added since (before or after the confirm) is rolled back. Stamps
            // come from each process's own clock, so replicas with skewed clocks could misplace
            // something added within the skew of the request — keep them on NTP.
            const changedAt = won.requestedAt
            const displaced = await squatterOn(tx, to, userId)
            await tx.tokens.invalidateForUserAfter(userId, "email_change_revert", hash, at)
            // After the line above: the purge deletes every token addressed to `to`, this
            // link's own row among them, which `invalidateForUserAfter` orders by.
            if (displaced) await displaceSquatter(context, tx, displaced, userId, at)
            // The unique index has the last word against a sign-up racing this.
            await tx.users.changeEmail(userId, to, at)
            for (const purpose of [
              "password_reset",
              "email_verify",
              "magic_link",
              "passkey_challenge",
              "email_change",
              "email_change_cancel",
            ] as const)
              await tx.tokens.invalidateForUser(userId, purpose, at)
            // Pre-account magic links to either address would sign in as this account.
            await tx.tokens.invalidateForEmail(current.email, "magic_link", at)
            await tx.tokens.invalidateForEmail(to, "magic_link", at)
            // Every session ends (and every open two-step challenge), the stamp included.
            await tx.users.revokeSessionsInTransaction(userId, at)
            const passkeysRemoved = await tx.passkeys.deleteAllForUser(userId)
            // Providers linked since the change — by the new address's verified email, or by
            // connecting from a fresh session — would be a way straight back in.
            const identitiesRemoved = await tx.identities.deleteForUserSince(userId, changedAt)
            // Two-step turned on since the change is whoever changed it's factor; one turned on
            // before stays (switching it off would hand the old mailbox a factor-free account).
            const twoFactorDisabled =
              current.two_factor_enabled_at !== null && current.two_factor_enabled_at >= changedAt
            if (twoFactorDisabled) await tx.twoFactor.disableInTransaction(userId)
            // A deletion requested since the change (`account.delete` stores only the purge date,
            // its request time plus the grace period) is cancelled; one requested before stays.
            const deletionCancelled =
              current.deletion_scheduled_at !== null &&
              Date.parse(current.deletion_scheduled_at) - DELETION_GRACE_MS >= Date.parse(changedAt)
            if (deletionCancelled) await tx.users.cancelDeletion(userId)
            const passwordReset = current.password_hash !== null
            const locale = userLocale(current)
            if (passwordReset) {
              await tx.users.update(userId, { passwordHash: null })
              const reset = await createResetLink(context, userId, tx)
              await enqueueMail(
                context.enqueue,
                "resetPassword",
                to,
                { name: current.name || undefined, link: reset.link },
                {
                  tx,
                  idempotencyKey: `reset:${userId}:${reset.hash.slice(0, 16)}`,
                  locale,
                }
              )
            }
            await tx.billing.customers.followEmail(current.email, to)
            // ip / user agent stay null: the link's input carries no client info.
            await tx.audit.create({
              actorUserId: userId,
              impersonatedUserId: null,
              action: "user.email_change_reverted",
              targetType: "user",
              targetId: String(userId),
              reason: null,
              ip: null,
              userAgent: null,
              metadata: JSON.stringify({
                from: maskEmail(current.email),
                to: maskEmail(to),
                via: "email_link",
                passwordReset,
                passkeysRemoved,
                identitiesRemoved,
                twoFactorDisabled,
                deletionCancelled,
              }),
            })
            // In the transaction, like every mail of this flow. The restored mailbox reads in the
            // account's own saved language: the request's may be anyone's.
            await enqueueMail(
              context.enqueue,
              "emailChangeReverted",
              to,
              {
                name: current.name || undefined,
                hasPassword: passwordReset,
                passkeysRemoved,
                identitiesRemoved,
                twoFactorDisabled,
                deletionCancelled,
              },
              {
                tx,
                idempotencyKey: `email-reverted:${userId}:${hash.slice(0, 16)}`,
                locale,
              }
            )
            return { passwordReset }
          })
        } catch (error) {
          if (error instanceof EmailTakenError)
            throw errors.CONFLICT({ message: apiMessage(context, "emailChangeRevertTaken") })
          throw error
        }
        if (!reverted) throw invalid()
        return reverted
      }),
    },

    providers: api.auth.providers.handler(({ context }) => ({
      providers: [...context.providers.keys()],
    })),

    oauth: {
      start: api.auth.oauth.start.handler(async ({ input, context, errors }) => {
        const provider = context.providers.get(input.provider)
        if (!provider)
          throw errors.NOT_FOUND({ message: apiMessage(context, "providerNotConfigured") })
        // A forwarded live session means a connect: refused here when the session is past the
        // re-auth window, so the browser is not sent to the provider for nothing (the callback
        // checks again). A missing or dead token is a plain sign-in; an impersonation session is
        // refused by the callback, as before.
        const token = context.sessionToken
        const session = token ? await context.db.sessions.findByToken(tokenHash(token)) : undefined
        if (session && session.impersonated_by === null && pastReauthWindow(session.created_at))
          throw errors.FORBIDDEN(connectReauth(context))
        const state = arctic.generateState()
        const codeVerifier = provider.pkce ? arctic.generateCodeVerifier() : undefined
        return { url: provider.start(state, codeVerifier).href, state, codeVerifier }
      }),

      // Linking order: (1) a known identity wins; (2) a signed-in caller connects an unclaimed
      // identity, whatever its email; (3) a provider-verified email links to the account with that
      // email or creates a passwordless, verified one; (4) anything else is FORBIDDEN.
      callback: api.auth.oauth.callback.handler(async ({ input, context, errors }) => {
        const provider = context.providers.get(input.provider)
        if (!provider)
          throw errors.NOT_FOUND({ message: apiMessage(context, "providerNotConfigured") })
        let profile: Profile
        try {
          profile = await provider.exchange(input)
        } catch (error) {
          if (error instanceof ProviderExchangeError && error.kind === "invalid_code") {
            throw errors.BAD_REQUEST({ message: apiMessage(context, "providerSignInFailed") })
          }
          // The provider id and its OAuth error name only: never the code, verifier or tokens.
          const providerCode =
            error instanceof ProviderExchangeError && error.providerCode
              ? ` (${error.providerCode})`
              : ""
          // A ProviderExchangeError's message is provider + kind + providerCode only: safe to log,
          // and passing it as the error lands an outage at error level.
          context.log(`${input.provider} exchange failed${providerCode}`, error)
          throw errors.BAD_GATEWAY({ message: apiMessage(context, "providerUnavailable") })
        }
        const now = new Date().toISOString()
        const signedIn = await optionalSessionUser(context)
        // Connecting needs a recent sign-in, checked again here (before anything is written): the
        // session can age past the window during the provider round trip.
        if (signedIn && pastReauthWindow(signedIn.createdAt))
          throw errors.FORBIDDEN(connectReauth(context))
        const sessionUser = signedIn?.user ?? null
        let known = await context.db.identities.findByProviderUser(
          provider.id,
          profile.providerUserId
        )
        let knownUser = known ? await context.db.users.find(known.user_id) : undefined
        // An identity whose user is gone (a sign-in that linked it while `users.purge` ran) is an
        // orphan: drop it and carry on as for an unknown identity, or it would block this provider
        // account forever. Deleting by (user_id, provider) leaves a row re-linked meanwhile alone.
        if (known && !knownUser) {
          await context.db.identities.deleteForUser(known.user_id, provider.id)
          known = undefined
          knownUser = undefined
        }
        // A provider email that is not a valid address never names (or creates) an account.
        const email = profile.email === null ? undefined : EmailSchema.safeParse(profile.email).data
        let user: UserRow | undefined
        if (known) {
          if (sessionUser && sessionUser.id !== known.user_id)
            throw errors.CONFLICT({ message: apiMessage(context, "providerAlreadyConnected") })
          user = knownUser
        } else if (sessionUser) {
          // One identity per provider: a second would slip past the disconnect guard, and
          // disconnect (by provider) would then remove both.
          if (await context.db.identities.findForUserProvider(sessionUser.id, provider.id)) {
            throw errors.CONFLICT({ message: apiMessage(context, "providerAlreadyConnected") })
          }
          const winner = await linkIdentity(context.db, sessionUser.id, provider.id, profile)
          if (
            winner &&
            (winner.user_id !== sessionUser.id ||
              winner.provider_user_id !== profile.providerUserId)
          ) {
            throw errors.CONFLICT({ message: apiMessage(context, "providerAlreadyConnected") })
          }
          user = sessionUser
        } else if (profile.emailVerified && email) {
          let owner = await context.db.users.findByEmail(email)
          if (!owner) {
            try {
              owner = await context.db.users.create({
                email,
                passwordHash: null,
                name: (profile.name ?? "").slice(0, 100),
                emailVerifiedAt: now,
                locale: context.requestedLocale,
              })
              await recordEvent(
                context,
                "signed_up",
                { userId: owner.id, workspaceId: null },
                { method: provider.id }
              )
              // Created verified (the provider vouched for the email): no auth.verifyEmail follows.
              await recordEvent(
                context,
                "email_verified",
                { userId: owner.id, workspaceId: null },
                {}
              )
            } catch (error) {
              // A concurrent callback (or sign-up) created the account first: link to it.
              if (!(error instanceof EmailTakenError)) throw error
              owner = await context.db.users.findByEmail(email)
              if (!owner) throw error
            }
          }
          if (!owner.email_verified_at) await purgeUnverifiedAccount(context, owner, now)
          const winner = await linkIdentity(context.db, owner.id, provider.id, profile)
          // The account already holds another identity of this provider: one per provider.
          if (winner && winner.provider_user_id !== profile.providerUserId)
            throw errors.CONFLICT({ message: apiMessage(context, "providerAlreadyConnected") })
          user = await context.db.users.find(winner?.user_id ?? owner.id)
        } else {
          throw errors.FORBIDDEN({ message: apiMessage(context, "providerEmailUnverified") })
        }
        if (!user)
          throw errors.BAD_REQUEST({ message: apiMessage(context, "providerSignInFailed") })
        // A signed-in caller (connecting a provider, or re-confirming their own) already holds a
        // session that got past any challenge: it is answered with that same session, never a new
        // one — a fresh `created_at` would reset the re-auth window (`REAUTH_WINDOW_MS`) for a
        // stolen session. The auth app sees its own token come back and keeps its cookie.
        if (signedIn) {
          const passkeyCount = await context.db.passkeys.countForUser(user.id)
          return {
            user: toUser(user, context.superadminEmails, context.fileUrl, passkeyCount),
            session: signedIn.session,
          }
        }
        return issueSessionOrChallenge(context, user, input.client)
      }),
    },

    twoFactor: {
      // Order matters: a dead challenge answers before anything is counted; an attempt is reserved
      // from the per-user sign-in budget before the code is looked at (atomically, so a parallel
      // burst cannot all pass), and given back once the code is right — only a wrong code stays
      // counted; a wrong code also counts against the challenge.
      verify: api.auth.twoFactor.verify.handler(async ({ input, context, errors }) => {
        const at = new Date().toISOString()
        const hash = tokenHash(input.challenge)
        const pending = await context.db.tokens.peek(hash, "two_factor_challenge", at)
        if (!pending?.userId)
          throw errors.BAD_REQUEST({ message: apiMessage(context, "twoFactorTimedOut") })
        const budgetKey = verifyKey(pending.userId)
        if (!(await reserveTwoFactorAttempt(context, budgetKey)))
          throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "tooManyAttempts") })
        const user = await context.db.users.find(pending.userId)
        if (!user?.two_factor_enabled_at) {
          // Turned off (or reset by an admin) since the challenge: it can never succeed, and no
          // code was checked, so the reservation goes back.
          await refundTwoFactorAttempt(context, budgetKey)
          await context.db.tokens.consume(hash, "two_factor_challenge", at)
          throw errors.BAD_REQUEST({ message: apiMessage(context, "twoFactorTimedOut") })
        }
        // `reserved`: whether this attempt still holds its reservation (a wrong code keeps it); a
        // recovery code found spent inside the transaction was refunded already, so it re-spends.
        const wrong = async (reserved: boolean) => {
          if (!reserved) await context.twoFactorUserLimiter.hit(budgetKey)
          const attempt = await context.twoFactorChallengeLimiter.hit(`2fa:challenge:${hash}`)
          if (attempt.allowed) return errors.UNAUTHORIZED(wrongCode(context))
          await context.db.tokens.consume(hash, "two_factor_challenge", at)
          return errors.BAD_REQUEST({ message: apiMessage(context, "twoFactorTimedOut") })
        }
        const matched = await matchSecondFactor(context, user, input.code)
        if (!matched) throw await wrong(true)
        await refundTwoFactorAttempt(context, budgetKey)
        // One transaction: the challenge (single use — two right codes racing on one challenge get
        // one session), the revocation stamp (a reset since the challenge was issued wins), the
        // recovery code (spent only by the winner) and the session.
        let issued: Awaited<ReturnType<typeof issueSession>> | null
        try {
          issued = await context.db.transaction(async (tx) => {
            // The user row first, as `users.revokeSessions` does (it stamps the user, then the
            // tokens): the same lock order on Postgres, so the two never deadlock.
            const lock = await tx.users.lockForSession(user.id)
            // The user was deleted mid-verify: the challenge died with them.
            if (!lock) return null
            const won = await tx.tokens.consume(hash, "two_factor_challenge", at)
            if (!won) return null
            // Read again under the lock: a suspension committed since the challenge was issued
            // (or since `user` was read) is seen here, and one still waiting for the lock ends
            // this session when it commits. Throwing rolls the challenge back; it can only ever
            // answer this again (or time out).
            const current = await tx.users.find(user.id)
            if (!current) return null
            refuseSuspended(context, current)
            if (lock.sessionsRevokedAt && lock.sessionsRevokedAt >= won.createdAt) return null
            if (
              matched.kind === "recovery" &&
              !(await tx.twoFactor.useRecoveryCode(user.id, matched.hash, at))
            )
              throw new RecoveryCodeSpent()
            return issueSession(context, user, input.client, undefined, tx)
          })
        } catch (error) {
          // Rolled back, so the challenge is still live: the code was used, which is a wrong code.
          if (error instanceof RecoveryCodeSpent) throw await wrong(false)
          throw error
        }
        if (!issued) throw errors.BAD_REQUEST({ message: apiMessage(context, "twoFactorTimedOut") })
        return issued
      }),
    },

    // Discoverable passkeys: `options` names no user, the stored credential does. The challenge
    // id is the WebAuthn challenge itself (random, 32 bytes, base64url); only its hash is stored.
    passkey: {
      options: api.auth.passkey.options.handler(async ({ context }) => {
        const options = await authenticationOptions(context.passkeyRp)
        await storePasskeyChallenge(context, options.challenge, "authenticate", null)
        return { options, challengeId: options.challenge }
      }),

      // What `auth.signIn` does once the password checks out — `issueSession` with the caller's
      // client info, a deletion-scheduled account included (so it can cancel) — minus the
      // two-factor step: a user-verified passkey is both factors. Every refusal is the same
      // UNAUTHORIZED, so the answer never tells an unknown credential from a bad signature.
      verify: api.auth.passkey.verify.handler(async ({ input, context, errors }) => {
        const failed = () => errors.UNAUTHORIZED({ message: apiMessage(context, "passkeyFailed") })
        const limitKey = `passkey:${context.clientId ?? "unknown"}`
        if (!(await context.passkeyLimiter.hit(limitKey)).allowed)
          throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "passkeyRate") })
        const now = new Date().toISOString()
        const challengeHash = tokenHash(input.challengeId)
        // Spent before anything else is looked at: a challenge is good for exactly one attempt,
        // and the conditional UPDATE lets only one of two concurrent attempts have it.
        const challenge = await context.db.tokens.consume(challengeHash, "passkey_challenge", now)
        if (challenge?.ceremony !== "authenticate") throw failed()
        const ids = assertionIds(input.response)
        if (!ids) throw failed()
        // The credential alone names the user; a user handle (always present for a discoverable
        // credential) must name that same user.
        const row = await context.db.passkeys.findByCredentialId(ids.credentialId)
        if (!row || ids.userHandle !== userHandleFor(row.user_id)) throw failed()
        const verified = await verifyAuthentication(
          context.passkeyRp,
          input.response,
          challengeHash,
          row
        )
        if (!verified) throw failed()
        // Only now, with a genuine signature, does a counter that failed to move mean something:
        // a cloned authenticator. Recorded, refused, and the stored counter left as it was.
        if (!counterAdvances(row.counter, verified.newCounter)) {
          context.recordFailure(
            "passkey counter did not increase",
            new Error(
              `passkey ${row.id} (user ${row.user_id}): counter ${verified.newCounter} after ${row.counter}`
            )
          )
          throw failed()
        }
        // Recording the use and issuing the session share one transaction that locks the user row
        // first — the order `admin.users.removePasskeys` (and every other session writer) takes —
        // so a concurrent removal either commits first, and `recordUse` (which matches the row by
        // id) finds the passkey gone, or waits for this commit and then deletes the session it
        // made. Either way no session outlives the removal: SQLite gets this from its single
        // writer, Postgres from the row lock, and the `recordUse` UPDATE re-reads the committed
        // row once the lock is granted.
        const issued = await context.db.transaction(async (tx) => {
          if (!(await tx.users.lockForSession(row.user_id))) return null
          if (!(await tx.passkeys.recordUse(row.id, row.counter, verified.newCounter, now)))
            return null
          const user = await tx.users.find(row.user_id)
          if (!user) return null
          // A genuine signature for a suspended account: refused, and the use rolled back.
          refuseSuspended(context, user)
          return issueSession(context, user, input.client, undefined, tx)
        })
        if (!issued) throw failed()
        await context.passkeyLimiter.refund(limitKey)
        return issued
      }),
    },
  },

  account: {
    resendVerification: authed.account.resendVerification.handler(async ({ context, errors }) => {
      refuseWhileImpersonating(context)
      if (context.user.email_verified_at) return { sent: false }
      const limit = await context.verifyLimiter.hit(`verify:${context.user.id}`)
      if (!limit.allowed)
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "tooManyRequests") })
      await sendVerification(context, context.user)
      return { sent: true }
    }),

    email: {
      get: authed.account.email.get.handler(async ({ context }) => {
        const pending = await context.db.tokens.latestLive(
          context.user.id,
          "email_change",
          new Date().toISOString()
        )
        return {
          email: context.user.email,
          pending: pending?.email
            ? { maskedEmail: maskEmail(pending.email), expiresAt: pending.expiresAt }
            : null,
        }
      }),

      // Re-authentication as for a new credential (password, else a fresh session) plus, with
      // two-step on, a current code against `disable`'s budget. An address another account holds
      // takes the same path and leaves the same state — the pending change replaced, both tokens
      // stored (so `get` shows it pending), the notice mailed to the current address — with one
      // difference: no confirm link goes to the taken address. No account-existence oracle: the
      // stored change just expires, and `confirmChange` would refuse it (CONFLICT) anyway.
      requestChange: authed.account.email.requestChange.handler(
        async ({ input, context, errors }) => {
          refuseWhileImpersonating(context)
          const { user } = context
          await requireFreshCredential(context, errors, input.password, "emailChangeReauth")
          if (user.two_factor_enabled_at) {
            const wrong = () =>
              errors.UNAUTHORIZED({
                message: apiMessage(context, "twoFactorWrongCode"),
                data: { reason: EMAIL_CHANGE_CODE_REASON },
              })
            // A missing code checks nothing, so it costs nothing from the budget.
            if (!input.code) throw wrong()
            if (!(await reserveTwoFactorAttempt(context, manageKey(user.id))))
              throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "tooManyAttempts") })
            if (!(await checkSecondFactor(context, user, input.code, new Date().toISOString())))
              throw wrong()
            await refundTwoFactorAttempt(context, manageKey(user.id))
          }
          const newEmail = normalizeEmail(input.newEmail)
          if (newEmail === user.email)
            throw errors.BAD_REQUEST({ message: apiMessage(context, "emailChangeSameEmail") })
          const limit = await context.emailChangeLimiter.hit(`email-change:${user.id}`)
          if (!limit.allowed)
            throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "emailChangeRate") })
          const now = Date.now()
          const at = new Date(now).toISOString()
          const expiresAt = new Date(now + EMAIL_CHANGE_TTL_MS).toISOString()
          const confirmToken = newToken()
          const cancelToken = newToken()
          const confirmHash = tokenHash(confirmToken)
          const cancelHash = tokenHash(cancelToken)
          const holder = await context.db.users.findByEmail(newEmail)
          const locked = await context.db.transaction(async (tx) => {
            // Deleted since the session was read: refused like any request without a user.
            if (!(await tx.users.lockForSession(user.id))) return false
            const current = await tx.users.find(user.id)
            if (!current) return false
            // A new request replaces the pending one.
            await tx.tokens.invalidateForUser(user.id, "email_change", at)
            await tx.tokens.invalidateForUser(user.id, "email_change_cancel", at)
            await tx.tokens.create({
              userId: user.id,
              purpose: "email_change",
              tokenHash: confirmHash,
              expiresAt,
              email: newEmail,
            })
            await tx.tokens.create({
              userId: user.id,
              purpose: "email_change_cancel",
              tokenHash: cancelHash,
              expiresAt,
            })
            // Both mails join the transaction: a failed job insert rolls the request back, so a
            // confirm link is never out without the current mailbox being warned. The notice
            // first; it goes to a mailbox the caller may not control (a stolen session), so it
            // reads in the account's own saved language, never the request's.
            await enqueueMail(
              context.enqueue,
              "emailChangeRequested",
              current.email,
              {
                name: current.name || undefined,
                maskedEmail: maskEmail(newEmail),
                link: `${context.authUrl}/email/cancel?token=${cancelToken}`,
              },
              {
                tx,
                idempotencyKey: `email-change-cancel:${user.id}:${cancelHash.slice(0, 16)}`,
                locale: userLocale(current),
              }
            )
            // The only difference for a taken address: its owner is never mailed.
            if (!holder)
              await enqueueMail(
                context.enqueue,
                "emailChangeConfirm",
                newEmail,
                {
                  name: current.name || undefined,
                  link: `${context.accountUrl}/email/confirm?token=${confirmToken}`,
                },
                {
                  tx,
                  idempotencyKey: `email-change:${user.id}:${confirmHash.slice(0, 16)}`,
                  locale: selfInitiatedLocale(context, current),
                }
              )
            return true
          })
          if (!locked) throw errors.UNAUTHORIZED({ message: apiMessage(context, "signInRequired") })
          return { pending: { maskedEmail: maskEmail(newEmail), expiresAt } }
        }
      ),

      // Only the account the link names may use it: another signed-in account is refused without
      // spending the token. One transaction, the user row locked first: the token, the address
      // re-check (the unique index has the last word, so two accounts racing to one address get
      // one winner), the new verified address, the voided links, every other session, the revert
      // link, the audit row and the revert mail's job commit together or not at all.
      confirmChange: authed.account.email.confirmChange.handler(
        async ({ input, context, errors }) => {
          refuseWhileImpersonating(context)
          const { user } = context
          const at = new Date().toISOString()
          const hash = tokenHash(input.token)
          const invalid = () =>
            errors.BAD_REQUEST({ message: apiMessage(context, "emailChangeLinkInvalid") })
          const pending = await context.db.tokens.peek(hash, "email_change", at)
          if (!pending) throw invalid()
          if (pending.userId !== user.id)
            throw errors.BAD_REQUEST({ message: apiMessage(context, "emailChangeWrongAccount") })
          const revertToken = newToken()
          const revertHash = tokenHash(revertToken)
          let changed: { to: string } | null
          try {
            changed = await context.db.transaction(async (tx) => {
              if (!(await tx.users.lockForSession(user.id))) return null
              const current = await tx.users.find(user.id)
              const won = await tx.tokens.consume(hash, "email_change", at)
              if (!current || !won?.email || won.userId !== user.id) return null
              const to = won.email
              const holder = await tx.users.findByEmail(to)
              // Thrown, not returned: the rollback leaves the token as it was.
              if (holder && holder.id !== user.id) throw new EmailTakenError()
              await tx.users.changeEmail(user.id, to, at)
              if (!current.email_verified_at)
                await recordEvent(
                  context,
                  "email_verified",
                  { userId: user.id, workspaceId: null },
                  {},
                  { tx }
                )
              for (const purpose of [
                "password_reset",
                "email_verify",
                "magic_link",
                "email_change",
                "email_change_cancel",
              ] as const)
                await tx.tokens.invalidateForUser(user.id, purpose, at)
              // Pre-account magic links to either address would sign in as this account.
              await tx.tokens.invalidateForEmail(current.email, "magic_link", at)
              await tx.tokens.invalidateForEmail(to, "magic_link", at)
              await tx.users.revokeSessionsInTransaction(user.id, at, {
                except: context.session.id,
              })
              await tx.tokens.create({
                userId: user.id,
                purpose: "email_change_revert",
                tokenHash: revertHash,
                // The revert rolls back from here: anything added between request and confirm
                // (a provider, two-step) came from whoever asked, too.
                requestedAt: won.createdAt,
                expiresAt: new Date(Date.parse(at) + EMAIL_CHANGE_REVERT_TTL_MS).toISOString(),
                email: current.email,
              })
              // The provider keeps its own copy; only the mirror follows (as the purge does).
              await tx.billing.customers.followEmail(current.email, to)
              // ip / user agent stay null: confirmChange's input carries no client info.
              await tx.audit.create({
                actorUserId: user.id,
                impersonatedUserId: null,
                action: "user.email_changed",
                targetType: "user",
                targetId: String(user.id),
                reason: null,
                ip: null,
                userAgent: null,
                metadata: JSON.stringify({ from: maskEmail(current.email), to: maskEmail(to) }),
              })
              // In the transaction: a revert link nobody was ever sent must not commit. The old
              // mailbox may not be where the caller acts from (a takeover), so the account's own
              // saved language, never the request's.
              await enqueueMail(
                context.enqueue,
                "emailChanged",
                current.email,
                {
                  name: current.name || undefined,
                  maskedEmail: maskEmail(to),
                  link: `${context.authUrl}/email/revert?token=${revertToken}`,
                },
                {
                  tx,
                  idempotencyKey: `email-revert:${user.id}:${revertHash.slice(0, 16)}`,
                  locale: userLocale(current),
                }
              )
              return { to }
            })
          } catch (error) {
            if (error instanceof EmailTakenError)
              throw errors.CONFLICT({ message: apiMessage(context, "emailChangeTaken") })
            throw error
          }
          if (!changed) throw invalid()
          return { email: changed.to }
        }
      ),
    },

    updateProfile: authed.account.updateProfile.handler(async ({ input, context }) => {
      await context.db.users.update(context.user.id, { name: input.name })
      await auditWhileImpersonating(context, {
        action: "profile.updated",
        targetType: "user",
        targetId: context.user.id,
        metadata: { name: input.name },
      })
      const passkeyCount = await context.db.passkeys.countForUser(context.user.id)
      return toUser(
        { ...context.user, name: input.name },
        context.superadminEmails,
        context.fileUrl,
        passkeyCount
      )
    }),

    // A profile write like the name: allowed while impersonating, audited only then.
    setLocale: authed.account.setLocale.handler(async ({ input, context }) => {
      await context.db.users.setLocale(context.user.id, input.locale)
      await auditWhileImpersonating(context, {
        action: "user.locale_set",
        targetType: "user",
        targetId: context.user.id,
        metadata: { locale: input.locale },
      })
      return { locale: input.locale }
    }),

    // Which notifications are also emailed (Phase 13 B): optional types only (the input schema
    // refuses a locked type, or any other string); refused while impersonating; a no-op writes
    // nothing and audits nothing.
    notificationPreferences: {
      get: authed.account.notificationPreferences.get.handler(({ context }) =>
        notificationPreferencesFor(context.db, context.user.id)
      ),
      set: authed.account.notificationPreferences.set.handler(async ({ input, context }) => {
        refuseWhileImpersonating(context)
        await context.db.transaction((tx) =>
          setNotificationEmail(tx, {
            userId: context.user.id,
            type: input.type,
            email: input.email,
            at: context.now().toISOString(),
            via: "settings",
          })
        )
        return notificationPreferencesFor(context.db, context.user.id)
      }),
    },

    changePassword: authed.account.changePassword.handler(async ({ input, context, errors }) => {
      refuseWhileImpersonating(context)
      // A passwordless account verifies against the dummy hash, which never matches.
      const hash = context.user.password_hash ?? (await DUMMY_HASH)
      if (!(await verifyPassword(input.currentPassword, hash))) {
        throw errors.FORBIDDEN({ message: apiMessage(context, "currentPasswordIncorrect") })
      }
      await context.db.users.update(context.user.id, {
        passwordHash: await hashPassword(input.newPassword),
      })
      const at = new Date().toISOString()
      await context.db.tokens.invalidateForUser(context.user.id, "password_reset", at)
      // A challenge won with the old password must not turn into a session after the change.
      await context.db.users.revokeSessions(context.user.id, at, { except: context.session.id })
      await sendPasswordChanged(context, context.user)
    }),

    setPassword: authed.account.setPassword.handler(async ({ input, context, errors }) => {
      refuseWhileImpersonating(context)
      if (context.user.password_hash)
        throw errors.CONFLICT({ message: apiMessage(context, "passwordAlreadySet") })
      // Nothing to re-verify a passwordless account with, so a recent sign-in stands in for it,
      // as on `account.twoFactor.setup`: otherwise an old, stolen session could set a password and
      // then pass setup's password check with it.
      if (pastReauthWindow(context.session.created_at))
        throw errors.FORBIDDEN({
          message: apiMessage(context, "setPasswordReauth"),
          data: { reason: TWO_FACTOR_REAUTH_REASON },
        })
      await context.db.users.update(context.user.id, {
        passwordHash: await hashPassword(input.password),
      })
      const at = new Date().toISOString()
      await context.db.tokens.invalidateForUser(context.user.id, "password_reset", at)
      await context.db.tokens.invalidateForUser(context.user.id, "two_factor_challenge", at)
      // Ends no session, but a challenge from before the change must never verify.
      await context.db.users.stampSessionsRevoked(context.user.id, at)
      const user = await context.db.users.find(context.user.id)
      if (user) await sendPasswordChanged(context, user)
    }),

    // Allowed while impersonating (unlike the security mutations above): an ordinary write, like
    // updateProfile — audited only when impersonating.
    avatar: {
      set: authed.account.avatar.set.handler(async ({ input, context, errors }) => {
        const limit = await context.uploadLimiter.hit(`upload:${context.user.id}`)
        if (!limit.allowed)
          throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "uploadRate") })
        const key = await replaceImage(
          context,
          input.file,
          (ext) => newFileKey("avatars", context.user.id, ext),
          (k) => context.db.users.setAvatarKey(context.user.id, k)
        )
        await auditWhileImpersonating(context, {
          action: "user.avatar_set",
          targetType: "user",
          targetId: context.user.id,
        })
        return { avatarUrl: context.fileUrl(key) }
      }),
      remove: authed.account.avatar.remove.handler(async ({ context }) => {
        const previous = await context.db.users.setAvatarKey(context.user.id, null)
        if (previous) {
          await enqueueStorageDelete(context.enqueue, previous).catch((error) =>
            context.recordFailure("storage.delete enqueue failed", error)
          )
          await auditWhileImpersonating(context, {
            action: "user.avatar_removed",
            targetType: "user",
            targetId: context.user.id,
          })
        }
        return { ok: true as const }
      }),
    },

    identities: {
      list: authed.account.identities.list.handler(async ({ context }) => ({
        items: (await context.db.identities.listForUser(context.user.id)).map((row) => ({
          provider: row.provider,
          email: row.email,
          createdAt: row.created_at,
        })),
      })),

      disconnect: authed.account.identities.disconnect.handler(
        async ({ input, context, errors }) => {
          refuseWhileImpersonating(context)
          const { user } = context
          // A passwordless account keeps at least one way in: another provider or a passkey.
          // Decided under the user row's lock, the same lock `account.passkeys.delete` takes for
          // its own last-way-in rule (user row first, then identities and passkeys), so removing
          // the last provider and the last passkey at once cannot both pass.
          const outcome = await context.db.transaction(async (tx) => {
            await tx.users.lockForSession(user.id)
            if (
              !user.password_hash &&
              (await tx.identities.countForUser(user.id)) <= 1 &&
              (await tx.passkeys.countForUser(user.id)) === 0
            )
              return "last" as const
            return (await tx.identities.deleteForUser(user.id, input.provider))
              ? ("deleted" as const)
              : ("missing" as const)
          })
          if (outcome === "last")
            throw errors.FORBIDDEN({ message: apiMessage(context, "lastSignInMethod") })
          if (outcome === "missing")
            throw errors.NOT_FOUND({ message: apiMessage(context, "providerNotConnected") })
        }
      ),
    },

    sessions: {
      list: authed.account.sessions.list.handler(async ({ context }) => ({
        items: (
          await context.db.sessions.listForUser(context.user.id, new Date().toISOString())
        ).map((row) => toSummary(row, context.session.id)),
      })),

      revoke: authed.account.sessions.revoke.handler(async ({ input, context, errors }) => {
        refuseWhileImpersonating(context)
        const deleted = await context.db.sessions.delete({ id: input.id, userId: context.user.id })
        if (!deleted) throw errors.NOT_FOUND({ message: apiMessage(context, "sessionNotFound") })
      }),

      revokeOthers: authed.account.sessions.revokeOthers.handler(async ({ context }) => {
        refuseWhileImpersonating(context)
        // "Sign out everywhere else" also covers a sign-in halfway through its second step.
        await context.db.users.revokeSessions(context.user.id, new Date().toISOString(), {
          except: context.session.id,
        })
      }),
    },

    twoFactor: {
      get: authed.account.twoFactor.get.handler(async ({ context }) => ({
        enabled: context.user.two_factor_enabled_at !== null,
        recoveryCodesLeft: await context.db.twoFactor.recoveryCodesLeft(context.user.id),
      })),

      // An abandoned or repeated setup just replaces the pending secret: `setPendingSecret`
      // always resets `enabled_at` and `last_step`, so nothing is half-protected either way.
      // Re-checks who is asking before minting a secret: the current password on an account that
      // has one, else a session younger than REAUTH_WINDOW_MS (a passwordless account has nothing
      // to re-verify with).
      setup: authed.account.twoFactor.setup.handler(async ({ input, context, errors }) => {
        refuseWhileImpersonating(context)
        // An unverified account's 2FA would not survive `purgeUnverifiedAccount` (whoever proves
        // the mailbox takes the account over), so it is not offered until the email is verified.
        if (!context.user.email_verified_at)
          throw errors.FORBIDDEN({ message: apiMessage(context, "twoFactorVerifyEmail") })
        if (context.user.two_factor_enabled_at)
          throw errors.CONFLICT({ message: apiMessage(context, "twoFactorAlreadyOn") })
        await requireFreshCredential(context, errors, input.currentPassword, "twoFactorReauth")
        const secret = generateTotpSecret()
        await context.db.twoFactor.setPendingSecret(
          context.user.id,
          await encryptSecret(secret, context.twoFactorKey)
        )
        return {
          secret: encodeSecret(secret),
          otpauthUrl: otpauthUrl(secret, context.user.email, BRAND_NAME),
        }
      }),

      // State checks first (they refuse for free, no code involved); the per-user management
      // budget — separate from `auth.twoFactor.verify`'s sign-in one — is reserved before the
      // code check and given back on a right code, so only a wrong one stays counted and a stolen
      // session cannot grind through codes here any more than it could at a sign-in challenge,
      // without also burning sign-in's budget. Only a TOTP code confirms setup: a recovery code is
      // minted by this very call and must not be able to satisfy it.
      enable: authed.account.twoFactor.enable.handler(async ({ input, context, errors }) => {
        refuseWhileImpersonating(context)
        if (!context.user.email_verified_at)
          throw errors.FORBIDDEN({ message: apiMessage(context, "twoFactorVerifyEmail") })
        if (context.user.two_factor_enabled_at)
          throw errors.CONFLICT({ message: apiMessage(context, "twoFactorAlreadyOn") })
        const secret = context.user.two_factor_secret
        if (!secret)
          throw errors.BAD_REQUEST({ message: apiMessage(context, "twoFactorStartSetup") })
        if (!(await reserveTwoFactorAttempt(context, manageKey(context.user.id))))
          throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "tooManyAttempts") })
        if (!(await checkTotpCode(context, context.user, input.code)))
          throw errors.UNAUTHORIZED(wrongCode(context))
        await refundTwoFactorAttempt(context, manageKey(context.user.id))
        const codes = generateRecoveryCodes()
        // Conditioned on the secret just checked: a concurrent `setup` that replaced it in
        // between loses this race and the caller gets a conflict, not a 2FA account protected by
        // a secret it never confirmed.
        // Stamped once the user row is locked (null), not when the request arrived: an email
        // change requested meanwhile must see this factor as added after it (its undo's cutoff).
        const enabled = await context.db.twoFactor.enable(
          context.user.id,
          secret,
          null,
          codes.map((code) => tokenHash(code))
        )
        if (!enabled) throw errors.CONFLICT({ message: apiMessage(context, "twoFactorAlreadyOn") })
        await recordEvent(
          context,
          "two_factor_enabled",
          { userId: context.user.id, workspaceId: null },
          {}
        )
        const fresh = (await context.db.users.find(context.user.id)) ?? context.user
        await sendTwoFactorEnabled(context, fresh)
        return { recoveryCodes: codes }
      }),

      disable: authed.account.twoFactor.disable.handler(async ({ input, context, errors }) => {
        refuseWhileImpersonating(context)
        if (!context.user.two_factor_enabled_at)
          throw errors.CONFLICT({ message: apiMessage(context, "twoFactorNotOn") })
        if (!(await reserveTwoFactorAttempt(context, manageKey(context.user.id))))
          throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "tooManyAttempts") })
        const at = new Date().toISOString()
        if (!(await checkSecondFactor(context, context.user, input.code, at)))
          throw errors.UNAUTHORIZED(wrongCode(context))
        await refundTwoFactorAttempt(context, manageKey(context.user.id))
        await context.db.twoFactor.disable(context.user.id)
        // A challenge from before disabling must not verify into a session after it.
        await context.db.tokens.invalidateForUser(context.user.id, "two_factor_challenge", at)
        await sendTwoFactorDisabled(context, context.user)
      }),

      regenerateRecoveryCodes: authed.account.twoFactor.regenerateRecoveryCodes.handler(
        async ({ input, context, errors }) => {
          refuseWhileImpersonating(context)
          if (!context.user.two_factor_enabled_at)
            throw errors.CONFLICT({ message: apiMessage(context, "twoFactorNotOn") })
          if (!(await reserveTwoFactorAttempt(context, manageKey(context.user.id))))
            throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "tooManyAttempts") })
          const at = new Date().toISOString()
          if (!(await checkSecondFactor(context, context.user, input.code, at)))
            throw errors.UNAUTHORIZED(wrongCode(context))
          await refundTwoFactorAttempt(context, manageKey(context.user.id))
          const codes = generateRecoveryCodes()
          await context.db.twoFactor.replaceRecoveryCodes(
            context.user.id,
            codes.map((code) => tokenHash(code))
          )
          return { recoveryCodes: codes }
        }
      ),
    },

    passkeys: {
      list: authed.account.passkeys.list.handler(async ({ context }) =>
        (await context.db.passkeys.listForUser(context.user.id)).map(toPasskey)
      ),

      // The same re-check as two-step setup, sharing its per-user password budget: the current
      // password on an account that has one, else a session younger than REAUTH_WINDOW_MS.
      registerOptions: authed.account.passkeys.registerOptions.handler(
        async ({ input, context, errors }) => {
          refuseWhileImpersonating(context)
          const { user } = context
          // Refused before the password is checked, so a full account spends no attempt on it;
          // `register` decides again, race-safe, under the user row's lock.
          if ((await context.db.passkeys.countForUser(user.id)) >= MAX_PASSKEYS)
            throw errors.CONFLICT({ message: apiMessage(context, "passkeyLimit") })
          await requireFreshCredential(context, errors, input.password, "passkeyReauth")
          const existing = await context.db.passkeys.listForUser(user.id)
          const options = await registrationOptions(context.passkeyRp, user, existing)
          await storePasskeyChallenge(context, options.challenge, "register", user.id)
          return { options, challengeId: options.challenge }
        }
      ),

      // The challenge must be a `register` one minted for this very user; it is spent whether or
      // not the response then verifies.
      register: authed.account.passkeys.register.handler(async ({ input, context, errors }) => {
        refuseWhileImpersonating(context)
        const failed = () =>
          errors.BAD_REQUEST({ message: apiMessage(context, "passkeyRegisterFailed") })
        const challengeHash = tokenHash(input.challengeId)
        const challenge = await context.db.tokens.consume(
          challengeHash,
          "passkey_challenge",
          new Date().toISOString()
        )
        if (challenge?.ceremony !== "register" || challenge.userId !== context.user.id)
          throw failed()
        const verified = await verifyRegistration(context.passkeyRp, input.response, challengeHash)
        if (!verified) throw failed()
        let row: PasskeyRow | null
        try {
          // The cap is counted inside the inserting transaction, after locking the user row (the
          // order `account.passkeys.delete` and every session writer use): two concurrent
          // registers at MAX_PASSKEYS - 1 serialise on the lock, and the second counts the
          // first's row. SQLite's single writer serialises them the same way.
          row = await context.db.transaction(async (tx) => {
            await tx.users.lockForSession(context.user.id)
            if ((await tx.passkeys.countForUser(context.user.id)) >= MAX_PASSKEYS) return null
            return tx.passkeys.create({
              userId: context.user.id,
              credentialId: verified.credentialId,
              publicKey: verified.publicKey,
              counter: verified.counter,
              transports: verified.transports ? JSON.stringify(verified.transports) : null,
              name: input.name ?? defaultPasskeyName(context, verified.transports),
            })
          })
        } catch (error) {
          // Already registered (to this account or another): never a second owner.
          if (isCredentialTaken(error)) throw failed()
          throw error
        }
        if (!row) throw errors.CONFLICT({ message: apiMessage(context, "passkeyLimit") })
        await sendPasskeyAdded(context, context.user, row.name)
        return toPasskey(row)
      }),

      rename: authed.account.passkeys.rename.handler(async ({ input, context, errors }) => {
        refuseWhileImpersonating(context)
        if (!(await context.db.passkeys.rename(input.id, context.user.id, input.name)))
          throw errors.NOT_FOUND({ message: apiMessage(context, "passkeyNotFound") })
      }),

      // The last way in: a passwordless, provider-less account keeps at least one passkey, the
      // same rule `account.identities.disconnect` applies for its own last identity. Decided
      // inside a transaction that locks the user row first (the order every other such writer
      // uses), so two concurrent deletes of the account's last two passkeys cannot both pass —
      // the second sees the first's result rather than racing it on a stale count.
      delete: authed.account.passkeys.delete.handler(async ({ input, context, errors }) => {
        refuseWhileImpersonating(context)
        const outcome = await context.db.transaction(async (tx) => {
          await tx.users.lockForSession(context.user.id)
          const existing = await tx.passkeys.listForUser(context.user.id)
          const target = existing.find((row) => row.id === input.id)
          if (!target) return { kind: "not-found" as const }
          const lastWayIn =
            existing.length === 1 &&
            !context.user.password_hash &&
            (await tx.identities.countForUser(context.user.id)) === 0
          if (lastWayIn) return { kind: "conflict" as const }
          await tx.passkeys.delete(input.id, context.user.id)
          return { kind: "deleted" as const, name: target.name }
        })
        if (outcome.kind === "conflict")
          throw errors.CONFLICT({ message: apiMessage(context, "passkeyLastWayIn") })
        if (outcome.kind === "not-found")
          throw errors.NOT_FOUND({ message: apiMessage(context, "passkeyNotFound") })
        await sendPasskeyRemoved(context, context.user, outcome.name)
      }),
    },

    // The account's data as one JSON file. Refused while impersonating: an admin neither asks for
    // nor downloads a user's export.
    export: {
      // One request per EXPORT_REQUEST_INTERVAL_MS, whatever became of the last one. The user row's
      // lock serialises two concurrent requests, so the check and the insert cannot interleave.
      request: authed.account.export.request.handler(async ({ context, errors }) => {
        refuseWhileImpersonating(context)
        const now = Date.now()
        const at = new Date(now).toISOString()
        const result = await context.db.transaction(async (tx) => {
          await tx.users.lockForSession(context.user.id)
          const last = await tx.exports.lastRequestedAt(context.user.id)
          if (last && now - Date.parse(last) < EXPORT_REQUEST_INTERVAL_MS) {
            return {
              retryAt: new Date(Date.parse(last) + EXPORT_REQUEST_INTERVAL_MS).toISOString(),
            }
          }
          const created = await tx.exports.create(context.user.id, at)
          await context.enqueue(privacyExportJob, { exportId: created.id }, { tx })
          return { id: created.id }
        })
        if (result.retryAt !== undefined) {
          const time = `${formatUtcDate(result.retryAt, context.locale, { time: true })} UTC`
          throw errors.CONFLICT({
            message: apiMessage(context, "exportTooSoon", { time }),
            data: { retryAt: result.retryAt },
          })
        }
        return { id: Number(result.id), status: "pending" as const }
      }),

      get: authed.account.export.get.handler(async ({ context }) => {
        const row = await context.db.exports.latest(context.user.id)
        if (!row) return null
        // Still pending a day after the request: its job died. Reported as expired at once (the
        // nightly prune writes it), so the page offers a new request rather than waiting forever.
        const stale =
          row.status === "pending" &&
          Date.now() - Date.parse(row.created_at) >= EXPORT_REQUEST_INTERVAL_MS
        return {
          id: Number(row.id),
          status: stale ? ("expired" as const) : row.status,
          readyAt: row.ready_at,
          expiresAt: row.expires_at,
        }
      }),

      // NOT_FOUND alike for another user's id, an unknown one, a pending or expired export and
      // one whose expiry passed before the nightly prune got to it.
      download: authed.account.export.download.handler(async ({ input, context, errors }) => {
        refuseWhileImpersonating(context)
        const notFound = () => errors.NOT_FOUND({ message: apiMessage(context, "exportNotFound") })
        const row = await context.db.exports.find(input.id)
        if (
          !row ||
          Number(row.user_id) !== context.user.id ||
          row.status !== "ready" ||
          !row.storage_key ||
          !row.expires_at ||
          Date.parse(row.expires_at) <= Date.now()
        )
          throw notFound()
        const object = await context.storage.get(row.storage_key)
        if (!object) throw notFound()
        const day = (row.ready_at ?? row.created_at).slice(0, 10)
        return new File([object.body], `${slugify(BRAND_NAME)}-data-${day}.json`, {
          type: "application/json",
        })
      }),
    },

    // Schedules the purge DELETION_GRACE_MS from now (the `privacy.purge` job runs it), then ends
    // every session, the current one included, so the browser is signed out; signing in again
    // during the grace period is allowed, and `cancelDeletion` stops it. A second call while
    // scheduled is a no-op that returns the first date (no mail, no sign-out).
    delete: authed.account.delete.handler(async ({ input, context, errors }) => {
      refuseWhileImpersonating(context)
      if (normalizeEmail(input.email) !== normalizeEmail(context.user.email))
        throw errors.BAD_REQUEST({ message: apiMessage(context, "deleteEmailMismatch") })
      if (pastReauthWindow(context.session.created_at))
        throw errors.FORBIDDEN({
          message: apiMessage(context, "deleteReauth"),
          data: { reason: TWO_FACTOR_REAUTH_REASON },
        })
      // The purge re-checks this inside its own transaction (an invitation accepted meanwhile).
      const soleOwned = await context.db.workspaces.soleOwnedShared(context.user.id)
      if (soleOwned.length > 0) {
        const names = soleOwned.map((workspace) => workspace.name)
        throw errors.CONFLICT({
          message: apiMessage(context, "deleteSoleOwner", { names: names.join(", ") }),
          data: { names },
        })
      }
      const now = Date.now()
      const at = new Date(now + DELETION_GRACE_MS).toISOString()
      const scheduledAt = await context.db.users.scheduleDeletion(context.user.id, at)
      if (scheduledAt !== at) return { deletionScheduledAt: scheduledAt }
      // Every session and open two-step challenge: a stolen session must not outlive the request.
      await context.db.users.revokeSessions(context.user.id, new Date(now).toISOString())
      await enqueueMail(
        context.enqueue,
        "accountDeletionScheduled",
        context.user.email,
        {
          name: context.user.name || undefined,
          date: scheduledAt,
          link: `${context.authUrl}/login`,
        },
        { locale: userLocale(context.user) }
      )
      return { deletionScheduledAt: scheduledAt }
    }),

    // Any live session of the user may cancel (not an impersonator); a no-op when none is scheduled.
    cancelDeletion: authed.account.cancelDeletion.handler(async ({ context }) => {
      refuseWhileImpersonating(context)
      await context.db.users.cancelDeletion(context.user.id)
      return {}
    }),
  },

  // The caller's own rows only (every query is by `context.user.id`). Reads stay open while
  // impersonating; marking read does not, so support never clears a user's badge.
  notifications: {
    list: authed.notifications.list.handler(({ input, context }) =>
      listNotifications(
        context.db,
        {
          userId: context.user.id,
          cursor: input.cursor,
          limit: input.limit,
          unreadOnly: input.unreadOnly,
        },
        context.recordFailure
      )
    ),
    unreadCount: authed.notifications.unreadCount.handler(async ({ context }) => ({
      count: await context.db.notifications.unreadCount(
        context.user.id,
        NOTIFICATION_UNREAD_CAP + 1
      ),
    })),
    markRead: authed.notifications.markRead.handler(async ({ input, context }) => {
      refuseWhileImpersonating(context)
      const at = context.now().toISOString()
      if ("all" in input) await context.db.notifications.markAllRead(context.user.id, at)
      else await context.db.notifications.markRead(context.user.id, input.ids, at)
    }),
  },

  notes: {
    list: authed.notes.list
      .use(member("viewer"), (input) => input)
      .handler(({ input, context }) =>
        context.db.notes.list({
          workspaceId: context.workspace.id,
          cursor: input.cursor,
          limit: input.limit ?? DEFAULT_PAGE_SIZE,
        })
      ),

    find: authed.notes.find
      .use(member("viewer"), (input) => input)
      .handler(async ({ input, context, errors }) => {
        const note = await context.db.notes.find({
          workspaceId: context.workspace.id,
          id: input.id,
        })
        if (!note) throw errors.NOT_FOUND({ message: apiMessage(context, "noteNotFound") })
        return note
      }),

    create: authed.notes.create
      .use(member("member"), (input) => input)
      .handler(async ({ input, context }) => {
        const workspaceId = context.workspace.id
        // The note and its webhook deliveries commit together, or neither does.
        const note = await context.db.transaction(async (tx) => {
          const created = await tx.notes.create({
            workspaceId,
            userId: context.user.id,
            title: input.title,
            body: input.body,
          })
          await emitWebhookEvent(
            context,
            workspaceId,
            "note.created",
            () => noteData(tx, { workspaceId, id: created.id }),
            { tx }
          )
          return created
        })
        await recordEvent(
          context,
          "note_created",
          { userId: context.user.id, workspaceId: context.workspace.id },
          {}
        )
        await auditWhileImpersonating(context, {
          action: "note.created",
          targetType: "note",
          targetId: note.id,
          metadata: { workspaceId: context.workspace.id },
        })
        // The transaction has committed by now (see publishAfterCommit).
        publishAfterCommit(context, workspaceChannel(context.workspace.id), {
          type: "note.created",
          note,
        })
        return note
      }),

    // A member deletes their own notes; an admin or owner deletes anyone's.
    delete: authed.notes.delete
      .use(member("member"), (input) => input)
      .handler(async ({ input, context, errors }) => {
        const key = { workspaceId: context.workspace.id, id: input.id }
        const row = await context.db.notes.findRow(key)
        if (!row) throw errors.NOT_FOUND({ message: apiMessage(context, "noteNotFound") })
        if (row.user_id !== context.user.id && !roleAtLeast(context.role, "admin")) {
          throw errors.FORBIDDEN({ message: requiresRoleMessage(context, "admin") })
        }
        await context.db.transaction(async (tx) => {
          if (await tx.notes.delete(key))
            await emitWebhookEvent(
              context,
              key.workspaceId,
              "note.deleted",
              { id: input.id },
              { tx }
            )
        })
        await auditWhileImpersonating(context, {
          action: "note.deleted",
          targetType: "note",
          targetId: input.id,
          metadata: { workspaceId: context.workspace.id },
        })
        publishAfterCommit(context, workspaceChannel(context.workspace.id), {
          type: "note.deleted",
          id: input.id,
        })
      }),
  },

  workspaces: {
    list: authed.workspaces.list.handler(async ({ context }) => {
      const { user } = context
      const rows = await context.db.workspaces.listForUser(user.id)
      // Invitations are matched by email: only a verified address proves the caller owns it.
      const pending = user.email_verified_at
        ? await context.db.invitations.listPendingForEmail(user.email, new Date().toISOString())
        : []
      // One entitlements query trio per workspace: fine for a starter's handful of workspaces.
      const items = await Promise.all(
        rows.map(async (row) =>
          toWorkspace(
            row,
            row.role,
            row.member_count,
            await entitlementsForWorkspace(context.db, row.id, context.billing),
            context.fileUrl
          )
        )
      )
      return {
        items,
        pendingInvitations: pending.map((row) => ({
          id: row.id,
          workspace: { name: row.workspace_name },
          role: row.role,
          invitedBy: { name: row.inviter_name },
          expiresAt: row.expires_at,
        })),
      }
    }),

    create: authed.workspaces.create.handler(async ({ input, context, errors }) => {
      const { user } = context
      const limit = await context.workspaceCreateLimiter.hit(`workspace-create:${user.id}`)
      if (!limit.allowed)
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "workspaceCreateRate") })
      if (!user.email_verified_at)
        throw errors.FORBIDDEN({ message: apiMessage(context, "workspaceVerifyEmail") })
      const attempt = () =>
        context.db.transaction(async (tx) => {
          const row = await tx.workspaces.create({
            name: input.name,
            slug: await uniqueSlug(tx, input.name),
            createdBy: user.id,
          })
          await tx.memberships.add({ workspaceId: row.id, userId: user.id, role: "owner" })
          await recordEvent(
            context,
            "workspace_created",
            { userId: user.id, workspaceId: row.id },
            {},
            { tx }
          )
          await auditWorkspace({ ...context, db: tx }, row.id, {
            action: "workspace.created",
            targetType: "workspace",
            targetId: row.id,
            metadata: { name: row.name },
          })
          return row
        })
      let row: Awaited<ReturnType<typeof attempt>>
      try {
        row = await attempt()
      } catch (error) {
        // A concurrent create took the same slug between the check and the insert: pick again.
        if (!isSlugTaken(error)) throw error
        row = await attempt()
      }
      return toWorkspace(
        row,
        "owner",
        1,
        await entitlementsForWorkspace(context.db, row.id, context.billing),
        context.fileUrl
      )
    }),

    get: authed.workspaces.get
      .use(member("viewer"), (input) => input)
      .handler(async ({ context }) => {
        const entitlements = await entitlementsForWorkspace(
          context.db,
          context.workspace.id,
          context.billing
        )
        return toWorkspace(
          context.workspace,
          context.role,
          entitlements.seatsUsed,
          entitlements,
          context.fileUrl
        )
      }),

    update: authed.workspaces.update
      .use(member("admin"), (input) => input)
      .handler(async ({ input, context }) => {
        const workspaceId = context.workspace.id
        await context.db.transaction(async (tx) => {
          await tx.workspaces.rename(workspaceId, input.name)
          // The same name again changes nothing a receiver (or the activity log) can see.
          if (input.name === context.workspace.name) return
          await emitWebhookEvent(
            context,
            workspaceId,
            "workspace.updated",
            () => workspaceData(tx, context.billing, workspaceId),
            { tx }
          )
          await auditWorkspace({ ...context, db: tx }, workspaceId, {
            action: "workspace.renamed",
            targetType: "workspace",
            targetId: workspaceId,
            metadata: { from: context.workspace.name, to: input.name },
          })
        })
        const entitlements = await entitlementsForWorkspace(
          context.db,
          context.workspace.id,
          context.billing
        )
        return toWorkspace(
          { ...context.workspace, name: input.name },
          context.role,
          entitlements.seatsUsed,
          entitlements,
          context.fileUrl
        )
      }),

    // A live subscription is canceled with the provider first: deleting the workspace drops the
    // mirror, and a subscription nobody can see would keep billing. A failed cancel deletes nothing.
    delete: authed.workspaces.delete
      .use(member("owner"), (input) => input)
      .handler(async ({ context, errors }) => {
        refuseWhileImpersonating(context)
        try {
          await cancelLiveSubscription(context.db, context.billing, context.workspace.id)
        } catch (error) {
          context.log("billing: cancel before delete failed", error)
          throw errors.INTERNAL_SERVER_ERROR({
            message: apiMessage(context, "subscriptionCancelFailed"),
          })
        }
        await context.db.transaction((tx) =>
          deleteWorkspaceInTx(tx, context.enqueue, context.workspace)
        )
      }),

    leave: authed.workspaces.leave
      // Exempt from the two-step requirement: a blocked member can always leave.
      .use(member("viewer", { twoFactorExempt: true }), (input) => input)
      .handler(async ({ context }) => {
        await removeMember(context, context.workspace.id, context.user.id, "workspace.left")
      }),

    transferOwnership: authed.workspaces.transferOwnership
      .use(member("owner"), (input) => input)
      .handler(async ({ input, context, errors }) => {
        refuseWhileImpersonating(context)
        const workspaceId = context.workspace.id
        if (input.userId === context.user.id)
          throw errors.BAD_REQUEST({ message: apiMessage(context, "notAMember") })
        const transferred = await context.db.transaction(async (tx) => {
          const before = await transferOwnershipInTx(tx, workspaceId, context.user.id, input.userId)
          if (!before) return false
          for (const [membership, role] of [
            [before.to, "owner"],
            [before.from, "admin"],
          ] as const) {
            if (membership && membership.role !== role)
              await emitRoleChanged(context, tx, workspaceId, membership, role)
          }
          await auditWorkspace({ ...context, db: tx }, workspaceId, {
            action: "workspace.ownership_transferred",
            targetType: "user",
            targetId: input.userId,
          })
          // The new owner is told; the former owner made the change (and so their own demotion).
          if (before.to.role !== "owner" && !isActor(context, input.userId))
            await notifyUser(
              context,
              input.userId,
              "member.role_changed",
              { workspaceName: context.workspace.name, from: before.to.role, to: "owner" },
              { tx, workspaceId }
            )
          return true
        })
        if (!transferred) throw errors.BAD_REQUEST({ message: apiMessage(context, "notAMember") })
      }),

    members: {
      list: authed.workspaces.members.list
        .use(member("viewer"), (input) => input)
        .handler(async ({ context }) => {
          // Emails and two-step status are admin-and-up only. The status is a yes/no — never
          // which factor, device or recovery state.
          const showPrivate = roleAtLeast(context.role, "admin")
          const rows = await context.db.memberships.listWithTwoFactor(context.workspace.id)
          return {
            items: rows.map((row) => ({
              userId: row.user_id,
              name: row.name,
              email: showPrivate ? row.email : null,
              role: row.role,
              joinedAt: row.created_at,
              twoFactor: showPrivate ? Number(row.two_factor) === 1 : null,
            })),
          }
        }),

      setRole: authed.workspaces.members.setRole
        .use(member("admin"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          const workspaceId = context.workspace.id
          const target = await context.db.memberships.find(workspaceId, input.userId)
          if (!target) throw errors.BAD_REQUEST({ message: apiMessage(context, "notAMember") })
          if (target.role === "owner" && context.role !== "owner") {
            throw errors.FORBIDDEN({ message: requiresRoleMessage(context, "owner") })
          }
          await context.db.transaction(async (tx) => {
            const before = await setRoleInTx(
              tx,
              workspaceId,
              input.userId,
              input.role,
              context.locale
            )
            if (!before || before.role === input.role) return
            await emitRoleChanged(context, tx, workspaceId, before, input.role)
            await auditWorkspace({ ...context, db: tx }, workspaceId, {
              action: "member.role_changed",
              targetType: "user",
              targetId: input.userId,
              metadata: { from: before.role, to: input.role },
            })
            if (!isActor(context, input.userId))
              await notifyUser(
                context,
                input.userId,
                "member.role_changed",
                { workspaceName: context.workspace.name, from: before.role, to: input.role },
                { tx, workspaceId }
              )
          })
        }),

      remove: authed.workspaces.members.remove
        .use(member("admin"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          const workspaceId = context.workspace.id
          const target = await context.db.memberships.find(workspaceId, input.userId)
          if (!target) throw errors.BAD_REQUEST({ message: apiMessage(context, "notAMember") })
          if (target.role === "owner" && context.role !== "owner") {
            throw errors.FORBIDDEN({ message: requiresRoleMessage(context, "owner") })
          }
          // Removing yourself is leaving: the same last-owner guard applies.
          await removeMember(context, workspaceId, input.userId, "member.removed")
        }),
    },

    invitations: {
      list: authed.workspaces.invitations.list
        .use(member("admin"), (input) => input)
        .handler(async ({ context }) => ({
          items: (
            await context.db.invitations.listPending(context.workspace.id, new Date().toISOString())
          ).map(toInvitation),
        })),

      // The domain allowlist runs first: an address outside a non-empty list is refused before
      // the limiters record a hit, before the seat check and before any pending row for it is
      // replaced. The message names the workspace's own domains (the caller, an admin, can read
      // them anyway), never the address. An unreadable stored list fails closed: every address is
      // refused (with the no-longer-accepts message, there being no list to name) and the failure
      // is recorded with the workspace id only. Then the limiter runs before anything is stored
      // or sent.
      create: authed.workspaces.invitations.create
        .use(member("admin"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          const { workspace, user } = context
          const domains = inviteDomainsOf(workspace)
          if (domains === null) {
            context.recordFailure(INVITE_DOMAINS_UNREADABLE, { workspaceId: workspace.id })
            throw errors.FORBIDDEN({
              message: apiMessage(context, "inviteDomainNoLongerAllowed"),
              data: { reason: INVITE_DOMAIN_REASON },
            })
          }
          if (!inviteDomainAllowed(domains, normalizeEmail(input.email))) {
            throw errors.FORBIDDEN({
              message: apiMessage(context, "inviteDomainRestricted", {
                domains: new Intl.ListFormat(context.locale ?? "en", {
                  type: "conjunction",
                }).format(domains),
              }),
              data: { reason: INVITE_DOMAIN_REASON },
            })
          }
          const limit = await context.inviteLimiter.hit(`invite:${workspace.id}`)
          if (!limit.allowed)
            throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "inviteRate") })
          const perInviter = await context.inviterLimiter.hit(`invite:user:${user.id}`)
          if (!perInviter.allowed)
            throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "inviteRate") })
          const email = normalizeEmail(input.email)
          const existing = await context.db.users.findByEmail(email)
          if (existing && (await context.db.memberships.find(workspace.id, existing.id))) {
            throw errors.CONFLICT({ message: apiMessage(context, "alreadyMember") })
          }
          // Pending invitations do not hold a seat; accepting one checks again.
          assertSeatAvailable(
            await entitlementsForWorkspace(context.db, workspace.id, context.billing),
            context.locale
          )
          const token = newToken()
          const link = `${context.appUrl}/invitations/${token}`
          // Delete-then-insert in one transaction. Two concurrent invites to one address can
          // still both pass the delete (Postgres READ COMMITTED): the loser hits the partial
          // unique index and retries once, replacing the winner's row. The mail is enqueued in
          // the same transaction, so a losing attempt's row never leaves a stray mail.send job.
          const attempt = () =>
            context.db.transaction(async (tx) => {
              const row = await tx.invitations.create({
                workspaceId: workspace.id,
                email,
                role: input.role,
                tokenHash: tokenHash(token),
                invitedBy: user.id,
                expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
              })
              await enqueueMail(
                context.enqueue,
                "invitation",
                email,
                {
                  workspaceName: workspace.name,
                  inviterName: user.name || user.email,
                  role: input.role,
                  link,
                },
                // An address that already has an account with a chosen locale reads it in that;
                // anyone else gets the inviter's own request locale.
                {
                  tx,
                  locale: existing && isLocale(existing.locale) ? existing.locale : context.locale,
                }
              )
              await recordEvent(
                context,
                "member_invited",
                { userId: user.id, workspaceId: workspace.id },
                { role: input.role },
                { tx }
              )
              await auditWorkspace({ ...context, db: tx }, workspace.id, {
                action: "invitation.created",
                targetType: "invitation",
                targetId: row.id,
                metadata: { email: maskEmail(email), role: input.role },
              })
              // To the account that already holds the address, only once it is verified — the
              // same rule as `workspaces.list`'s pending invitations, so whoever registered
              // someone else's address unverified never learns who invites it. Nobody when no
              // account holds it. A re-invite replaces the row and so notifies again.
              if (existing && existing.email_verified_at !== null && !isActor(context, existing.id))
                await notifyUser(
                  context,
                  existing.id,
                  "invitation.received",
                  { workspaceName: workspace.name, role: input.role, invitationId: row.id },
                  { tx, workspaceId: workspace.id }
                )
              return row
            })
          let row: Awaited<ReturnType<typeof attempt>>
          try {
            row = await attempt()
          } catch (error) {
            if (!isPendingInviteTaken(error)) throw error
            row = await attempt()
          }
          return toInvitation({ ...row, workspace_name: workspace.name, inviter_name: user.name })
        }),

      revoke: authed.workspaces.invitations.revoke
        .use(member("admin"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          const workspaceId = context.workspace.id
          const deleted = await context.db.transaction(async (tx) => {
            const row = await tx.invitations.delete(input.id, workspaceId)
            if (!row) return false
            await auditWorkspace({ ...context, db: tx }, workspaceId, {
              action: "invitation.revoked",
              targetType: "invitation",
              targetId: row.id,
              metadata: { email: maskEmail(row.email), role: row.role },
            })
            return true
          })
          if (!deleted)
            throw errors.NOT_FOUND({ message: apiMessage(context, "invitationNotFound") })
        }),
    },

    logo: {
      set: authed.workspaces.logo.set
        .use(member("admin"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          const limit = await context.uploadLimiter.hit(`upload:${context.user.id}`)
          if (!limit.allowed)
            throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "uploadRate") })
          const workspaceId = context.workspace.id
          // The key, the webhook and the activity row commit together: a failed audit insert
          // rolls the logo back, and `replaceImage` then queues the object it just wrote for
          // `storage.delete`, as for any failed commit.
          const key = await replaceImage(
            context,
            input.file,
            (ext) => newFileKey("logos", workspaceId, ext),
            (k) =>
              context.db.transaction(async (tx) => {
                const previous = await tx.workspaces.setLogoKey(workspaceId, k)
                await emitWebhookEvent(
                  context,
                  workspaceId,
                  "workspace.updated",
                  () => workspaceData(tx, context.billing, workspaceId),
                  { tx }
                )
                await auditWorkspace({ ...context, db: tx }, workspaceId, {
                  action: "workspace.logo_set",
                  targetType: "workspace",
                  targetId: workspaceId,
                })
                return previous
              })
          )
          return { logoUrl: context.fileUrl(key) }
        }),
      remove: authed.workspaces.logo.remove
        .use(member("admin"), (input) => input)
        .handler(async ({ context }) => {
          const workspaceId = context.workspace.id
          // The key, the webhook and the activity row commit together (a failed audit insert
          // keeps the logo); the old object is queued for deletion only once that has committed.
          const previous = await context.db.transaction(async (tx) => {
            const previous = await tx.workspaces.setLogoKey(workspaceId, null)
            if (!previous) return null
            await emitWebhookEvent(
              context,
              workspaceId,
              "workspace.updated",
              () => workspaceData(tx, context.billing, workspaceId),
              { tx }
            )
            await auditWorkspace({ ...context, db: tx }, workspaceId, {
              action: "workspace.logo_removed",
              targetType: "workspace",
              targetId: workspaceId,
            })
            return previous
          })
          if (previous) {
            await enqueueStorageDelete(context.enqueue, previous).catch((error) =>
              context.recordFailure("storage.delete enqueue failed", error)
            )
          }
          return { ok: true as const }
        }),
    },

    // Workspace API keys for /v1. Admin and up; create and revoke are refused while impersonating
    // (an impersonator may look, not mint credentials) and always audited. The full key exists in
    // this process only while `create` builds its answer: it is never stored, logged or audited.
    apiKeys: {
      list: authed.workspaces.apiKeys.list
        .use(member("admin"), (input) => input)
        .handler(async ({ context }) => {
          const now = context.now()
          const rows = await context.db.apiKeys.listForWorkspace(context.workspace.id)
          return { items: rows.map((row) => toApiKeySummary(row, now)) }
        }),

      // The paid-feature check first, then the cap counted inside the inserting transaction after
      // locking the workspace row (`lockForOwnership`, the lock every workspace writer takes), so
      // two concurrent creates at MAX_API_KEYS - 1 serialise and the second counts the first's
      // row. SQLite's single writer serialises them the same way.
      create: authed.workspaces.apiKeys.create
        .use(member("admin"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          refuseWhileImpersonating(context)
          const workspaceId = context.workspace.id
          const entitlements = await entitlementsForWorkspace(
            context.db,
            workspaceId,
            context.billing
          )
          assertEntitled(entitlements, "api", context.locale)
          const now = context.now()
          const createdAt = now.toISOString()
          const expiresAt =
            input.expiresInDays === null
              ? null
              : new Date(now.getTime() + input.expiresInDays * DAY_MS).toISOString()
          // Canonical order, whatever order the form sent them in.
          const scopes = API_SCOPES.filter((scope) => input.scopes.includes(scope))
          // A prefix collision (~47.6 bits, so vanishingly rare) rolls the transaction back on the
          // unique index; a fresh key is drawn and the whole transaction retried, at most
          // `API_KEY_CREATE_ATTEMPTS` times.
          let outcome: { key: string; row: ApiKeyRow } | "limit" | "gone" | undefined
          for (let attempt = 1; outcome === undefined; attempt++) {
            const { key, prefix, secretHash } = context.generateApiKey()
            try {
              outcome = await context.db.transaction(async (tx) => {
                if (!(await tx.workspaces.lockForOwnership(workspaceId))) return "gone" as const
                if ((await tx.apiKeys.countLive(workspaceId, createdAt)) >= MAX_API_KEYS)
                  return "limit" as const
                const created = await tx.apiKeys.create({
                  workspaceId,
                  name: input.name,
                  prefix,
                  secretHash,
                  scopes,
                  createdBy: context.user.id,
                  createdAt,
                  expiresAt,
                })
                await emitWebhookEvent(
                  context,
                  workspaceId,
                  "api_key.created",
                  apiKeyData(created),
                  { tx }
                )
                await auditWorkspace({ ...context, db: tx }, workspaceId, {
                  action: "workspace.api_key_created",
                  targetType: "api_key",
                  targetId: created.id,
                  metadata: { name: created.name, prefix, scopes, expiresAt },
                })
                return { key, row: created }
              })
            } catch (error) {
              if (!isPrefixTaken(error) || attempt >= API_KEY_CREATE_ATTEMPTS) throw error
            }
          }
          if (outcome === "gone")
            throw errors.NOT_FOUND({ message: apiMessage(context, "workspaceNotFound") })
          if (outcome === "limit")
            throw errors.CONFLICT({ message: apiMessage(context, "apiKeyLimit") })
          const { key, row } = outcome
          const summary = toApiKeySummary(
            { ...row, creator_name: context.user.name, creator_is_member: 1 },
            now
          )
          return { key, apiKey: summary }
        }),

      // Allowed on a Free workspace too: losing the feature must never keep a key alive. Revoking
      // an already revoked key is a no-op (its first `revokedAt` stays, no second audit row).
      revoke: authed.workspaces.apiKeys.revoke
        .use(member("admin"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          refuseWhileImpersonating(context)
          const workspaceId = context.workspace.id
          const outcome = await context.db.transaction(async (tx) => {
            const row = await tx.apiKeys.findInWorkspace(input.id, workspaceId)
            if (!row) return "not-found" as const
            const revokedAt = context.now().toISOString()
            if (!(await tx.apiKeys.revoke(row.id, workspaceId, revokedAt)))
              return "already" as const
            await emitWebhookEvent(context, workspaceId, "api_key.revoked", apiKeyData(row), {
              tx,
            })
            await auditWorkspace({ ...context, db: tx }, workspaceId, {
              action: "workspace.api_key_revoked",
              targetType: "api_key",
              targetId: row.id,
              metadata: { name: row.name, prefix: row.prefix, scopes: parseScopes(row.scopes) },
            })
            return "revoked" as const
          })
          if (outcome === "not-found")
            throw errors.NOT_FOUND({ message: apiMessage(context, "apiKeyNotFound") })
        }),
    },

    // Outgoing webhook endpoints. Admin and up; everything but list and deliveries is refused while
    // impersonating; create, update and rotateSecret need the paid `api` feature (list, deliveries
    // and delete work on every plan, so losing the feature never strands an endpoint). The plain
    // `whsec_…` secret exists in this process only while create/rotateSecret build their answer:
    // it is stored encrypted and never logged or audited.
    webhooks: {
      list: authed.workspaces.webhooks.list
        .use(member("admin"), (input) => input)
        .handler(async ({ context }) => {
          const rows = await context.db.webhooks.listForWorkspace(context.workspace.id)
          return { items: rows.map(toWebhookEndpoint) }
        }),

      // Feature, then the SSRF guard (DNS, outside any transaction), then the cap counted inside
      // the inserting transaction after locking the workspace row, so two concurrent creates at
      // MAX_WEBHOOK_ENDPOINTS - 1 serialise and the second counts the first's row.
      create: authed.workspaces.webhooks.create
        .use(member("admin"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          refuseWhileImpersonating(context)
          const workspaceId = context.workspace.id
          const entitlements = await entitlementsForWorkspace(
            context.db,
            workspaceId,
            context.billing
          )
          assertEntitled(entitlements, "api", context.locale)
          const url = await checkedWebhookUrl(context, input.url)
          const events = canonicalEvents(input.events)
          const secret = newWebhookSecret()
          const encrypted = await encryptWebhookSecret(secret, context.twoFactorKey)
          const outcome = await context.db.transaction(async (tx) => {
            if (!(await tx.workspaces.lockForOwnership(workspaceId))) return "gone" as const
            if ((await tx.webhooks.countForWorkspace(workspaceId)) >= MAX_WEBHOOK_ENDPOINTS)
              return "limit" as const
            const created = await tx.webhooks.create({
              workspaceId,
              url,
              description: descriptionOrNull(input.description),
              events,
              secret: encrypted,
              createdBy: context.user.id,
              createdAt: context.now().toISOString(),
            })
            await auditWorkspace({ ...context, db: tx }, workspaceId, {
              action: "workspace.webhook_created",
              targetType: "webhook",
              targetId: created.id,
              metadata: { endpointId: created.id, host: webhookHost(url), events },
            })
            return created
          })
          if (outcome === "gone")
            throw errors.NOT_FOUND({ message: apiMessage(context, "workspaceNotFound") })
          if (outcome === "limit")
            throw errors.CONFLICT({ message: apiMessage(context, "webhookLimit") })
          const endpoint = toWebhookEndpoint({
            ...outcome,
            creator_name: context.user.name,
            last_delivery: null,
          })
          return { secret, endpoint }
        }),

      // Only the given fields change. `enabled: true` re-enables a disabled endpoint (clearing the
      // reason and the failure count); `enabled: false` disables it as `manual`. A changed URL is
      // re-checked by the SSRF guard. One audit row per call that changed something.
      update: authed.workspaces.webhooks.update
        .use(member("admin"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          refuseWhileImpersonating(context)
          const workspaceId = context.workspace.id
          const entitlements = await entitlementsForWorkspace(
            context.db,
            workspaceId,
            context.billing
          )
          assertEntitled(entitlements, "api", context.locale)
          const existing = await context.db.webhooks.findInWorkspace(input.id, workspaceId)
          if (!existing) throw errors.NOT_FOUND({ message: apiMessage(context, "webhookNotFound") })
          const url =
            input.url === undefined || input.url === existing.url
              ? undefined
              : await checkedWebhookUrl(context, input.url)
          const events = input.events === undefined ? undefined : canonicalEvents(input.events)
          const description =
            input.description === undefined ? undefined : descriptionOrNull(input.description)
          const outcome = await context.db.transaction(async (tx) => {
            const row = await tx.webhooks.findInWorkspace(input.id, workspaceId)
            if (!row) return "not-found" as const
            const changed: string[] = []
            const fields: { url?: string; description?: string | null; events?: string[] } = {}
            if (url !== undefined && url !== row.url) {
              fields.url = url
              changed.push("url")
            }
            if (description !== undefined && description !== row.description) {
              fields.description = description
              changed.push("description")
            }
            if (events !== undefined && JSON.stringify(events) !== row.events) {
              fields.events = events
              changed.push("events")
            }
            if (changed.length > 0) await tx.webhooks.update(row.id, workspaceId, fields)
            if (input.enabled === true && (await tx.webhooks.enable(row.id, workspaceId)))
              changed.push("enabled")
            if (
              input.enabled === false &&
              (await tx.webhooks.disable(row.id, "manual", context.now().toISOString()))
            )
              changed.push("enabled")
            const updated = (await tx.webhooks.findInWorkspace(row.id, workspaceId)) ?? row
            if (changed.length > 0) {
              await auditWorkspace({ ...context, db: tx }, workspaceId, {
                action: "workspace.webhook_updated",
                targetType: "webhook",
                targetId: row.id,
                metadata: {
                  endpointId: row.id,
                  host: webhookHost(updated.url),
                  events: parseWebhookEvents(updated.events),
                  enabled: updated.enabled,
                  changed,
                },
              })
            }
            return updated
          })
          if (outcome === "not-found")
            throw errors.NOT_FOUND({ message: apiMessage(context, "webhookNotFound") })
          return toWebhookEndpoint(outcome)
        }),

      // The new secret replaces the old one at once: the next attempt signs with it.
      rotateSecret: authed.workspaces.webhooks.rotateSecret
        .use(member("admin"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          refuseWhileImpersonating(context)
          const workspaceId = context.workspace.id
          const entitlements = await entitlementsForWorkspace(
            context.db,
            workspaceId,
            context.billing
          )
          assertEntitled(entitlements, "api", context.locale)
          const secret = newWebhookSecret()
          const encrypted = await encryptWebhookSecret(secret, context.twoFactorKey)
          const rotated = await context.db.transaction(async (tx) => {
            const row = await tx.webhooks.findInWorkspace(input.id, workspaceId)
            if (!row || !(await tx.webhooks.setSecret(row.id, workspaceId, encrypted))) return false
            await auditWorkspace({ ...context, db: tx }, workspaceId, {
              action: "workspace.webhook_secret_rotated",
              targetType: "webhook",
              targetId: row.id,
              metadata: { endpointId: row.id, host: webhookHost(row.url) },
            })
            return true
          })
          if (!rotated) throw errors.NOT_FOUND({ message: apiMessage(context, "webhookNotFound") })
          return { secret }
        }),

      // Allowed on a Free workspace too. Deletes the endpoint's delivery log with it.
      delete: authed.workspaces.webhooks.delete
        .use(member("admin"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          refuseWhileImpersonating(context)
          const workspaceId = context.workspace.id
          const deleted = await context.db.transaction(async (tx) => {
            const row = await tx.webhooks.findInWorkspace(input.id, workspaceId)
            if (!row || !(await tx.webhooks.delete(row.id, workspaceId))) return false
            await auditWorkspace({ ...context, db: tx }, workspaceId, {
              action: "workspace.webhook_deleted",
              targetType: "webhook",
              targetId: row.id,
              metadata: {
                endpointId: row.id,
                host: webhookHost(row.url),
                events: parseWebhookEvents(row.events),
              },
            })
            return true
          })
          if (!deleted) throw errors.NOT_FOUND({ message: apiMessage(context, "webhookNotFound") })
        }),

      // Same rules as `update`. Queues one `ping` to this endpoint only (it needs no subscription),
      // through the same job, guard and signing as every other event. A disabled endpoint gets
      // nothing, so the ping would never leave: CONFLICT instead.
      test: authed.workspaces.webhooks.test
        .use(member("admin"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          refuseWhileImpersonating(context)
          const workspaceId = context.workspace.id
          const entitlements = await entitlementsForWorkspace(
            context.db,
            workspaceId,
            context.billing
          )
          assertEntitled(entitlements, "api", context.locale)
          // Every ping holds a worker slot for up to an attempt's 10 s: bounded per workspace.
          const limit = await context.webhookTestLimiter.hit(`webhook-test:${workspaceId}`)
          if (!limit.allowed)
            throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "webhookTestRate") })
          const row = await context.db.webhooks.findInWorkspace(input.id, workspaceId)
          if (!row) throw errors.NOT_FOUND({ message: apiMessage(context, "webhookNotFound") })
          if (!row.enabled)
            throw errors.CONFLICT({ message: apiMessage(context, "webhookTestDisabled") })
          return { eventId: await sendWebhookPing(context, row.id) }
        }),

      deliveries: authed.workspaces.webhooks.deliveries
        .use(member("admin"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          const row = await context.db.webhooks.findInWorkspace(input.id, context.workspace.id)
          if (!row) throw errors.NOT_FOUND({ message: apiMessage(context, "webhookNotFound") })
          const rows = await context.db.webhooks.listDeliveries(row.id, WEBHOOK_DELIVERIES_LIMIT)
          return { items: rows.map(toWebhookDelivery) }
        }),
    },
    activity: {
      // Admin and up on every plan, readable while impersonating (it writes nothing).
      list: authed.workspaces.activity.list
        .use(member("admin"), (input) => input)
        .handler(({ input, context }) =>
          listWorkspaceActivity(context.db, {
            workspaceId: context.workspace.id,
            now: context.now(),
            cursor: input.cursor,
            limit: input.limit,
            action: input.action,
          })
        ),
    },
    security: {
      // Admin and up: the setting and how many members lack two-step (a count, never who).
      get: authed.workspaces.security.get
        .use(member("admin"), (input) => input)
        .handler(async ({ context }) => {
          const rows = await context.db.memberships.listWithTwoFactor(context.workspace.id)
          return {
            requireTwoFactor: requiresTwoFactor(context.workspace),
            membersWithoutTwoFactor: rows.filter((row) => Number(row.two_factor) !== 1).length,
            // An unreadable stored list reads as empty here, flagged no further: display only.
            // Every enforcing path treats it as "allow no address" and records the failure.
            inviteDomains: inviteDomainsOf(context.workspace) ?? [],
          }
        }),

      // Owner only, every plan. Turning it on needs the owner to satisfy it first (they would lock
      // themselves out otherwise); turning it off needs nothing more. A no-op writes nothing.
      // The change, its audit row and the mails to members who lack two-step commit together.
      set: authed.workspaces.security.set
        .use(member("owner"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          refuseWhileImpersonating(context)
          const workspace = context.workspace
          const on = input.requireTwoFactor
          if (on === requiresTwoFactor(workspace)) return { requireTwoFactor: on }
          if (
            on &&
            !satisfiesTwoFactor(
              context.user,
              await context.db.passkeys.countForUser(context.user.id)
            )
          ) {
            throw errors.FORBIDDEN({
              message: apiMessage(context, "ownerTwoFactorRequired"),
              data: { reason: OWNER_TWO_FACTOR_REASON },
            })
          }
          const link = `${context.accountUrl.replace(/\/$/, "")}/security`
          await context.db.transaction(async (tx) => {
            // Conditional on the stored value: of two concurrent identical changes only one
            // writes, so the audit row and the mails happen once.
            if (!(await tx.workspaces.setRequireTwoFactor(workspace.id, on))) return
            await auditWorkspace({ ...context, db: tx }, workspace.id, {
              action: "workspace.two_factor_requirement_changed",
              targetType: "workspace",
              targetId: workspace.id,
              metadata: { enabled: on },
            })
            if (!on) return
            for (const row of await tx.memberships.listWithTwoFactor(workspace.id)) {
              if (Number(row.two_factor) === 1 || isActor(context, row.user_id)) continue
              await enqueueMail(
                context.enqueue,
                "workspaceTwoFactorRequired",
                row.email,
                { name: row.name || undefined, workspaceName: workspace.name, link },
                { tx, locale: isLocale(row.locale) ? row.locale : DEFAULT_LOCALE }
              )
              await notifyUser(
                context,
                row.user_id,
                "workspace.two_factor_required",
                { workspaceName: workspace.name },
                { tx, workspaceId: workspace.id }
              )
            }
          })
          return { requireTwoFactor: on }
        }),

      // Owner only, every plan. Each line is normalised with the same rule the UI uses; a line
      // that is not a domain is refused by index (never echoing its text), as is a list longer
      // than MAX_INVITE_DOMAINS. The same set of domains is a no-op (nothing written, nothing
      // audited); a change and its audit row commit together. Not enforced here: the
      // invitation procedures read the stored list.
      setInviteDomains: authed.workspaces.security.setInviteDomains
        .use(member("owner"), (input) => input)
        .handler(async ({ input, context, errors }) => {
          refuseWhileImpersonating(context)
          const { domains, invalid, overLimit } = normalizeInviteDomains(input.domains)
          if (invalid.length > 0) {
            throw errors.BAD_REQUEST({
              message: apiMessage(context, "inviteDomainsInvalid"),
              data: { reason: INVITE_DOMAIN_INVALID_REASON, indexes: invalid },
            })
          }
          if (overLimit) {
            throw errors.BAD_REQUEST({
              message: apiMessage(context, "inviteDomainsLimit"),
              data: { reason: INVITE_DOMAIN_LIMIT_REASON },
            })
          }
          const workspace = context.workspace
          const sameAs = (stored: string[]) =>
            stored.length === domains.length && domains.every((domain) => stored.includes(domain))
          const current = inviteDomainsOf(workspace)
          // The common no-op answers without taking a lock or writing anything. An unreadable
          // stored list is never "the same": saving any list (empty included) repairs it.
          if (current !== null && sameAs(current)) return { inviteDomains: current }
          return context.db.transaction(async (tx) => {
            // Locked, then re-read: concurrent saves serialise, and each one's added/removed is
            // measured against what the one before it committed. A workspace deleted since the
            // middleware read it is NOT_FOUND, so no audit row is written for a row that is gone.
            if (!(await tx.workspaces.lockForOwnership(workspace.id))) {
              throw errors.NOT_FOUND({ message: apiMessage(context, "workspaceNotFound") })
            }
            const row = await tx.workspaces.find(workspace.id)
            const stored = row ? inviteDomainsOf(row) : []
            if (stored !== null && sameAs(stored)) return { inviteDomains: stored }
            const before = stored ?? []
            await tx.workspaces.setInviteDomains(workspace.id, domains)
            await auditWorkspace({ ...context, db: tx }, workspace.id, {
              action: "workspace.invite_domains_changed",
              targetType: "workspace",
              targetId: workspace.id,
              metadata: {
                added: domains.filter((domain) => !before.includes(domain)),
                removed: before.filter((domain) => !domains.includes(domain)),
              },
            })
            return { inviteDomains: domains }
          })
        }),
    },
  },

  invitations: {
    preview: api.invitations.preview.handler(async ({ input, context, errors }) => {
      const row = await context.db.invitations.findByTokenHash(tokenHash(input.token))
      if (!row || row.accepted_at || row.expires_at <= new Date().toISOString()) {
        throw errors.NOT_FOUND({ message: apiMessage(context, "invitationInvalid") })
      }
      return {
        workspace: { name: row.workspace_name },
        invitedBy: { name: row.inviter_name },
        email: maskEmail(row.email),
        role: row.role,
        expiresAt: row.expires_at,
        requireTwoFactor: requiresTwoFactor({
          require_two_factor: row.workspace_require_two_factor,
        }),
        domainAllowed: inviteDomainAllowedUnder(
          inviteDomainsOf({ invite_domains: row.workspace_invite_domains }),
          row.email
        ),
      }
    }),

    accept: authed.invitations.accept.handler(async ({ input, context, errors }) => {
      const result = await acceptInvitation(
        context.db,
        context.billing,
        context.user,
        await context.db.invitations.findByTokenHash(tokenHash(input.token)),
        errors,
        "forbidden",
        context.locale,
        context.fileUrl,
        context,
        context
      )
      return result
    }),

    acceptById: authed.invitations.acceptById.handler(async ({ input, context, errors }) => {
      const result = await acceptInvitation(
        context.db,
        context.billing,
        context.user,
        await context.db.invitations.find(input.id),
        errors,
        "not_found",
        context.locale,
        context.fileUrl,
        context,
        context
      )
      return result
    }),
  },

  // Service token only, no session: the Next apps' /files/<key> routes fetch these on the user's
  // behalf. `key` names its own kind (avatars/… vs logos/…), so one procedure covers both.
  files: {
    get: api.files.get.handler(async ({ input, context }) => {
      const { key } = input
      const referenced = key.startsWith("avatars/")
        ? await context.db.users.hasAvatarKey(key)
        : await context.db.workspaces.hasLogoKey(key)
      const object = referenced ? await context.storage.get(key) : null
      if (!object) throw new ORPCError("NOT_FOUND", { message: apiMessage(context, "notFound") })
      return new File([object.body], key.slice(key.lastIndexOf("/") + 1), {
        type: object.contentType,
      })
    }),
  },

  billing: {
    get: authed.billing.get
      .use(member("viewer"), (input) => input)
      .handler(async ({ context }) => ({
        ...(await entitlementsForWorkspace(context.db, context.workspace.id, context.billing)),
        provider: context.billing.kind,
      })),

    // A live subscription changes plan through the portal, never a second checkout.
    checkout: authed.billing.checkout
      .use(member("owner"), (input) => input)
      .handler(async ({ input, context, errors }) => {
        refuseWhileImpersonating(context)
        const workspaceId = context.workspace.id
        const latest = await context.db.billing.subscriptions.latest(workspaceId)
        if (latest && !ENDED_STATUSES.includes(latest.status))
          throw errors.CONFLICT({ message: apiMessage(context, "billingUsePortal") })
        if (!context.billing.hasPrice(input.plan, input.interval))
          throw errors.BAD_REQUEST({ message: apiMessage(context, "planUnavailable") })
        const customer = await context.db.billing.customers.find(workspaceId)
        return context.billing.createCheckout({
          workspaceId,
          plan: input.plan,
          interval: input.interval,
          customerId: customer?.customer_id ?? null,
          customerEmail: context.user.email,
          successUrl: `${context.accountUrl}/payments?checkout=success`,
          cancelUrl: `${context.accountUrl}/payments?checkout=cancelled`,
          // Only the mock applies the plan here (and so names who changed it); a real provider
          // never sees the caller's row — its plan change arrives by webhook, from the system.
          ...(isMockBilling(context.billing)
            ? { actor: { user: context.user, impersonator: context.impersonator } }
            : {}),
        })
      }),

    portal: authed.billing.portal
      .use(member("owner"), (input) => input)
      .handler(async ({ context, errors }) => {
        refuseWhileImpersonating(context)
        const customer = await context.db.billing.customers.find(context.workspace.id)
        if (!customer) throw errors.NOT_FOUND({ message: apiMessage(context, "noBillingAccount") })
        return context.billing.createPortal({
          customerId: customer.customer_id,
          returnUrl: `${context.accountUrl}/payments`,
        })
      }),

    // The mock's in-app portal; with a real provider the route does not exist.
    mockChange: authed.billing.mockChange
      .use(member("owner"), (input) => input)
      .handler(async ({ input, context, errors }) => {
        refuseWhileImpersonating(context)
        const provider = context.billing
        if (!isMockBilling(provider)) {
          throw errors.NOT_FOUND({ message: apiMessage(context, "mockBillingDisabled") })
        }
        await provider.change(context.workspace.id, input.plan, input.interval, {
          user: context.user,
          impersonator: context.impersonator,
        })
        return {
          ...(await entitlementsForWorkspace(context.db, context.workspace.id, provider)),
          provider: provider.kind,
        }
      }),
  },

  waitlist: {
    // A new and a repeat email get the same answer; only a new one is mailed. The limiter runs
    // before the insert, so a tripped client stores nothing.
    join: api.waitlist.join.handler(async ({ input, context, errors }) => {
      const limit = await context.waitlistLimiter.hit(`waitlist:${context.clientId ?? "unknown"}`)
      if (!limit.allowed)
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "tooManyRequests") })
      const { created } = await context.db.waitlist.add(input)
      if (created) {
        const to = normalizeEmail(input.email)
        await enqueueMail(
          context.enqueue,
          "waitlistWelcome",
          to,
          { siteUrl: context.wwwUrl },
          { locale: context.locale }
        )
      }
      return { joined: true as const }
    }),
  },
  support: {
    // Anonymous like `waitlist.join` (service token only). All three limits run before anything is
    // stored; the row and both mails commit together. A forwarded session links the request only
    // when it is the user's own: an impersonation session never does, and a dead token is ignored
    // rather than refused (the form works signed out too).
    create: api.support.create.handler(async ({ input, context, errors }) => {
      const perClient = await context.supportLimiter.hit(`support:${context.clientId ?? "unknown"}`)
      if (!perClient.allowed)
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "supportRate") })
      const perRecipient = await context.supportRecipientLimiter.hit(
        `support-to:${normalizeEmail(input.email)}`
      )
      if (!perRecipient.allowed)
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "supportRate") })
      const global = await context.supportGlobalLimiter.hit("support:global")
      if (!global.allowed) {
        context.noteCapTripped("support:global")
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "supportRate") })
      }
      const resolved = await resolveSession(
        context.db,
        context.sessionToken,
        context.superadminEmails,
        context.now()
      )
      const userId =
        resolved && resolved.impersonator === null && resolved.session.impersonated_by === null
          ? resolved.user.id
          : null
      const name = input.name || null
      const page = supportPage(input.page)
      const reference = await context.db.transaction(async (tx) => {
        const { id } = await tx.support.create({
          email: input.email,
          name,
          topic: input.topic,
          message: input.message,
          page,
          userId,
          ipHash: context.clientId,
          createdAt: new Date().toISOString(),
        })
        const reference = supportReference(id)
        // To the support team, in English (an internal mail); replying reaches the sender.
        await enqueueMail(
          context.enqueue,
          "supportRequest",
          context.supportEmail,
          {
            reference,
            topic: input.topic,
            email: input.email,
            name: name ?? undefined,
            page: page ?? undefined,
            message: input.message,
            adminUrl: `${context.authUrl}/admin/support`,
          },
          { tx, replyTo: input.email }
        )
        await enqueueMail(
          context.enqueue,
          "supportReceived",
          input.email,
          // Only the reference: the address is whatever was typed, so the copy never repeats the
          // sender's text (that would make it an open, branded relay).
          { reference },
          { tx, locale: context.requestedLocale ?? DEFAULT_LOCALE, replyTo: context.supportEmail }
        )
        return reference
      })
      return { reference }
    }),
  },
  // The coaching site's contact form (see docs/architecture/leads.md). Anonymous like
  // `support.create`: the same three limits run before anything is stored, then the row, both
  // mails and the analytics event commit together (see `submitLead`).
  leads: {
    create: api.leads.create.handler(async ({ input, context, errors }) => {
      const perClient = await context.leadsLimiter.hit(`leads:${context.clientId ?? "unknown"}`)
      if (!perClient.allowed)
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "leadsRate") })
      const perRecipient = await context.leadsRecipientLimiter.hit(
        `leads-to:${normalizeEmail(input.email)}`
      )
      if (!perRecipient.allowed)
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "leadsRate") })
      const global = await context.leadsGlobalLimiter.hit("leads:global")
      if (!global.allowed) {
        context.noteCapTripped("leads:global")
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "leadsRate") })
      }
      return submitLead(context, input)
    }),
  },
  // The coaching site's booking calendar (see docs/architecture/booking.md). Anonymous like
  // `support.create`: the three limiters run before anything is stored, every slot a visitor sends
  // is re-derived from the rules inside the transaction (never trusted), and the row, the
  // customer's mail and the owner's mail commit together.
  booking: {
    availability: api.booking.availability.handler(async ({ input, context }) => {
      const days = bookingDays(input.from, input.to)
      if (days.length > BOOKING_AVAILABILITY_MAX_DAYS) {
        throw new ORPCError("BAD_REQUEST", {
          message: `At most ${BOOKING_AVAILABILITY_MAX_DAYS} days per call`,
        })
      }
      const offering = OFFERINGS[input.offering]
      const now = context.now()
      const [rules, blocks, busy] = await Promise.all([
        context.db.booking.rules.effective(),
        context.db.booking.blocks.inRange(input.from, input.to),
        context.db.booking.busy(
          zonedInstant(input.from, "00:00").toISOString(),
          zonedInstant(shiftBookingDay(input.to, 1), "00:00").toISOString()
        ),
      ])
      const engine = {
        durationMinutes: offering.durationMinutes,
        rules,
        blocks: blocks.map((b) => ({ from: b.from_date, to: b.to_date })),
        busy,
        now,
      }
      return {
        timezone: BOOKING_TIMEZONE,
        durationMinutes: offering.durationMinutes,
        days: days
          .map((day) => ({ day, slots: slotsForDay({ ...engine, day }) }))
          .map(({ day, slots }) => ({ date: day, slots })),
      }
    }),

    groupEvents: api.booking.groupEvents.handler(async ({ input, context }) => {
      const rows = await context.db.booking.events.upcoming(
        context.now().toISOString(),
        input.offering
      )
      return { events: rows.map(toGroupEvent) }
    }),

    book: api.booking.book.handler(async ({ input, context, errors }) => {
      await bookingLimits(context, input.customer.email)
      const offering = OFFERINGS[input.offering]
      const now = context.now()
      const locale = context.requestedLocale ?? DEFAULT_LOCALE
      const { token, hash } = newManageToken()
      const createdAt = now.toISOString()
      const sorted = [...input.slots].sort()
      const result = await context.db.transaction(async (tx) => {
        await tx.booking.rules.lock()
        const first = sorted[0] as string
        const last = sorted[sorted.length - 1] as string
        const [rules, blocks, busy] = await Promise.all([
          tx.booking.rules.effective(),
          tx.booking.blocks.inRange(zonedDay(new Date(first)), zonedDay(new Date(last))),
          tx.booking.busy(
            new Date(Date.parse(first) - DAY_MS).toISOString(),
            new Date(Date.parse(last) + DAY_MS).toISOString()
          ),
        ])
        const engine = {
          durationMinutes: offering.durationMinutes,
          rules,
          blocks: blocks.map((b) => ({ from: b.from_date, to: b.to_date })),
          busy: [...busy],
          now,
        }
        const slots = sorted.map((startsAt) => ({
          startsAt,
          endsAt: endOf(startsAt, offering.durationMinutes),
        }))
        for (const slot of slots) {
          if (!isOfferedSlot(slot, engine)) return "taken" as const
          // The next slot of the same order must not collide with this one either.
          engine.busy.push(slot)
        }
        // A further session of a programme already bought is part of that purchase, and so opens
        // no new right of withdrawal; a token that names no such package is ignored.
        const extended = await extendedPackage(tx, input, slots.length)
        if (extended === "full") return "packageFull" as const
        const extending = extended
        // Its sessions join the package's own manage page; a new order gets the fresh token.
        const rowsHash = extending ? extending.manage_token_hash : hash
        // Judged from the slots just checked, never from the client: see `earlyStartAt`.
        const earlyStart = extending ? null : earlyStartAt(input, input.offering, sorted, now)
        if (earlyStart === "missing") return "earlyStart" as const
        const pkg =
          extending ??
          (offering.sessions > 1
            ? await tx.booking.packages.create({
                offering: input.offering,
                customerEmail: input.customer.email,
                sessionsTotal: offering.sessions,
                manageTokenHash: hash,
                createdAt,
              })
            : null)
        const ids: number[] = []
        for (const slot of slots) {
          const { id } = await tx.booking.create({
            offering: input.offering,
            kind: "instant",
            status: "confirmed",
            audience: input.audience,
            customerName: input.customer.name,
            customerEmail: input.customer.email,
            organisation: input.customer.organisation || null,
            phone: input.customer.phone || null,
            location: input.location,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            notes: input.notes || null,
            preferredDates: "[]",
            attendees: null,
            venue: null,
            packageId: pkg?.id ?? null,
            groupEventId: null,
            manageTokenHash: rowsHash,
            ipHash: context.clientId,
            locale,
            createdAt,
            termsVersion: TERMS_VERSION,
            termsAcceptedAt: createdAt,
            earlyStartRequestedAt: earlyStart,
          })
          ids.push(id)
        }
        const reference = bookingReference(ids[0] as number)
        const manageUrl = manageUrlFor(
          context.wwwUrl,
          extending && input.manageToken ? input.manageToken : token
        )
        const label = offeringLabel(input.offering, locale)
        const [firstSlot, ...rest] = slots
        await enqueueMail(
          context.enqueue,
          "bookingConfirmed",
          input.customer.email,
          {
            reference,
            offeringLabel: label,
            when: formatWhen(
              (firstSlot as BookingSlot).startsAt,
              (firstSlot as BookingSlot).endsAt,
              locale
            ),
            where: formatWhere(input.location, locale),
            manageUrl,
            name: input.customer.name,
            extraSessions: rest.length
              ? rest.map((s) => formatWhen(s.startsAt, s.endsAt, locale))
              : undefined,
            cancelCutoffHours: BOOKING_CANCEL_CUTOFF_HOURS,
            memberBookingUrl: memberBookingUrlFor(context.wwwUrl, input.offering),
            ...termsMailProps(
              input.audience,
              locale,
              earlyStart !== null,
              !extending && opensNewContract(input.offering)
            ),
          },
          { tx, locale, replyTo: context.bookingEmail }
        )
        await enqueueMail(
          context.enqueue,
          "bookingNew",
          context.bookingEmail,
          newBookingMailProps({
            reference,
            offering: input.offering,
            kind: "instant",
            customer: input.customer,
            audience: input.audience,
            location: input.location,
            slots,
            message: input.notes,
            adminUrl: `${context.authUrl}/admin/bookings/${ids[0]}`,
          }),
          { tx, replyTo: input.customer.email }
        )
        const sessionsBooked = extending
          ? await tx.booking.packages.sessionsBooked(extending.id)
          : ids.length
        return { ids, pkg, reference, manageUrl, rowsHash, sessionsBooked }
      })
      if (result === "taken") {
        throw errors.CONFLICT({ message: apiMessage(context, "bookingSlotTaken") })
      }
      if (result === "earlyStart") {
        throw errors.BAD_REQUEST({
          message: apiMessage(context, "bookingEarlyStart"),
          data: { field: BOOKING_EARLY_START_FIELD },
        })
      }
      if (result === "packageFull") {
        throw errors.BAD_REQUEST({
          message: apiMessage(context, "bookingPackageFull"),
          data: { field: BOOKING_PACKAGE_FULL_FIELD },
        })
      }
      const rows = await context.db.booking.byToken(result.rowsHash)
      return {
        reference: result.reference,
        manageUrl: result.manageUrl,
        bookings: rows.map((row) => toBookingSummary(row, now)),
        package: result.pkg
          ? {
              offering: input.offering,
              sessionsTotal: offering.sessions,
              sessionsBooked: result.sessionsBooked,
            }
          : null,
      }
    }),

    reserve: api.booking.reserve.handler(async ({ input, context, errors }) => {
      await bookingLimits(context, input.customer.email)
      const now = context.now()
      const locale = context.requestedLocale ?? DEFAULT_LOCALE
      const { token, hash } = newManageToken()
      const createdAt = now.toISOString()
      const eventIds = [...new Set(input.eventIds)].sort((a, b) => a - b)
      const outcome = await context.db.transaction(async (tx) => {
        const events: GroupEventWithSeats[] = []
        for (const id of eventIds) {
          // Lock each event row before counting its seats: two reservations serialise here.
          if (!(await tx.booking.events.lock(id))) return "missing" as const
          const event = await tx.booking.events.find(id)
          if (event?.status !== "scheduled" || Date.parse(event.starts_at) <= now.getTime()) {
            return "missing" as const
          }
          if (event.seats_taken >= event.capacity) return "full" as const
          events.push(event)
        }
        // One reservation, one offering: events of different offerings are never booked together.
        if (new Set(events.map((e) => e.offering)).size > 1) return "missing" as const
        const earlyStart = earlyStartAt(
          input,
          (events[0] as GroupEventWithSeats).offering,
          events.map((e) => e.starts_at),
          now
        )
        if (earlyStart === "missing") return "earlyStart" as const
        const ids: number[] = []
        for (const event of events) {
          const { id } = await tx.booking.create({
            offering: event.offering,
            kind: "group",
            status: "confirmed",
            audience: input.audience,
            customerName: input.customer.name,
            customerEmail: input.customer.email,
            organisation: input.customer.organisation || null,
            phone: input.customer.phone || null,
            location: event.location,
            startsAt: event.starts_at,
            endsAt: event.ends_at,
            notes: input.notes || null,
            preferredDates: "[]",
            attendees: null,
            venue: null,
            packageId: null,
            groupEventId: event.id,
            manageTokenHash: hash,
            ipHash: context.clientId,
            locale,
            createdAt,
            termsVersion: TERMS_VERSION,
            termsAcceptedAt: createdAt,
            earlyStartRequestedAt: earlyStart,
          })
          ids.push(id)
        }
        const reference = bookingReference(ids[0] as number)
        const manageUrl = manageUrlFor(context.wwwUrl, token)
        const [first, ...rest] = events
        const firstEvent = first as GroupEventWithSeats
        await enqueueMail(
          context.enqueue,
          "bookingConfirmed",
          input.customer.email,
          {
            reference,
            offeringLabel: firstEvent.title,
            when: formatWhen(firstEvent.starts_at, firstEvent.ends_at, locale),
            where: formatWhere(firstEvent.location, locale),
            manageUrl,
            name: input.customer.name,
            extraSessions: rest.length
              ? rest.map((e) => `${e.title}: ${formatWhen(e.starts_at, e.ends_at, locale)}`)
              : undefined,
            cancelCutoffHours: BOOKING_CANCEL_CUTOFF_HOURS,
            ...termsMailProps(
              input.audience,
              locale,
              earlyStart !== null,
              opensNewContract(firstEvent.offering)
            ),
          },
          { tx, locale, replyTo: context.bookingEmail }
        )
        await enqueueMail(
          context.enqueue,
          "bookingNew",
          context.bookingEmail,
          newBookingMailProps({
            reference,
            offering: firstEvent.offering,
            kind: "group",
            eventTitle: firstEvent.title,
            customer: input.customer,
            audience: input.audience,
            location: firstEvent.location,
            slots: events.map((e) => ({ startsAt: e.starts_at, endsAt: e.ends_at })),
            message: input.notes,
            adminUrl: `${context.authUrl}/admin/bookings/${ids[0]}`,
          }),
          { tx, replyTo: input.customer.email }
        )
        return { reference, manageUrl }
      })
      if (outcome === "missing") throw errors.NOT_FOUND()
      if (outcome === "earlyStart") {
        throw errors.BAD_REQUEST({
          message: apiMessage(context, "bookingEarlyStart"),
          data: { field: BOOKING_EARLY_START_FIELD },
        })
      }
      if (outcome === "full")
        throw errors.CONFLICT({ message: apiMessage(context, "bookingSeatsFull") })
      const rows = await context.db.booking.byToken(hash)
      return {
        reference: outcome.reference,
        manageUrl: outcome.manageUrl,
        bookings: rows.map((row) => toBookingSummary(row, now)),
        package: null,
      }
    }),

    request: api.booking.request.handler(async ({ input, context }) => {
      await bookingLimits(context, input.customer.email)
      const now = context.now()
      const locale = context.requestedLocale ?? DEFAULT_LOCALE
      const { token, hash } = newManageToken()
      const { reference, manageUrl } = await context.db.transaction(async (tx) => {
        const { id } = await tx.booking.create({
          offering: input.offering,
          kind: "request",
          status: "pending",
          audience: "organisation",
          customerName: input.customer.name,
          customerEmail: input.customer.email,
          organisation: input.customer.organisation,
          phone: input.customer.phone || null,
          location: input.location,
          startsAt: null,
          endsAt: null,
          notes: input.message,
          preferredDates: JSON.stringify(input.preferredDates),
          attendees: input.attendees ?? null,
          venue: input.venue || null,
          packageId: null,
          groupEventId: null,
          manageTokenHash: hash,
          ipHash: context.clientId,
          locale,
          createdAt: now.toISOString(),
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: now.toISOString(),
          // A request is always an organisation's: no right of withdrawal to start within.
          earlyStartRequestedAt: null,
        })
        const reference = bookingReference(id)
        const manageUrl = manageUrlFor(context.wwwUrl, token)
        await enqueueMail(
          context.enqueue,
          "bookingRequestReceived",
          input.customer.email,
          {
            reference,
            offeringLabel: offeringLabel(input.offering, locale),
            manageUrl,
            name: input.customer.name,
            // Every request kind is an organisation's: the terms, never the right of withdrawal.
            termsUrl: termsUrlFor(locale),
          },
          { tx, locale, replyTo: context.bookingEmail }
        )
        await enqueueMail(
          context.enqueue,
          "bookingNew",
          context.bookingEmail,
          newBookingMailProps({
            reference,
            offering: input.offering,
            kind: "request",
            customer: input.customer,
            audience: "organisation",
            location: input.location,
            preferredDates: input.preferredDates,
            attendees: input.attendees,
            venue: input.venue,
            message: input.message,
            adminUrl: `${context.authUrl}/admin/bookings/${id}`,
          }),
          { tx, replyTo: input.customer.email }
        )
        return { reference, manageUrl }
      })
      return { reference, manageUrl }
    }),

    manage: {
      // Reads are throttled per client only (a token is 256 bits; the limiter is for scrapers).
      get: api.booking.manage.get.handler(async ({ input, context, errors }) => {
        const hit = await context.bookingLimiter.hit(
          `booking-manage:${context.clientId ?? "unknown"}`
        )
        if (!hit.allowed)
          throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "bookingRate") })
        const hash = tokenHash(input.token)
        const [rows, pkg] = await Promise.all([
          context.db.booking.byToken(hash),
          context.db.booking.packages.byToken(hash),
        ])
        const first = rows[0]
        if (!first) throw errors.NOT_FOUND({ message: apiMessage(context, "bookingNotFound") })
        const now = context.now()
        return {
          customer: {
            name: first.customer_name,
            email: first.customer_email,
            organisation: first.organisation,
          },
          bookings: rows.map((row) => toBookingSummary(row, now)),
          package: pkg
            ? {
                offering: pkg.offering,
                sessionsTotal: pkg.sessions_total,
                sessionsBooked: await context.db.booking.packages.sessionsBooked(pkg.id),
              }
            : null,
        }
      }),

      cancel: api.booking.manage.cancel.handler(async ({ input, context, errors }) => {
        const hit = await context.bookingLimiter.hit(
          `booking-manage:${context.clientId ?? "unknown"}`
        )
        if (!hit.allowed)
          throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "bookingRate") })
        const hash = tokenHash(input.token)
        const now = context.now()
        const outcome = await context.db.transaction(async (tx) => {
          const row = await tx.booking.find(input.bookingId)
          if (!row || row.manage_token_hash !== hash) return "missing" as const
          if (!cancellableAt(row, now)) return "late" as const
          if (
            !(await tx.booking.cancel({
              id: row.id,
              adminNote: null,
              by: null,
              at: now.toISOString(),
            }))
          )
            return "late" as const
          const locale = isLocale(row.locale) ? row.locale : DEFAULT_LOCALE
          const basics = mailBasics(row, locale)
          await enqueueMail(
            context.enqueue,
            "bookingCancelled",
            row.customer_email,
            { ...basics, when: basics.when ?? "", byCustomer: true },
            { tx, locale, replyTo: context.bookingEmail }
          )
          await enqueueMail(
            context.enqueue,
            "bookingNew",
            context.bookingEmail,
            {
              ...newBookingMailProps({
                reference: basics.reference,
                offering: row.offering,
                kind: row.kind,
                customer: {
                  name: row.customer_name,
                  email: row.customer_email,
                  organisation: row.organisation ?? undefined,
                  phone: row.phone ?? undefined,
                },
                audience: row.audience,
                location: row.location,
                slots:
                  row.starts_at && row.ends_at
                    ? [{ startsAt: row.starts_at, endsAt: row.ends_at }]
                    : [],
                eventTitle: row.group_event_title ?? undefined,
                message: `Cancelled by the customer from the manage link.`,
                adminUrl: `${context.authUrl}/admin/bookings/${row.id}`,
              }),
              offeringLabel: `Cancelled: ${row.group_event_title ?? OFFERINGS[row.offering].label}`,
            },
            { tx, replyTo: row.customer_email }
          )
          return "ok" as const
        })
        if (outcome === "missing")
          throw errors.NOT_FOUND({ message: apiMessage(context, "bookingNotFound") })
        if (outcome === "late")
          throw errors.CONFLICT({
            message: apiMessage(context, "bookingCancelLate", {
              hours: BOOKING_CANCEL_CUTOFF_HOURS,
            }),
          })
        return { ok: true as const }
      }),
    },
  },
  jobs: {
    // Anonymous like `support.create` (service token only). All three limits run before anything
    // is read or stored; then the CV is checked as a PDF, written, and the row and both mails
    // commit together (see `submitApplication`).
    apply: api.jobs.apply.handler(async ({ input, context, errors }) => {
      const perClient = await context.jobsLimiter.hit(`jobs:${context.clientId ?? "unknown"}`)
      if (!perClient.allowed)
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "jobsRate") })
      const perRecipient = await context.jobsRecipientLimiter.hit(
        `jobs-to:${normalizeEmail(input.email)}`
      )
      if (!perRecipient.allowed)
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "jobsRate") })
      const global = await context.jobsGlobalLimiter.hit("jobs:global")
      if (!global.allowed) {
        context.noteCapTripped("jobs:global")
        throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "jobsRate") })
      }
      return submitApplication(context, input)
    }),
  },
  analytics: {
    // A tripped limiter answers success without storing anything — like telemetry's route layer,
    // but here in the procedure itself, so a flooding caller never learns it was throttled.
    ingest: api.analytics.ingest.handler(async ({ input, context, errors }) => {
      const clientOk = (
        await context.analyticsLimiter.hit(`analytics:${context.clientId ?? "unknown"}`)
      ).allowed
      const appOk = (await context.analyticsAppLimiter.hit(`analytics-app:${input.app}`)).allowed
      if (!appOk) context.noteCapTripped(`analytics-app:${input.app}`)
      if (!clientOk || !appOk) return

      const now = new Date()
      const day = now.toISOString().slice(0, 10)
      const visitor =
        input.ip && input.userAgent
          ? visitorId(await context.db.analytics.saltFor(day), input.app, input.ip, input.userAgent)
          : null

      const shaped = shapeIngest(input, visitor)
      if (!shaped) throw errors.BAD_REQUEST({ message: "Invalid analytics event" })

      if (shaped.kind === "pageview") {
        await context.db.analytics.insertPageview({
          app: shaped.app,
          path: shaped.path,
          referrerHost: shaped.referrerHost,
          visitorId: shaped.visitorId,
          userId: shaped.userId,
          workspaceId: shaped.workspaceId,
          day,
          createdAt: now.toISOString(),
        })
      } else {
        await context.db.analytics.insertEvent({
          name: shaped.name,
          source: shaped.source,
          props: shaped.props,
          visitorId: shaped.visitorId,
          userId: shaped.userId,
          workspaceId: shaped.workspaceId,
          day,
          createdAt: now.toISOString(),
        })
      }
      // The row is already committed: a failure to enqueue its forward (a database hiccup) must
      // not fail ingest, which has nothing to do with the provider. This one row's forward is
      // lost (nothing else enqueues it), but that is better than an ingest call — every caller
      // already treats a tripped limiter as success — answering an error over a reporting detail.
      if (context.analytics.kind !== "store") {
        await context
          .enqueue(
            analyticsForwardJob,
            toForwardItem(shaped, now.toISOString(), crypto.randomUUID())
          )
          .catch((error) => context.recordFailure("analytics.forward enqueue failed", error))
      }
    }),
  },
  telemetry: {
    // The route handlers already stamped `app` and keyed the client id per browser; here the
    // limiter is the defence against a page that floods its own app.
    ingest: api.telemetry.ingest.handler(async ({ input, context, errors }) => {
      // The Next routes send `telemetry:<ip hash>` per browser. Without a visible ip they send
      // `telemetry:<app>`, which every browser of that app shares: limiting it per client would
      // drop normal traffic, so it falls to the per-app cap below alone.
      const id = context.clientId ?? "unknown"
      if (id !== `telemetry:${input.app}`) {
        const limit = await context.telemetryLimiter.hit(
          id.startsWith("telemetry:") ? id : `telemetry:${id}`
        )
        if (!limit.allowed) throw errors.TOO_MANY_REQUESTS()
      }
      // Rotating client ids (one per browser ip) cannot get past this one.
      const perApp = await context.telemetryAppLimiter.hit(`telemetry:app:${input.app}`)
      if (!perApp.allowed) {
        // The Next route answers 204 whatever happens: without this, a whole app's telemetry
        // could drop with no trace.
        context.noteCapTripped(`telemetry:app:${input.app}`)
        throw errors.TOO_MANY_REQUESTS()
      }
      await recordBatch(
        { db: context.db, provider: context.telemetry, enqueue: context.enqueue, log: context.log },
        input
      )
    }),
  },
  admin: {
    metrics: adminApi.admin.metrics.handler(async ({ context }) => {
      const now = Date.now()
      const iso = (ms: number) => new Date(ms).toISOString()
      const counts = await context.db.admin.counts(
        iso(now),
        iso(now - 7 * 24 * 60 * 60_000),
        iso(now - 30 * 24 * 60 * 60_000)
      )
      const byPlan = { free: 0, pro: 0, team: 0 }
      let pastDueWorkspaces = 0
      for (const row of await context.db.admin.planCounts()) {
        if (row.plan === "pro" || row.plan === "team" || row.plan === "free") {
          byPlan[row.plan] += Number(row.n)
        }
        pastDueWorkspaces += Number(row.past_due)
      }
      const waitlist = await context.db.waitlist.count()
      const activeSessions = await context.db.sessions.countLive(iso(now))
      return { ...counts, workspacesByPlan: byPlan, pastDueWorkspaces, waitlist, activeSessions }
    }),

    users: {
      list: adminApi.admin.users.list.handler(async ({ input, context }) => {
        // The api's own clock, the one enforcement reads: the badge, the filter and the sign-in
        // refusal always agree on whether a suspension is in force.
        const now = context.now().toISOString()
        const rows = await context.db.admin.listUsers({
          ...input,
          suspended: input.suspended === "true",
          now,
          limit: input.limit + 1,
        })
        const { items, nextCursor } = page(rows, input.limit)
        const providers = await context.db.admin.providersFor(items.map((u) => u.id))
        return {
          items: items.map((row) =>
            toAdminUser(
              row,
              providers.filter((p) => p.user_id === row.id).map((p) => p.provider),
              context.superadminEmails,
              context.fileUrl,
              now
            )
          ),
          nextCursor,
        }
      }),

      get: adminApi.admin.users.get.handler(async ({ input, context, errors }) => {
        const row = await context.db.admin.findUser(input.id)
        if (!row) throw errors.NOT_FOUND()
        const providers = (await context.db.identities.listForUser(row.id)).map((i) => i.provider)
        const memberships = await context.db.admin.membershipsForUser(row.id)
        const now = context.now().toISOString()
        const count = await context.db.sessions.countLiveForUser(row.id, now)
        const lastSeenAt = await context.db.sessions.lastSeenForUser(row.id)
        const impersonations = await context.db.audit.countImpersonationsOf(row.id)
        const auditRows = await context.db.audit.listForUser(row.id, 20)
        return {
          ...toAdminUser(row, providers, context.superadminEmails, context.fileUrl, now),
          twoFactorEnabled: row.two_factor_enabled_at !== null,
          deletionScheduledAt: row.deletion_scheduled_at,
          memberships: memberships.map((m) => ({
            workspace: { id: m.workspace_id, name: m.name, slug: m.slug },
            role: m.role,
            plan: planOf(m.sub_plan, m.sub_status),
          })),
          sessions: { count, lastSeenAt, impersonations },
          audit: auditRows.map(toAuditEntry),
        }
      }),

      revokeSessions: adminApi.admin.users.revokeSessions.handler(
        async ({ input, context, errors }) => {
          const target = await context.db.users.find(input.id)
          if (!target) throw errors.NOT_FOUND()
          // Every impersonation this ends is on the record: those acting as the target (deleted
          // with the target's sessions) and, when the target is an admin, those they drive.
          const impersonations = await context.db.sessions.listImpersonationsOf(
            target.id,
            new Date().toISOString()
          )
          const driven = await context.db.sessions.deleteImpersonationsBy(target.id)
          // And any sign-in waiting at its two-factor step, so "everywhere" means everywhere.
          await context.db.users.revokeSessions(target.id, new Date().toISOString())
          for (const row of impersonations) {
            await audit(context, {
              action: "impersonation.stopped",
              targetType: "user",
              targetId: target.id,
              metadata: { via: "sessions_revoked", impersonatedBy: row.impersonated_by },
            })
          }
          for (const row of driven) {
            await audit(context, {
              action: "impersonation.stopped",
              targetType: "user",
              targetId: row.user_id,
              metadata: { via: "admin_sessions_revoked", impersonatedBy: target.id },
            })
          }
          await audit(context, {
            action: "user.sessions_revoked",
            targetType: "user",
            targetId: target.id,
          })
          return { ok: true as const }
        }
      ),

      // Order: the refusals an admin can see at once, then the limiter, then the work.
      impersonate: adminApi.admin.users.impersonate.handler(async ({ input, context, errors }) => {
        const admin = context.user
        if (input.id === admin.id) throw errors.FORBIDDEN({ message: SELF_TARGET_MESSAGE })
        const target = await context.db.users.find(input.id)
        if (!target) throw errors.NOT_FOUND()
        if (isSuperadmin(target, context.superadminEmails)) {
          throw errors.FORBIDDEN({ message: SUPERADMIN_TARGET_MESSAGE })
        }
        // Its session would be refused on every request anyway (`resolveSession`): say why now.
        if (isSuspended(target, context.now()))
          throw errors.FORBIDDEN({ message: SUSPENDED_TARGET_MESSAGE })
        const limit = await context.impersonateLimiter.hit(`impersonate:${admin.id}`)
        if (!limit.allowed) throw errors.TOO_MANY_REQUESTS()
        // One live impersonation per admin: an earlier one ends here, on the record.
        for (const replaced of await context.db.sessions.deleteImpersonationsBy(admin.id)) {
          await audit(
            context,
            { action: "impersonation.replaced", targetType: "user", targetId: replaced.user_id },
            input.client
          )
        }
        const { session } = await issueSession(context, target, input.client, {
          impersonatedBy: admin.id,
          reason: input.reason,
          ttlMs: IMPERSONATION_TTL_MS,
        })
        await audit(
          context,
          {
            action: "impersonation.started",
            targetType: "user",
            targetId: target.id,
            reason: input.reason,
          },
          input.client
        )
        const passkeyCount = await context.db.passkeys.countForUser(target.id)
        return {
          ...session,
          user: toUser(target, context.superadminEmails, context.fileUrl, passkeyCount),
        }
      }),

      // Lost-phone recovery: turns 2FA off, ends every session (so the next sign-in needs just a
      // password) and kills any outstanding challenge. Same self/superadmin refusals, and the same
      // shape of per-admin limiter, as impersonate (shared with removePasskeys below as
      // `loadAdminTarget`).
      resetTwoFactor: adminApi.admin.users.resetTwoFactor.handler(
        async ({ input, context, errors }) => {
          const admin = context.user
          const target = await loadAdminTarget(
            context,
            errors,
            input.userId,
            SELF_RESET_MESSAGE,
            SUPERADMIN_RESET_MESSAGE
          )
          if (!target.two_factor_enabled_at) throw errors.CONFLICT()
          const limit = await context.resetTwoFactorLimiter.hit(`reset2fa:${admin.id}`)
          if (!limit.allowed) throw errors.TOO_MANY_REQUESTS()
          const at = new Date().toISOString()
          await context.db.twoFactor.disable(target.id)
          await context.db.users.revokeSessions(target.id, at)
          await audit(context, {
            action: "user.two_factor_reset",
            targetType: "user",
            targetId: target.id,
            reason: input.reason,
          })
          await enqueueMail(
            context.enqueue,
            "twoFactorReset",
            target.email,
            { name: target.name || undefined, accountUrl: context.accountUrl },
            { locale: userLocale(target) }
          )
          return { ok: true as const }
        }
      ),

      // Lost-device recovery for passkeys: unlike the user's own `account.passkeys.delete`, the
      // last-way-in rule does not apply here — an admin removing every passkey never locks the
      // account out (a magic link to its verified email, or a password, still gets them back in),
      // it just ends the shortcut. Same self/superadmin refusals and admin-limiter shape as
      // resetTwoFactor (`loadAdminTarget`); mails `passkeysRemoved`, the admin-initiated wording,
      // not the self-service `passkeyRemoved` a user's own delete sends.
      removePasskeys: adminApi.admin.users.removePasskeys.handler(
        async ({ input, context, errors }) => {
          const admin = context.user
          const target = await loadAdminTarget(
            context,
            errors,
            input.userId,
            SELF_REMOVE_PASSKEYS_MESSAGE,
            SUPERADMIN_REMOVE_PASSKEYS_MESSAGE
          )
          const limit = await context.removePasskeysLimiter.hit(`removepasskeys:${admin.id}`)
          if (!limit.allowed) throw errors.TOO_MANY_REQUESTS()
          const at = new Date().toISOString()
          // One transaction, the user row locked first (the order `auth.passkey.verify` takes to
          // record a use and issue its session): a sign-in that committed before this lock has its
          // session deleted below, and one still waiting for the lock finds no passkey to record a
          // use on once this commits — no session outlives the removal on either engine.
          await context.db.transaction(async (tx) => {
            await tx.users.lockForSession(target.id)
            await tx.passkeys.deleteAllForUser(target.id)
            await tx.tokens.invalidateForUser(target.id, "passkey_challenge", at)
            await tx.users.revokeSessionsInTransaction(target.id, at)
          })
          await audit(context, {
            action: "user.passkeys_removed",
            targetType: "user",
            targetId: target.id,
            reason: input.reason,
          })
          await enqueueMail(
            context.enqueue,
            "passkeysRemoved",
            target.email,
            {
              name: target.name || undefined,
              accountUrl: context.accountUrl,
              hasPassword: target.password_hash !== null,
            },
            { locale: userLocale(target) }
          )
          return { ok: true as const }
        }
      ),

      // Suspends an account from signing in — never deletes anything, never touches a workspace
      // (the refusal itself lives in the sign-in paths and `resolveSession`). Same self/superadmin
      // refusals and user-row lock as resetTwoFactor and removePasskeys (`loadAdminTarget`).
      // Re-suspending an account whose suspension is still in force updates the reason and end
      // date in place — audited as an update, not a fresh suspension — and mails the user again
      // only when the end date changed, never for a reason-only edit; over an expired record it is
      // a fresh suspension, audited and mailed as one. The mail (enqueued in the transaction, like
      // every mail of a flow that must not outrun its own write) never carries the reason or this
      // admin's identity — see `accountSuspended`.
      suspend: adminApi.admin.users.suspend.handler(async ({ input, context, errors }) => {
        const admin = context.user
        const target = await loadAdminTarget(
          context,
          errors,
          input.userId,
          SELF_SUSPEND_MESSAGE,
          SUPERADMIN_SUSPEND_MESSAGE
        )
        // One clock for validation, the stamp and enforcement (`isSuspended` at `context.now()`).
        const now = context.now()
        if (input.until !== undefined) {
          const untilMs = Date.parse(input.until)
          const nowMs = now.getTime()
          // Inclusive: an end date exactly SUSPEND_UNTIL_MAX_DAYS ahead is accepted — the admin
          // form's last pickable day converts to at most that.
          const maxMs = nowMs + SUSPEND_UNTIL_MAX_DAYS * 24 * 60 * 60_000
          if (!(untilMs > nowMs) || untilMs > maxMs) {
            throw errors.BAD_REQUEST({ message: SUSPEND_UNTIL_INVALID_MESSAGE })
          }
        }
        const limit = await context.suspendLimiter.hit(`suspend:${admin.id}`)
        if (!limit.allowed) throw errors.TOO_MANY_REQUESTS()
        const at = now.toISOString()
        // Normalised, so the stored value compares as a string like every other timestamp (the
        // list filter) and the same instant written differently is not a "changed" end date.
        const until = input.until ? new Date(input.until).toISOString() : null
        // Read under the user-row lock, so two concurrent suspends see each other: only one of
        // them is the fresh suspension that mails. An expired record counts as not suspended.
        const wasActive = await context.db.transaction(async (tx) => {
          const locked = await tx.users.lockForSession(target.id)
          const current = locked ? await tx.users.find(target.id) : undefined
          // Purged between the lookup and this lock: nothing to suspend, nobody to mail.
          if (!current) throw errors.NOT_FOUND()
          const active = isSuspended(current, now)
          const untilChanged = current.suspended_until !== until
          await tx.users.suspend(target.id, { at, until, reason: input.reason, by: admin.id })
          await tx.users.revokeSessionsInTransaction(target.id, at)
          // No second mail for a reason-only edit of a suspension still in force.
          if (!active || untilChanged) {
            await enqueueMail(
              context.enqueue,
              "accountSuspended",
              current.email,
              { name: current.name || undefined, until },
              { tx, locale: userLocale(current) }
            )
          }
          return active
        })
        await audit(context, {
          action: wasActive ? "user.suspension_updated" : "user.suspended",
          targetType: "user",
          targetId: target.id,
          reason: input.reason,
          metadata: { until },
        })
        return { ok: true as const }
      }),

      // Lifts a suspension. A no-op success — no audit, no mail, no limiter hit — when the
      // account was never suspended; an expired-but-uncleared suspension (one `isSuspended` would
      // already call false) is not "never suspended": it still gets its columns cleared, audited
      // and mailed, same as lifting a live one. Same self/superadmin refusals as suspend.
      unsuspend: adminApi.admin.users.unsuspend.handler(async ({ input, context, errors }) => {
        const admin = context.user
        const target = await loadAdminTarget(
          context,
          errors,
          input.userId,
          SELF_SUSPEND_MESSAGE,
          SUPERADMIN_SUSPEND_MESSAGE
        )
        if (target.suspended_at === null) return { ok: true as const }
        const limit = await context.suspendLimiter.hit(`suspend:${admin.id}`)
        if (!limit.allowed) throw errors.TOO_MANY_REQUESTS()
        await context.db.transaction(async (tx) => {
          // Purged between the lookup and this lock: no mail to a gone address, no audit row.
          if (!(await tx.users.lockForSession(target.id))) throw errors.NOT_FOUND()
          await tx.users.unsuspend(target.id)
          await enqueueMail(
            context.enqueue,
            "accountUnsuspended",
            target.email,
            { name: target.name || undefined },
            { tx, locale: userLocale(target) }
          )
        })
        await audit(context, {
          action: "user.unsuspended",
          targetType: "user",
          targetId: target.id,
          reason: input.reason,
        })
        return { ok: true as const }
      }),
    },

    // Called with the impersonation token itself (plain `authed`): the user's browser is the one
    // holding it. Any other session — including the admin's own — sees NOT_FOUND.
    stopImpersonation: authed.admin.stopImpersonation.handler(async ({ context, errors }) => {
      if (!context.impersonating) throw errors.NOT_FOUND()
      await context.db.sessions.delete({ id: context.session.id, userId: context.user.id })
      await audit(context, {
        action: "impersonation.stopped",
        targetType: "user",
        targetId: context.user.id,
        metadata: { via: "stop" },
      })
      return { ok: true as const }
    }),

    workspaces: {
      list: adminApi.admin.workspaces.list.handler(async ({ input, context }) => {
        const rows = await context.db.admin.listWorkspaces({ ...input, limit: input.limit + 1 })
        const { items, nextCursor } = page(rows, input.limit)
        const owners = await context.db.admin.ownersFor(items.map((w) => w.id))
        return {
          items: items.map((row) =>
            toAdminWorkspace(
              row,
              owners
                .filter((o) => o.workspace_id === row.id)
                .map(({ id, email }) => ({ id, email })),
              context.fileUrl
            )
          ),
          nextCursor,
        }
      }),

      get: adminApi.admin.workspaces.get.handler(async ({ input, context, errors }) => {
        const row = await context.db.admin.findWorkspace(input.id)
        if (!row) throw errors.NOT_FOUND()
        const members = await context.db.memberships.list(row.id)
        const subscription = await context.db.billing.subscriptions.latest(row.id)
        const auditRows = await context.db.audit.listForTarget("workspace", String(row.id), 20)
        return {
          ...toAdminWorkspace(
            row,
            members
              .filter((m) => m.role === "owner")
              .map((m) => ({ id: m.user_id, email: m.email })),
            context.fileUrl
          ),
          members: members.map((m) => ({ userId: m.user_id, email: m.email, role: m.role })),
          billing: subscription
            ? {
                provider: subscription.provider,
                subscriptionId: subscription.subscription_id,
                status: subscription.status,
                interval: subscription.interval,
                currentPeriodEnd: subscription.current_period_end,
              }
            : null,
          audit: auditRows.map(toAuditEntry),
        }
      }),
    },

    audit: {
      list: adminApi.admin.audit.list.handler(async ({ input, context }) => {
        const rows = await context.db.audit.list({ ...input, limit: input.limit + 1 })
        const { items, nextCursor } = page(rows, input.limit)
        return {
          items: items.map(toAuditEntry),
          nextCursor,
          retention: {
            piiDays: context.auditPiiRetentionDays,
            rowDays: context.auditRetentionDays,
          },
        }
      }),

      // Selects one row past the cap (a CONFLICT over a truncated file), then builds the file,
      // then audits the export itself — never inside the file it describes, and never when the
      // request was refused above (`loadAdminTarget`-style early returns via `errors.*` all throw
      // before this point is reached).
      export: adminApi.admin.audit.export.handler(async ({ input, context, errors }) => {
        const admin = context.user
        // Clock-dependent, so the schema itself cannot refuse it (it has no injectable server
        // clock): checked before the limiter, like `suspend`'s own "until" check, so a doomed
        // request never spends a rate-limit slot.
        if (!isToWithinBounds(input.to, context.now())) {
          throw errors.BAD_REQUEST({ message: AUDIT_EXPORT_DATE_MESSAGE })
        }
        const limit = await context.auditExportLimiter.hit(`audit-export:${admin.id}`)
        if (!limit.allowed) throw errors.TOO_MANY_REQUESTS()
        const { fromIso, toExclusiveIso } = auditExportRange(input.from, input.to)
        const cap = context.auditExportMaxRows
        // One query, `limit: cap + 1`: a row count over the cap refuses with CONFLICT rather than
        // returning a truncated file. A separate COUNT(*) first (and a second, later select)
        // could disagree if a row landed in between — this can't.
        const rows = await context.db.audit.listForExport({
          fromIso,
          toExclusiveIso,
          actorId: input.actorId,
          targetType: input.targetType,
          targetId: input.targetId,
          limit: cap + 1,
        })
        if (rows.length > cap) {
          throw errors.CONFLICT({ message: auditExportCapMessage(cap) })
        }
        const body = input.format === "csv" ? toCsv(rows) : toJsonl(rows)
        const contentType =
          input.format === "csv" ? "text/csv; charset=utf-8" : "application/x-ndjson"
        const file = new File([body], `audit-${input.from}-${input.to}.${input.format}`, {
          type: contentType,
        })
        await audit(context, {
          action: "audit.exported",
          metadata: {
            from: input.from,
            to: input.to,
            format: input.format,
            rows: rows.length,
            ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
            ...(input.targetType === undefined ? {} : { targetType: input.targetType }),
            ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
          },
        })
        return file
      }),
    },
    jobs: {
      list: adminApi.admin.jobs.list.handler(async ({ context }) => {
        const counts = await context.db.jobs.counts()
        const dead = await context.db.jobs.listDead(20)
        return {
          counts: { queued: counts.queued, running: counts.running, dead: counts.dead },
          dead: dead.map(toAdminJob),
        }
      }),

      // A dead row can share its dedupe key with a newer queued/running one (the job ran again
      // after this one died): resurrecting it then collides with that live row's unique index —
      // a CONFLICT the admin can retry once that newer copy clears, not a 500.
      retry: adminApi.admin.jobs.retry.handler(async ({ input, context, errors }) => {
        let resurrected: boolean
        try {
          resurrected = await context.db.jobs.resurrect(input.id, new Date().toISOString())
        } catch (error) {
          if (isDedupeConflict(error)) {
            throw errors.CONFLICT({ message: JOB_RETRY_CONFLICT_MESSAGE })
          }
          throw error
        }
        if (!resurrected) throw errors.NOT_FOUND()
        await audit(context, { action: "job.retried", targetType: "job", targetId: input.id })
        return { ok: true as const }
      }),

      discard: adminApi.admin.jobs.discard.handler(async ({ input, context, errors }) => {
        if (!(await context.db.jobs.discard(input.id))) throw errors.NOT_FOUND()
        await audit(context, { action: "job.discarded", targetType: "job", targetId: input.id })
        return { ok: true as const }
      }),
    },
    support: {
      list: adminApi.admin.support.list.handler(async ({ input, context }) => {
        const rows = await context.db.support.list({
          ...input,
          limit: ADMIN_SUPPORT_PAGE_SIZE + 1,
        })
        const { items, nextCursor } = page(rows, ADMIN_SUPPORT_PAGE_SIZE)
        return { items: items.map(toSupportRequest), nextCursor }
      }),

      resolve: adminApi.admin.support.resolve.handler(async ({ input, context, errors }) => {
        const resolvedAt = new Date().toISOString()
        const resolved = await context.db.support.resolve(input.id, context.user.id, resolvedAt)
        if (!resolved) {
          // Zero rows: either the id doesn't exist (NOT_FOUND), or it's already resolved — a
          // no-op success with no re-stamp and no second audit row, so a stale admin tab cannot
          // overwrite who really resolved it.
          if (!(await context.db.support.find(input.id))) throw errors.NOT_FOUND()
          return { ok: true as const }
        }
        await audit(context, {
          action: "support.resolved",
          targetType: "support",
          targetId: input.id,
        })
        return { ok: true as const }
      }),

      reopen: adminApi.admin.support.reopen.handler(async ({ input, context, errors }) => {
        const reopened = await context.db.support.reopen(input.id)
        if (!reopened) {
          // Same no-op rule as resolve: zero rows on an id that exists means it's already open.
          if (!(await context.db.support.find(input.id))) throw errors.NOT_FOUND()
          return { ok: true as const }
        }
        await audit(context, {
          action: "support.reopened",
          targetType: "support",
          targetId: input.id,
        })
        return { ok: true as const }
      }),
    },
    leads: {
      list: adminApi.admin.leads.list.handler(async ({ input, context }) => {
        const rows = await context.db.leads.list({
          status: input.status === "all" ? undefined : input.status,
          cursor: input.cursor,
          limit: ADMIN_LEADS_PAGE_SIZE + 1,
        })
        const { items, nextCursor } = page(rows, ADMIN_LEADS_PAGE_SIZE)
        return {
          items: items.map(toAdminLead),
          nextCursor,
          counts: await context.db.leads.counts(),
        }
      }),

      get: adminApi.admin.leads.get.handler(async ({ input, context, errors }) => {
        const row = await context.db.leads.find(input.id)
        if (!row) throw errors.NOT_FOUND()
        return toAdminLead(row)
      }),

      // Status and notes in one transaction, so the "from" status read here is the one the update
      // changes. Nothing changed (the same status, the same notes) is a no-op success with no
      // re-stamp and no audit row, like `admin.applications.setStatus`. The audit row says the
      // notes changed, never what they say.
      update: adminApi.admin.leads.update.handler(async ({ input, context, errors }) => {
        const changedAt = context.now().toISOString()
        const result = await context.db.transaction(async (tx) => {
          const row = await tx.leads.find(input.id)
          if (!row) return null
          const statusChanged =
            input.status !== undefined && input.status !== row.status
              ? await tx.leads.setStatus(input.id, input.status, context.user.id, changedAt)
              : false
          const notes = input.notes === undefined ? undefined : input.notes || null
          const notesChanged =
            notes !== undefined && notes !== row.notes
              ? await tx.leads.setNotes(input.id, notes)
              : false
          return { from: row.status, statusChanged, notesChanged }
        })
        if (!result) throw errors.NOT_FOUND()
        if (!result.statusChanged && !result.notesChanged) return { ok: true as const }
        await audit(context, {
          action: "lead.updated",
          targetType: "lead",
          targetId: input.id,
          metadata: {
            ...(result.statusChanged ? { from: result.from, to: input.status } : {}),
            ...(result.notesChanged ? { notes: true } : {}),
          },
        })
        return { ok: true as const }
      }),

      // On request (someone asks to be forgotten before the 12 months pass). The audit row names
      // the lead's id only: nothing the visitor typed outlives the row.
      delete: adminApi.admin.leads.delete.handler(async ({ input, context, errors }) => {
        if (!(await context.db.leads.delete(input.id))) throw errors.NOT_FOUND()
        await audit(context, { action: "lead.deleted", targetType: "lead", targetId: input.id })
        return { ok: true as const }
      }),
    },
    bookings: {
      calendar: adminApi.admin.bookings.calendar.handler(async ({ input, context }) => {
        const days = bookingDays(input.from, input.to)
        if (days.length > BOOKING_AVAILABILITY_MAX_DAYS) {
          throw new ORPCError("BAD_REQUEST", {
            message: `At most ${BOOKING_AVAILABILITY_MAX_DAYS} days per call`,
          })
        }
        const fromIso = zonedInstant(input.from, "00:00").toISOString()
        const toIso = zonedInstant(shiftBookingDay(input.to, 1), "00:00").toISOString()
        const now = context.now()
        const [bookings, events, blocks] = await Promise.all([
          context.db.booking.inRange(fromIso, toIso),
          context.db.booking.events.inRange(fromIso, toIso),
          context.db.booking.blocks.inRange(input.from, input.to),
        ])
        return {
          timezone: BOOKING_TIMEZONE,
          bookings: bookings.map((row) => toAdminBooking(row, now)),
          groupEvents: events.map(toGroupEvent),
          blocks: blocks.map(toBlock),
        }
      }),

      pending: adminApi.admin.bookings.pending.handler(async ({ context }) => {
        const rows = await context.db.booking.pending()
        const now = context.now()
        return { items: rows.map((row) => toAdminBooking(row, now)) }
      }),

      get: adminApi.admin.bookings.get.handler(async ({ input, context, errors }) => {
        const row = await context.db.booking.find(input.id)
        if (!row) throw errors.NOT_FOUND()
        return toAdminBooking(row, context.now())
      }),

      // pending → confirmed at the chosen time. The overlap check runs under the calendar lock,
      // like `booking.book`'s; the customer's mail commits with the row.
      confirm: adminApi.admin.bookings.confirm.handler(async ({ input, context, errors }) => {
        const now = context.now()
        const outcome = await context.db.transaction(async (tx) => {
          const row = await tx.booking.find(input.id)
          if (row?.status !== "pending") return "missing" as const
          await tx.booking.rules.lock()
          const minutes = input.durationMinutes ?? OFFERINGS[row.offering].durationMinutes
          const slot = { startsAt: input.startsAt, endsAt: endOf(input.startsAt, minutes) }
          const busy = await tx.booking.busy(slot.startsAt, slot.endsAt)
          if (busy.some((b) => overlaps(b, slot))) return "conflict" as const
          const location = input.location ?? row.location
          // A fresh manage link: the stored hash cannot be turned back into the first link.
          const { token, hash } = newManageToken()
          await tx.booking.rotateToken(row.id, hash)
          const confirmed = await tx.booking.confirm({
            id: row.id,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            location,
            adminNote: input.note || null,
            decidedBy: context.user.id,
            decidedAt: now.toISOString(),
          })
          if (!confirmed) return "missing" as const
          const locale = isLocale(row.locale) ? row.locale : DEFAULT_LOCALE
          await enqueueMail(
            context.enqueue,
            "bookingConfirmed",
            row.customer_email,
            {
              reference: bookingReference(row.id),
              offeringLabel: offeringLabel(row.offering, locale),
              when: formatWhen(slot.startsAt, slot.endsAt, locale),
              where: formatWhere(location, locale),
              manageUrl: manageUrlFor(context.wwwUrl, token),
              name: row.customer_name,
              cancelCutoffHours: BOOKING_CANCEL_CUTOFF_HOURS,
              ...termsMailProps(
                row.audience,
                locale,
                row.early_start_requested_at !== null,
                opensNewContract(row.offering)
              ),
            },
            { tx, locale, replyTo: context.bookingEmail }
          )
          return "ok" as const
        })
        if (outcome === "missing") throw errors.NOT_FOUND()
        if (outcome === "conflict") throw errors.CONFLICT()
        await audit(context, {
          action: "booking.confirmed",
          targetType: "booking",
          targetId: input.id,
          metadata: { startsAt: input.startsAt },
        })
        return { ok: true as const }
      }),

      decline: adminApi.admin.bookings.decline.handler(async ({ input, context, errors }) => {
        const now = context.now()
        const declined = await context.db.transaction(async (tx) => {
          const row = await tx.booking.find(input.id)
          if (!row) return false
          const ok = await tx.booking.decline({
            id: row.id,
            adminNote: input.note || null,
            decidedBy: context.user.id,
            decidedAt: now.toISOString(),
          })
          if (!ok) return false
          const locale = isLocale(row.locale) ? row.locale : DEFAULT_LOCALE
          await enqueueMail(
            context.enqueue,
            "bookingDeclined",
            row.customer_email,
            {
              reference: bookingReference(row.id),
              offeringLabel: offeringLabel(row.offering, locale),
              note: input.note || undefined,
              name: row.customer_name,
            },
            { tx, locale, replyTo: context.bookingEmail }
          )
          return true
        })
        if (!declined) throw errors.NOT_FOUND()
        await audit(context, {
          action: "booking.declined",
          targetType: "booking",
          targetId: input.id,
        })
        return { ok: true as const }
      }),

      cancel: adminApi.admin.bookings.cancel.handler(async ({ input, context, errors }) => {
        const now = context.now()
        const cancelled = await context.db.transaction(async (tx) => {
          const row = await tx.booking.find(input.id)
          if (!row) return false
          const ok = await tx.booking.cancel({
            id: row.id,
            adminNote: input.note || null,
            by: context.user.id,
            at: now.toISOString(),
          })
          if (!ok) return false
          const locale = isLocale(row.locale) ? row.locale : DEFAULT_LOCALE
          const basics = mailBasics(row, locale)
          await enqueueMail(
            context.enqueue,
            "bookingCancelled",
            row.customer_email,
            {
              ...basics,
              when: basics.when ?? "",
              byCustomer: false,
              note: input.note || undefined,
            },
            { tx, locale, replyTo: context.bookingEmail }
          )
          return true
        })
        if (!cancelled) throw errors.NOT_FOUND()
        await audit(context, {
          action: "booking.cancelled",
          targetType: "booking",
          targetId: input.id,
        })
        return { ok: true as const }
      }),

      availability: {
        get: adminApi.admin.bookings.availability.get.handler(async ({ context }) => {
          const [rules, blocks] = await Promise.all([
            context.db.booking.rules.effective(),
            context.db.booking.blocks.list(),
          ])
          return { timezone: BOOKING_TIMEZONE, rules, blocks: blocks.map(toBlock) }
        }),
        set: adminApi.admin.bookings.availability.set.handler(async ({ input, context }) => {
          await context.db.transaction((tx) => tx.booking.rules.replace(input.rules))
          await audit(context, {
            action: "booking.availability_set",
            targetType: "booking_rules",
            metadata: { rules: input.rules.length },
          })
          return { ok: true as const }
        }),
        block: adminApi.admin.bookings.availability.block.handler(async ({ input, context }) => {
          const { id } = await context.db.booking.blocks.add({
            from: input.from,
            to: input.to,
            reason: input.reason || null,
            createdBy: context.user.id,
            createdAt: context.now().toISOString(),
          })
          await audit(context, {
            action: "booking.blocked",
            targetType: "booking_block",
            targetId: id,
            metadata: { from: input.from, to: input.to },
          })
          return { ok: true as const }
        }),
        unblock: adminApi.admin.bookings.availability.unblock.handler(
          async ({ input, context, errors }) => {
            if (!(await context.db.booking.blocks.remove(input.id))) throw errors.NOT_FOUND()
            await audit(context, {
              action: "booking.unblocked",
              targetType: "booking_block",
              targetId: input.id,
            })
            return { ok: true as const }
          }
        ),
      },

      groupEvents: {
        // One event, or a weekly series sharing a `series_key`; each date is checked for overlap
        // under the calendar lock, and nothing is created if any date collides.
        create: adminApi.admin.bookings.groupEvents.create.handler(
          async ({ input, context, errors }) => {
            const now = context.now()
            const seriesKey = input.repeatWeeks > 1 ? newToken().slice(0, 12) : null
            const ids = await context.db.transaction(async (tx) => {
              await tx.booking.rules.lock()
              const created: number[] = []
              for (let week = 0; week < input.repeatWeeks; week++) {
                const startsAt = new Date(
                  Date.parse(input.startsAt) + week * 7 * DAY_MS
                ).toISOString()
                const slot = { startsAt, endsAt: endOf(startsAt, input.durationMinutes) }
                const busy = await tx.booking.busy(slot.startsAt, slot.endsAt)
                if (busy.some((b) => overlaps(b, slot))) return null
                const { id } = await tx.booking.events.create({
                  title: input.title,
                  description: input.description || null,
                  offering: input.offering,
                  startsAt: slot.startsAt,
                  endsAt: slot.endsAt,
                  location: input.location,
                  capacity: input.capacity,
                  seriesKey,
                  createdBy: context.user.id,
                  createdAt: now.toISOString(),
                })
                created.push(id)
              }
              return created
            })
            if (!ids) throw errors.CONFLICT()
            await audit(context, {
              action: "booking.group_event_created",
              targetType: "group_event",
              targetId: ids[0],
              metadata: { ids, repeatWeeks: input.repeatWeeks },
            })
            return { ids }
          }
        ),

        // Cancels the event and every confirmed seat on it, mailing each holder, in one transaction.
        cancel: adminApi.admin.bookings.groupEvents.cancel.handler(
          async ({ input, context, errors }) => {
            const now = context.now()
            const cancelled = await context.db.transaction(async (tx) => {
              const event = await tx.booking.events.find(input.id)
              if (!event) return false
              if (!(await tx.booking.events.cancel(event.id, now.toISOString()))) return false
              for (const seat of await tx.booking.seatHolders(event.id)) {
                await tx.booking.cancel({
                  id: seat.id,
                  adminNote: input.note || null,
                  by: context.user.id,
                  at: now.toISOString(),
                })
                const locale = isLocale(seat.locale) ? seat.locale : DEFAULT_LOCALE
                const basics = mailBasics(seat, locale)
                await enqueueMail(
                  context.enqueue,
                  "bookingCancelled",
                  seat.customer_email,
                  {
                    ...basics,
                    when: basics.when ?? "",
                    byCustomer: false,
                    note: input.note || undefined,
                  },
                  { tx, locale, replyTo: context.bookingEmail }
                )
              }
              return true
            })
            if (!cancelled) throw errors.NOT_FOUND()
            await audit(context, {
              action: "booking.group_event_cancelled",
              targetType: "group_event",
              targetId: input.id,
            })
            return { ok: true as const }
          }
        ),
      },
    },
    applications: {
      list: adminApi.admin.applications.list.handler(async ({ input, context }) => {
        const rows = await context.db.applications.list({
          status: input.status === "all" ? undefined : input.status,
          job: input.job,
          cursor: input.cursor,
          limit: ADMIN_APPLICATIONS_PAGE_SIZE + 1,
        })
        const { items, nextCursor } = page(rows, ADMIN_APPLICATIONS_PAGE_SIZE)
        return { items: items.map(toAdminApplication), nextCursor }
      }),

      setStatus: adminApi.admin.applications.setStatus.handler(
        async ({ input, context, errors }) => {
          const changedAt = new Date().toISOString()
          // find + setStatus share a transaction so the "from" status read here is the one the
          // update actually changes, never a value a concurrent change already moved past.
          const result = await context.db.transaction(async (tx) => {
            const row = await tx.applications.find(input.id)
            if (!row) return null
            // Already the status asked for: a no-op success with no re-stamp and no audit row,
            // like `support.resolve`'s own guard.
            if (row.status === input.status) return { from: row.status, changed: false }
            const changed = await tx.applications.setStatus(
              input.id,
              input.status,
              context.user.id,
              changedAt
            )
            return { from: row.status, changed }
          })
          if (!result) throw errors.NOT_FOUND()
          if (!result.changed) return { ok: true as const }
          await audit(context, {
            action: "application.status_changed",
            targetType: "application",
            targetId: input.id,
            metadata: { from: result.from, to: input.status },
          })
          return { ok: true as const }
        }
      ),

      // Deletes the row and queues its CV for `storage.delete` in the same transaction, so a row
      // is never deleted with its CV left unqueued (the sweep does not cover rows that are
      // already gone).
      delete: adminApi.admin.applications.delete.handler(async ({ input, context, errors }) => {
        const deleted = await context.db.transaction(async (tx) => {
          const result = await tx.applications.delete(input.id)
          if (result) await enqueueStorageDelete(context.enqueue, result.cvKey, { tx })
          return result
        })
        if (!deleted) throw errors.NOT_FOUND()
        await audit(context, {
          action: "application.deleted",
          targetType: "application",
          targetId: input.id,
        })
        return { ok: true as const }
      }),

      cv: adminApi.admin.applications.cv.handler(async ({ input, context, errors }) => {
        const row = await context.db.applications.find(input.id)
        if (!row) throw errors.NOT_FOUND()
        const object = await context.storage.get(row.cv_key)
        if (!object) throw errors.NOT_FOUND()
        return new File([object.body], `${jobReference(row.id)}-${row.name}.pdf`, {
          type: "application/pdf",
        })
      }),
    },
    telemetry: {
      errors: adminApi.admin.telemetry.errors.handler(async ({ context }) => {
        const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
        const totals = await context.db.telemetry.errorTotals(since)
        const top = await context.db.telemetry.errorSummary(since, 5)
        return {
          window: "24h" as const,
          ...totals,
          top: top.map((r) => ({
            fingerprint: r.fingerprint,
            app: r.app,
            kind: r.kind,
            message: r.message,
            route: r.route,
            digest: r.digest,
            count: Number(r.count),
            firstSeen: r.first_seen,
            lastSeen: r.last_seen,
          })),
        }
      }),
      vitals: adminApi.admin.telemetry.vitals.handler(async ({ context }) => {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()
        return {
          window: "7d" as const,
          apps: vitalsByApp(await context.db.telemetry.vitalP75(since)),
        }
      }),
    },
    analytics: {
      summary: adminApi.admin.analytics.summary.handler(async ({ input, context }) => {
        const today = dayOf(new Date().toISOString())
        const start = shiftDay(today, -(input.days - 1))
        const db = context.db.analytics

        // Which past days (today excluded — it never has an analytics_daily row) have no
        // analytics_daily row of either kind at all: the nightly rollup hasn't reached them yet
        // (yesterday before 00:10 UTC) or its job died. Those days fall back to the same live
        // aggregation today uses, below, for days, top pages and events alike — never top
        // referrers, which always reads raw rows for the whole range regardless.
        const rolledUp = await db.rolledUpDays(start, today)
        const pastDays = daysBetween(start, shiftDay(today, -1))
        const missingDays = pastDays.filter((day) => !rolledUp.has(day))
        const liveDays = [...missingDays, today]

        // Days: analytics_daily's per-app "*" rows (never its per-page ones — summing those would
        // double-count a visitor across their own app's pages) summed across apps, for
        // already-rolled-up past days; the same live per-app aggregation for today and any
        // missing day; zero-filled otherwise.
        const dayTotals = new Map((await db.dailyPageTotals(start, today)).map((r) => [r.day, r]))
        for (const day of liveDays) {
          const rows = await db.pageviewAppAggForDay(day)
          dayTotals.set(
            day,
            rows.reduce(
              (acc, r) => ({
                day,
                pageviews: acc.pageviews + r.count,
                visitors: acc.visitors + r.visitors,
              }),
              { day, pageviews: 0, visitors: 0 }
            )
          )
        }
        const days = daysBetween(start, today).map((day) => {
          const row = dayTotals.get(day)
          return { day, pageviews: row?.pageviews ?? 0, visitors: row?.visitors ?? 0 }
        })

        // Top pages: analytics_daily's per (app, path) sums (its "*" app-total rows excluded) for
        // already-rolled-up past days, merged with the same live per-path rows for today and any
        // missing day.
        const pageTotals = new Map<string, { app: string; path: string; pageviews: number }>()
        const addPage = (app: string, path: string, pageviews: number) => {
          const key = `${app}\u0000${path}`
          const entry = pageTotals.get(key) ?? { app, path, pageviews: 0 }
          entry.pageviews += pageviews
          pageTotals.set(key, entry)
        }
        for (const row of await db.pageTotalsByKey(start, today)) {
          addPage(row.app, row.path, row.pageviews)
        }
        for (const day of liveDays) {
          for (const row of await db.pageviewAggForDay(day)) addPage(row.app, row.key, row.count)
        }
        const topPages = [...pageTotals.values()]
          .sort((a, b) => b.pageviews - a.pageviews)
          .slice(0, 10)

        // Top referrers: raw rows cover the whole range (including today) on their own, no
        // analytics_daily dependency, so no missing-day fallback applies here.
        const topReferrers = await db.topReferrers(start, today, 10)

        // Events: analytics_daily's per (day, name) sums (already summed across every source) for
        // already-rolled-up past days, merged with the same live rows for today and any missing
        // day — each live source's rows are merged by name too, so a client event tracked from
        // two apps on the same day still lands as one row.
        const eventTotals = new Map<string, { day: string; name: string; count: number }>()
        const addEvent = (day: string, name: string, count: number) => {
          const key = `${day}\u0000${name}`
          const entry = eventTotals.get(key) ?? { day, name, count: 0 }
          entry.count += count
          eventTotals.set(key, entry)
        }
        for (const row of await db.eventTotalsByDay(start, today)) {
          addEvent(row.day, row.name, row.count)
        }
        for (const day of liveDays) {
          for (const row of await db.eventAggForDay(day)) addEvent(day, row.key, row.count)
        }
        const events = [...eventTotals.values()].sort((a, b) =>
          a.day === b.day ? a.name.localeCompare(b.name) : a.day.localeCompare(b.day)
        )

        // Funnel: nested sets within the range, never ordered by timestamp against each other —
        // each step keeps only the users the step before it already kept.
        const signedUp = await db.userIdsForEvents(["signed_up"], start, today)
        const emailVerified = intersect(
          signedUp,
          await db.userIdsForEvents(["email_verified"], start, today)
        )
        const workspaceCreated = intersect(
          emailVerified,
          await db.userIdsForEvents(["workspace_created"], start, today)
        )
        const activated = intersect(
          workspaceCreated,
          await db.userIdsForEvents(["invitation_accepted", "note_created"], start, today)
        )
        const funnel = [
          { step: "signed_up", users: signedUp.size },
          { step: "email_verified", users: emailVerified.size },
          { step: "workspace_created", users: workspaceCreated.size },
          { step: "activated", users: activated.size },
        ]

        return {
          days,
          topPages,
          topReferrers,
          events,
          funnel,
          retentionDays: context.analyticsRetentionDays,
        }
      }),
    },
  },
})

export type Router = typeof router
