import { type ContractRouterClient, oc } from "@orpc/contract"
import { z } from "zod"
import {
  ADMIN_ERRORS,
  AdminAnalyticsSummarySchema,
  AdminApplicationListSchema,
  AdminApplicationPageSchema,
  AdminApplicationSetStatusSchema,
  AdminIdSchema,
  AdminJobsSchema,
  AdminListSchema,
  AdminMetricsSchema,
  AdminSupportListSchema,
  AdminSupportPageSchema,
  AdminUserDetailSchema,
  AdminUserListSchema,
  AdminUserPageSchema,
  AdminWorkspaceDetailSchema,
  AdminWorkspacePageSchema,
  AnalyticsSummarySchema,
  AUDIT_EXPORT_CAP_MESSAGE,
  AUDIT_EXPORT_DATE_MESSAGE,
  AUDIT_EXPORT_RATE_MESSAGE,
  AuditExportSchema,
  AuditListSchema,
  AuditPageSchema,
  IMPERSONATING_MESSAGE,
  ImpersonateSchema,
  ImpersonationResultSchema,
  JOB_RETRY_CONFLICT_MESSAGE,
  OkSchema,
  RemovePasskeysSchema,
  ResetTwoFactorSchema,
  SELF_REMOVE_PASSKEYS_MESSAGE,
  SELF_RESET_MESSAGE,
  SELF_SUSPEND_MESSAGE,
  SELF_TARGET_MESSAGE,
  SUSPEND_RATE_MESSAGE,
  SUSPEND_UNTIL_INVALID_MESSAGE,
  SuspendUserSchema,
  UnsuspendUserSchema,
} from "./admin"
import { AnalyticsIngestSchema } from "./analytics"
import {
  API_KEY_LIMIT_MESSAGE,
  API_KEY_NOT_FOUND_MESSAGE,
  ApiKeyIdSchema,
  ApiKeyListSchema,
  CreateApiKeySchema,
  CreatedApiKeySchema,
} from "./api-keys"
import {
  ACCOUNT_SUSPENDED_MESSAGE,
  AUTH_ERRORS,
  AuthResultSchema,
  ChangePasswordSchema,
  CONNECT_REAUTH_MESSAGE,
  DisconnectIdentitySchema,
  IdentityListSchema,
  MagicLinkConsumeSchema,
  MagicLinkRequestSchema,
  MeSchema,
  OAuthCallbackSchema,
  OAuthStartResultSchema,
  OAuthStartSchema,
  ProvidersSchema,
  RequestPasswordResetSchema,
  ResendVerificationResultSchema,
  ResetPasswordSchema,
  SET_PASSWORD_REAUTH_MESSAGE,
  SessionIdSchema,
  SessionListSchema,
  SetLocaleSchema,
  SetPasswordSchema,
  SignInResultSchema,
  SignInSchema,
  SignUpSchema,
  TWO_FACTOR_PASSWORD_REASON,
  TWO_FACTOR_REAUTH_REASON,
  TWO_FACTOR_TIMED_OUT_MESSAGE,
  TWO_FACTOR_VERIFY_EMAIL_MESSAGE,
  TWO_FACTOR_WRONG_CODE_ERROR,
  TwoFactorCodeSchema,
  TwoFactorRecoveryCodesSchema,
  TwoFactorSetupResultSchema,
  TwoFactorSetupSchema,
  TwoFactorStatusSchema,
  TwoFactorVerifySchema,
  UpdateProfileSchema,
  UserSchema,
  VerifyEmailSchema,
} from "./auth"
import {
  BillingSchema,
  CheckoutSchema,
  CheckoutUrlSchema,
  FEATURE_MESSAGES,
  MockChangeSchema,
} from "./billing"
import {
  ADMIN_BOOKING_CONFIRM_ERRORS,
  AdminAvailabilityBlockSchema,
  AdminAvailabilityResultSchema,
  AdminAvailabilitySetSchema,
  AdminBookingCalendarResultSchema,
  AdminBookingCalendarSchema,
  AdminBookingConfirmSchema,
  AdminBookingDecideSchema,
  AdminBookingPendingResultSchema,
  AdminBookingSchema,
  AdminGroupEventCreateResultSchema,
  AdminGroupEventCreateSchema,
  BOOKING_CANCEL_ERRORS,
  BOOKING_CREATE_ERRORS,
  BOOKING_ERRORS,
  BOOKING_MANAGE_ERRORS,
  BOOKING_RESERVE_ERRORS,
  BookingAvailabilityResultSchema,
  BookingAvailabilitySchema,
  BookingCancelSchema,
  BookingCreateResultSchema,
  BookingCreateSchema,
  BookingGroupEventsSchema,
  BookingManageResultSchema,
  BookingManageSchema,
  BookingRequestResultSchema,
  BookingRequestSchema,
  BookingReserveSchema,
  GroupEventsResultSchema,
} from "./booking"
import {
  EMAIL_CHANGE_CODE_REASON,
  EMAIL_CHANGE_LINK_INVALID_MESSAGE,
  EMAIL_CHANGE_RATE_MESSAGE,
  EMAIL_CHANGE_REAUTH_MESSAGE,
  EMAIL_CHANGE_REVERT_TAKEN_MESSAGE,
  EMAIL_CHANGE_SAME_EMAIL_MESSAGE,
  EMAIL_CHANGE_TAKEN_MESSAGE,
  EmailChangeConfirmResultSchema,
  EmailChangeRequestResultSchema,
  EmailChangeRequestSchema,
  EmailChangeRevertResultSchema,
  EmailChangeStatusSchema,
  EmailChangeTokenSchema,
} from "./email-change"
import {
  AvatarResultSchema,
  FileKeySchema,
  ImageUploadErrors,
  ImageUploadSchema,
  LogoResultSchema,
} from "./files"
import { WorkspaceIdSchema } from "./ids"
import { JobApplyErrors, JobApplyResultSchema, JobApplySchema } from "./jobs"
import {
  AdminLeadListSchema,
  AdminLeadPageSchema,
  AdminLeadSchema,
  AdminLeadUpdateSchema,
  LEAD_CREATE_ERRORS,
  LeadCreateResultSchema,
  LeadCreateSchema,
} from "./leads-schema"
import { CreateNoteSchema, ListNotesSchema, NoteIdSchema, NotePageSchema, NoteSchema } from "./note"
import {
  ListNotificationsSchema,
  MarkNotificationsReadSchema,
  NotificationEmailPeekSchema,
  NotificationEmailTokenSchema,
  NotificationPageSchema,
  NotificationPreferencesSchema,
  NotificationUnsubscribeResultSchema,
  SetNotificationPreferenceSchema,
  UnreadCountSchema,
} from "./notifications-schema"
import {
  PASSKEY_FAILED_MESSAGE,
  PASSKEY_LAST_WAY_IN_MESSAGE,
  PASSKEY_LIMIT_MESSAGE,
  PASSKEY_NOT_FOUND_MESSAGE,
  PASSKEY_RATE_MESSAGE,
  PASSKEY_REAUTH_MESSAGE,
  PASSKEY_REGISTER_FAILED_MESSAGE,
  PasskeyIdSchema,
  PasskeyOptionsResult,
  PasskeySchema,
  PasskeyVerifyInput,
  RegisterInput,
  RegisterOptionsInput,
  RenamePasskeySchema,
} from "./passkeys"
import {
  DataExportSchema,
  DELETE_EMAIL_MISMATCH_MESSAGE,
  DELETE_REAUTH_MESSAGE,
  DELETE_SOLE_OWNER_MESSAGE,
  DeleteAccountResultSchema,
  DeleteAccountSchema,
  DeleteSoleOwnerDataSchema,
  EXPORT_NOT_FOUND_MESSAGE,
  EXPORT_TOO_SOON_MESSAGE,
  ExportIdSchema,
  ExportRequestResultSchema,
  ExportTooSoonDataSchema,
} from "./privacy"
import { SUPPORT_RATE_MESSAGE, SupportCreateResultSchema, SupportCreateSchema } from "./support"
import { TelemetryBatchSchema, TelemetryErrorsSchema, TelemetryVitalsSchema } from "./telemetry"
import { WaitlistJoinResultSchema, WaitlistJoinSchema } from "./waitlist"
import {
  CreatedWebhookEndpointSchema,
  CreateWebhookEndpointSchema,
  RotatedWebhookSecretSchema,
  SentWebhookTestSchema,
  UpdateWebhookEndpointSchema,
  WEBHOOK_LIMIT_MESSAGE,
  WEBHOOK_NOT_FOUND_MESSAGE,
  WEBHOOK_TEST_DISABLED_MESSAGE,
  WEBHOOK_TEST_RATE_MESSAGE,
  WEBHOOK_URL_INVALID_MESSAGE,
  WebhookDeliveriesInputSchema,
  WebhookDeliveryListSchema,
  WebhookEndpointIdSchema,
  WebhookEndpointListSchema,
  WebhookEndpointSchema,
} from "./webhooks"
import {
  AcceptByIdSchema,
  AcceptResultSchema,
  CreateInvitationSchema,
  CreateWorkspaceSchema,
  INVITE_DOMAINS_INVALID_MESSAGE,
  InvitationAcceptForbiddenDataSchema,
  InvitationCreateForbiddenDataSchema,
  InvitationIdSchema,
  InvitationListSchema,
  InvitationPreviewSchema,
  InvitationSchema,
  InvitationTokenSchema,
  InviteDomainsBadRequestDataSchema,
  InviteDomainsResultSchema,
  LAST_OWNER,
  MemberListSchema,
  MemberTargetSchema,
  OWNER_TWO_FACTOR_MESSAGE,
  SetInviteDomainsSchema,
  SetRoleSchema,
  SetWorkspaceSecurityResultSchema,
  SetWorkspaceSecuritySchema,
  UpdateWorkspaceSchema,
  WORKSPACE_ERRORS,
  WorkspaceForbiddenDataSchema,
  WorkspaceImageUploadSchema,
  WorkspaceListSchema,
  WorkspaceSecurityForbiddenDataSchema,
  WorkspaceSecuritySchema,
  WorkspaceSummarySchema,
} from "./workspace"
import {
  WorkspaceActivityListSchema,
  WorkspaceActivityPageSchema,
} from "./workspace-activity-schema"

export * from "./admin"
export * from "./analytics"
export * from "./api-keys"
export * from "./auth"
export * from "./billing"
export * from "./booking"
export * from "./dev"
export * from "./email-change"
export * from "./files"
export * from "./jobs"
export * from "./leads"
export * from "./leads-schema"
export * from "./note"
export * from "./notifications"
export * from "./notifications-schema"
export * from "./passkeys"
export * from "./privacy"
export * from "./realtime"
export * from "./support"
export * from "./telemetry"
export * from "./waitlist"
export * from "./webhooks"
export * from "./workspace"
export * from "./workspace-activity"
export * from "./workspace-activity-schema"

const empty = z.object({}).optional()
const NOTE_ERRORS = { ...WORKSPACE_ERRORS, NOT_FOUND: { message: "Note not found" } } as const

/**
 * The single source of truth for the API surface. `apps/api` implements it; clients type
 * themselves against it without importing any server code. The `route` metadata only affects the
 * REST/OpenAPI transport — the typed RPC transport ignores it.
 */
export const contract = {
  auth: {
    signUp: oc
      .route({
        method: "POST",
        path: "/auth/sign-up",
        successStatus: 201,
        summary: "Create an account",
      })
      .errors({
        CONFLICT: { message: "An account with this email already exists" },
        TOO_MANY_REQUESTS: { message: "Too many sign-ups right now, try again in a few minutes" },
      })
      .input(SignUpSchema)
      .output(AuthResultSchema),
    signIn: oc
      .route({ method: "POST", path: "/auth/sign-in", summary: "Sign in" })
      .errors({
        UNAUTHORIZED: { message: "Invalid email or password" },
        TOO_MANY_REQUESTS: { message: "Too many attempts, try again later" },
        // Only once the password is right: a wrong one answers UNAUTHORIZED as for anyone.
        FORBIDDEN: { message: ACCOUNT_SUSPENDED_MESSAGE },
      })
      .input(SignInSchema)
      .output(SignInResultSchema),
    me: oc
      .route({ method: "GET", path: "/auth/me", summary: "The signed-in user" })
      .errors(AUTH_ERRORS)
      .input(empty)
      .output(MeSchema),
    signOut: oc
      .route({ method: "POST", path: "/auth/sign-out", summary: "End the current session" })
      .errors(AUTH_ERRORS)
      .input(empty)
      .output(z.void()),
    requestPasswordReset: oc
      .route({ method: "POST", path: "/auth/password/forgot", summary: "Email a reset link" })
      .input(RequestPasswordResetSchema)
      .output(z.void()),
    resetPassword: oc
      .route({
        method: "POST",
        path: "/auth/password/reset",
        summary: "Set a new password from a reset link",
      })
      .errors({ BAD_REQUEST: { message: "This reset link is invalid or has expired" } })
      .input(ResetPasswordSchema)
      .output(z.void()),
    verifyEmail: oc
      .route({
        method: "POST",
        path: "/auth/email/verify",
        summary: "Confirm an email address from a verify link",
      })
      .errors({
        BAD_REQUEST: { message: "This verification link is invalid, expired or already used" },
      })
      .input(VerifyEmailSchema)
      .output(z.void()),
    providers: oc
      .route({ method: "GET", path: "/auth/providers", summary: "Configured sign-in providers" })
      .input(empty)
      .output(ProvidersSchema),
    magicLink: {
      request: oc
        .route({
          method: "POST",
          path: "/auth/magic-link/request",
          summary: "Email a one-time sign-in link",
        })
        .input(MagicLinkRequestSchema)
        .output(z.void()),
      consume: oc
        .route({
          method: "POST",
          path: "/auth/magic-link/consume",
          summary: "Sign in from a magic link, creating a passwordless account if needed",
        })
        .errors({
          BAD_REQUEST: { message: "This sign-in link is invalid, expired or already used" },
          FORBIDDEN: { message: ACCOUNT_SUSPENDED_MESSAGE },
        })
        .input(MagicLinkConsumeSchema)
        .output(SignInResultSchema),
    },
    // The two links mailed to an account's old address, anonymous: whoever holds the mailbox.
    // Each is consumed by a button, never on load.
    emailChange: {
      cancel: oc
        .route({
          method: "POST",
          path: "/auth/email-change/cancel",
          summary: "Cancel a pending email change and sign the account out everywhere",
        })
        .errors({ BAD_REQUEST: { message: EMAIL_CHANGE_LINK_INVALID_MESSAGE } })
        .input(EmailChangeTokenSchema)
        .output(z.void()),
      revert: oc
        .route({
          method: "POST",
          path: "/auth/email-change/revert",
          summary: "Undo an email change: restore the old address and lock the account down",
        })
        .errors({
          BAD_REQUEST: { message: EMAIL_CHANGE_LINK_INVALID_MESSAGE },
          CONFLICT: { message: EMAIL_CHANGE_REVERT_TAKEN_MESSAGE },
        })
        .input(EmailChangeTokenSchema)
        .output(EmailChangeRevertResultSchema),
    },
    // The unsubscribe links an optional notification mail carries (Phase 13 B). Anonymous: the
    // token alone names one user and one optional type. Limited per client and api-wide; past
    // that, a good token and a bad one answer alike, and a bad one changes nothing.
    notificationEmail: {
      unsubscribe: oc
        .route({
          method: "POST",
          path: "/auth/notification-email/unsubscribe",
          summary: "Turn off one optional notification email, from its unsubscribe link",
        })
        .errors({
          TOO_MANY_REQUESTS: { message: "Too many requests, try again in a few minutes" },
        })
        .input(NotificationEmailTokenSchema)
        .output(NotificationUnsubscribeResultSchema),
      // Read-only: which email type a link would turn off, so its page can name it.
      peek: oc
        .route({
          method: "POST",
          path: "/auth/notification-email/peek",
          summary: "Which notification email an unsubscribe link turns off",
        })
        .errors({
          TOO_MANY_REQUESTS: { message: "Too many requests, try again in a few minutes" },
        })
        .input(NotificationEmailTokenSchema)
        .output(NotificationEmailPeekSchema),
    },
    oauth: {
      start: oc
        .route({
          method: "POST",
          path: "/auth/oauth/start",
          summary: "Begin a provider sign-in: the authorization URL, state and verifier",
        })
        .errors({
          NOT_FOUND: { message: "That provider is not configured" },
          // Connecting while signed in (a session forwarded) on a session past REAUTH_WINDOW_MS.
          FORBIDDEN: {
            message: CONNECT_REAUTH_MESSAGE,
            data: z.object({ reason: z.literal(TWO_FACTOR_REAUTH_REASON) }).optional(),
          },
        })
        .input(OAuthStartSchema)
        .output(OAuthStartResultSchema),
      callback: oc
        .route({
          method: "POST",
          path: "/auth/oauth/callback",
          summary: "Finish a provider sign-in, or connect the provider when signed in",
        })
        .errors({
          BAD_REQUEST: { message: "Sign-in failed, try again" },
          BAD_GATEWAY: { message: "The provider is not responding" },
          // Also ACCOUNT_SUSPENDED_MESSAGE (no `data`) once the provider has vouched for a
          // suspended account: one declared default per code, so this one keeps the older message.
          FORBIDDEN: {
            message:
              "That account's email is not verified — sign in with your email first, then connect it in your account",
            // `reason: "reauth"`: connecting while signed in on a session past REAUTH_WINDOW_MS.
            data: z.object({ reason: z.literal(TWO_FACTOR_REAUTH_REASON) }).optional(),
          },
          CONFLICT: {
            message:
              "That account is already connected — to another user, or you already have one for this provider",
          },
          NOT_FOUND: { message: "That provider is not configured" },
        })
        .input(OAuthCallbackSchema)
        .output(SignInResultSchema),
    },
    twoFactor: {
      verify: oc
        .route({
          method: "POST",
          path: "/auth/two-factor/verify",
          summary: "Finish a sign-in that answered a two-factor challenge",
        })
        .errors({
          UNAUTHORIZED: TWO_FACTOR_WRONG_CODE_ERROR,
          BAD_REQUEST: { message: TWO_FACTOR_TIMED_OUT_MESSAGE },
          TOO_MANY_REQUESTS: { message: "Too many attempts, try again later" },
          FORBIDDEN: { message: ACCOUNT_SUSPENDED_MESSAGE },
        })
        .input(TwoFactorVerifySchema)
        .output(AuthResultSchema),
    },
    // Discoverable credentials: `options` names no user, the credential does. Never answers a
    // two-factor challenge — a passkey counts as both factors.
    passkey: {
      options: oc
        .route({
          method: "POST",
          path: "/auth/passkey/options",
          summary: "Begin a passkey sign-in: WebAuthn request options and a challenge id",
        })
        .input(empty)
        .output(PasskeyOptionsResult),
      verify: oc
        .route({
          method: "POST",
          path: "/auth/passkey/verify",
          summary: "Finish a passkey sign-in",
        })
        .errors({
          UNAUTHORIZED: { message: PASSKEY_FAILED_MESSAGE },
          TOO_MANY_REQUESTS: { message: PASSKEY_RATE_MESSAGE },
          FORBIDDEN: { message: ACCOUNT_SUSPENDED_MESSAGE },
        })
        .input(PasskeyVerifyInput)
        .output(AuthResultSchema),
    },
  },
  account: {
    resendVerification: oc
      .route({
        method: "POST",
        path: "/account/email/resend-verification",
        summary: "Send the verify link again",
      })
      .errors({
        ...AUTH_ERRORS,
        TOO_MANY_REQUESTS: { message: "Too many requests, try again in a few minutes" },
      })
      .input(empty)
      .output(ResendVerificationResultSchema),
    // Changing the sign-in address: requested here, confirmed from a link mailed to the new address.
    email: {
      get: oc
        .route({
          method: "GET",
          path: "/account/email",
          summary: "The account's email address and its pending change",
        })
        .errors(AUTH_ERRORS)
        .input(empty)
        .output(EmailChangeStatusSchema),
      requestChange: oc
        .route({
          method: "POST",
          path: "/account/email/change",
          summary: "Ask to change the email address: a confirm link goes to the new address",
        })
        .errors({
          ...AUTH_ERRORS,
          // `reason: "password"`: the current password was wrong; `reason: "code"`: two-step
          // verification is on and the authenticator or recovery code was missing or wrong.
          UNAUTHORIZED: {
            message: "Sign in required",
            data: z
              .object({
                reason: z.enum([TWO_FACTOR_PASSWORD_REASON, EMAIL_CHANGE_CODE_REASON]),
              })
              .optional(),
          },
          // Also thrown with IMPERSONATING_MESSAGE by an impersonation session.
          FORBIDDEN: {
            message: EMAIL_CHANGE_REAUTH_MESSAGE,
            data: z.object({ reason: z.literal(TWO_FACTOR_REAUTH_REASON) }).optional(),
          },
          BAD_REQUEST: { message: EMAIL_CHANGE_SAME_EMAIL_MESSAGE },
          // Also thrown with "Too many attempts, try again later" by the two-step budget.
          TOO_MANY_REQUESTS: { message: EMAIL_CHANGE_RATE_MESSAGE },
        })
        .input(EmailChangeRequestSchema)
        .output(EmailChangeRequestResultSchema),
      confirmChange: oc
        .route({
          method: "POST",
          path: "/account/email/confirm",
          summary: "Confirm a pending email change with the link's token",
        })
        .errors({
          ...AUTH_ERRORS,
          // Also thrown with EMAIL_CHANGE_WRONG_ACCOUNT_MESSAGE for another account's link.
          BAD_REQUEST: { message: EMAIL_CHANGE_LINK_INVALID_MESSAGE },
          CONFLICT: { message: EMAIL_CHANGE_TAKEN_MESSAGE },
          FORBIDDEN: { message: IMPERSONATING_MESSAGE },
        })
        .input(EmailChangeTokenSchema)
        .output(EmailChangeConfirmResultSchema),
    },
    updateProfile: oc
      .route({ method: "PATCH", path: "/account/profile", summary: "Update the profile" })
      .errors(AUTH_ERRORS)
      .input(UpdateProfileSchema)
      .output(UserSchema),
    setLocale: oc
      .route({ method: "PUT", path: "/account/locale", summary: "Choose the account's language" })
      .errors(AUTH_ERRORS)
      .input(SetLocaleSchema)
      .output(SetLocaleSchema),
    // Which notifications also arrive by email (Phase 13 B): optional types only; locked ones are
    // listed read-only. `set` is refused while impersonating; a no-op writes nothing.
    notificationPreferences: {
      get: oc
        .route({
          method: "GET",
          path: "/account/notification-preferences",
          summary: "Which notifications are also emailed",
        })
        .errors(AUTH_ERRORS)
        .input(empty)
        .output(NotificationPreferencesSchema),
      set: oc
        .route({
          method: "PUT",
          path: "/account/notification-preferences",
          summary: "Turn one optional notification email on or off",
        })
        .errors({ ...AUTH_ERRORS, FORBIDDEN: { message: IMPERSONATING_MESSAGE } })
        .input(SetNotificationPreferenceSchema)
        .output(NotificationPreferencesSchema),
    },
    changePassword: oc
      .route({ method: "POST", path: "/account/password", summary: "Change the password" })
      .errors({ ...AUTH_ERRORS, FORBIDDEN: { message: "Current password is incorrect" } })
      .input(ChangePasswordSchema)
      .output(z.void()),
    setPassword: oc
      .route({
        method: "POST",
        path: "/account/password/set",
        summary: "Set a first password on a passwordless account",
      })
      .errors({
        ...AUTH_ERRORS,
        CONFLICT: { message: "You already have a password — change it instead" },
        // Also thrown with IMPERSONATING_MESSAGE by an impersonation session.
        FORBIDDEN: {
          message: SET_PASSWORD_REAUTH_MESSAGE,
          data: z.object({ reason: z.literal(TWO_FACTOR_REAUTH_REASON) }).optional(),
        },
      })
      .input(SetPasswordSchema)
      .output(z.void()),
    avatar: {
      set: oc
        .route({ method: "POST", path: "/account/avatar", summary: "Set the profile avatar" })
        .errors({ ...AUTH_ERRORS, ...ImageUploadErrors })
        .input(ImageUploadSchema)
        .output(AvatarResultSchema),
      remove: oc
        .route({ method: "DELETE", path: "/account/avatar", summary: "Remove the profile avatar" })
        .errors(AUTH_ERRORS)
        .input(empty)
        .output(OkSchema),
    },
    identities: {
      list: oc
        .route({
          method: "GET",
          path: "/account/identities",
          summary: "Providers connected to the signed-in user",
        })
        .errors(AUTH_ERRORS)
        .input(empty)
        .output(IdentityListSchema),
      disconnect: oc
        .route({
          method: "DELETE",
          path: "/account/identities/{provider}",
          summary: "Disconnect a provider",
        })
        .errors({
          ...AUTH_ERRORS,
          NOT_FOUND: { message: "That provider is not connected" },
          FORBIDDEN: {
            message: "This is your only way to sign in — set a password or add a passkey first",
          },
        })
        .input(DisconnectIdentitySchema)
        .output(z.void()),
    },
    sessions: {
      list: oc
        .route({
          method: "GET",
          path: "/account/sessions",
          summary: "Sessions of the signed-in user",
        })
        .errors(AUTH_ERRORS)
        .input(empty)
        .output(SessionListSchema),
      revoke: oc
        .route({ method: "DELETE", path: "/account/sessions/{id}", summary: "End one session" })
        .errors({ ...AUTH_ERRORS, NOT_FOUND: { message: "Session not found" } })
        .input(SessionIdSchema)
        .output(z.void()),
      revokeOthers: oc
        .route({
          method: "POST",
          path: "/account/sessions/revoke-others",
          summary: "End every other session",
        })
        .errors(AUTH_ERRORS)
        .input(empty)
        .output(z.void()),
    },
    twoFactor: {
      get: oc
        .route({
          method: "GET",
          path: "/account/two-factor",
          summary: "Two-step verification status",
        })
        .errors(AUTH_ERRORS)
        .input(empty)
        .output(TwoFactorStatusSchema),
      setup: oc
        .route({
          method: "POST",
          path: "/account/two-factor/setup",
          summary: "Start enabling two-step verification: a new secret and its otpauth:// URL",
        })
        .errors({
          ...AUTH_ERRORS,
          UNAUTHORIZED: {
            message: "Sign in required",
            data: z.object({ reason: z.literal(TWO_FACTOR_PASSWORD_REASON) }).optional(),
          },
          CONFLICT: { message: "Two-step verification is already on" },
          // Also thrown with IMPERSONATING_MESSAGE / TWO_FACTOR_REAUTH_MESSAGE (reason "reauth").
          FORBIDDEN: {
            message: TWO_FACTOR_VERIFY_EMAIL_MESSAGE,
            data: z.object({ reason: z.literal(TWO_FACTOR_REAUTH_REASON) }).optional(),
          },
          TOO_MANY_REQUESTS: { message: "Too many attempts, try again later" },
        })
        .input(TwoFactorSetupSchema)
        .output(TwoFactorSetupResultSchema),
      enable: oc
        .route({
          method: "POST",
          path: "/account/two-factor/enable",
          summary: "Confirm setup with a TOTP code and turn two-step verification on",
        })
        .errors({
          ...AUTH_ERRORS,
          // Already on: call `setup` + `enable` again only has one legal order.
          CONFLICT: { message: "Two-step verification is already on" },
          // No pending secret to confirm — `setup` was never called, or its secret expired into
          // nothing (there is no TTL on it today, so in practice: never called).
          BAD_REQUEST: { message: "Start setup first" },
          // Also thrown with IMPERSONATING_MESSAGE by an impersonation session.
          FORBIDDEN: { message: TWO_FACTOR_VERIFY_EMAIL_MESSAGE },
          UNAUTHORIZED: TWO_FACTOR_WRONG_CODE_ERROR,
          TOO_MANY_REQUESTS: { message: "Too many attempts, try again later" },
        })
        .input(TwoFactorCodeSchema)
        .output(TwoFactorRecoveryCodesSchema),
      disable: oc
        .route({
          method: "POST",
          path: "/account/two-factor/disable",
          summary: "Turn two-step verification off",
        })
        .errors({
          ...AUTH_ERRORS,
          CONFLICT: { message: "Two-step verification is not on" },
          FORBIDDEN: { message: IMPERSONATING_MESSAGE },
          UNAUTHORIZED: TWO_FACTOR_WRONG_CODE_ERROR,
          TOO_MANY_REQUESTS: { message: "Too many attempts, try again later" },
        })
        .input(TwoFactorCodeSchema)
        .output(z.void()),
      regenerateRecoveryCodes: oc
        .route({
          method: "POST",
          path: "/account/two-factor/recovery-codes",
          summary: "Replace all recovery codes",
        })
        .errors({
          ...AUTH_ERRORS,
          CONFLICT: { message: "Two-step verification is not on" },
          FORBIDDEN: { message: IMPERSONATING_MESSAGE },
          UNAUTHORIZED: TWO_FACTOR_WRONG_CODE_ERROR,
          TOO_MANY_REQUESTS: { message: "Too many attempts, try again later" },
        })
        .input(TwoFactorCodeSchema)
        .output(TwoFactorRecoveryCodesSchema),
    },
    passkeys: {
      list: oc
        .route({
          method: "GET",
          path: "/account/passkeys",
          summary: "The signed-in user's passkeys",
        })
        .errors(AUTH_ERRORS)
        .input(empty)
        .output(z.array(PasskeySchema)),
      registerOptions: oc
        .route({
          method: "POST",
          path: "/account/passkeys/options",
          summary: "Begin adding a passkey: WebAuthn creation options and a challenge id",
        })
        .errors({
          ...AUTH_ERRORS,
          // `reason: "password"`: the current password was wrong (an account with one).
          UNAUTHORIZED: {
            message: "Sign in required",
            data: z.object({ reason: z.literal(TWO_FACTOR_PASSWORD_REASON) }).optional(),
          },
          // Also thrown with IMPERSONATING_MESSAGE by an impersonation session.
          FORBIDDEN: {
            message: PASSKEY_REAUTH_MESSAGE,
            data: z.object({ reason: z.literal(TWO_FACTOR_REAUTH_REASON) }).optional(),
          },
          TOO_MANY_REQUESTS: { message: "Too many attempts, try again later" },
          // The account already has MAX_PASSKEYS.
          CONFLICT: { message: PASSKEY_LIMIT_MESSAGE },
        })
        .input(RegisterOptionsInput)
        .output(PasskeyOptionsResult),
      register: oc
        .route({
          method: "POST",
          path: "/account/passkeys",
          successStatus: 201,
          summary: "Finish adding a passkey",
        })
        .errors({
          ...AUTH_ERRORS,
          BAD_REQUEST: { message: PASSKEY_REGISTER_FAILED_MESSAGE },
          FORBIDDEN: { message: IMPERSONATING_MESSAGE },
          // The account already has MAX_PASSKEYS (re-checked under the user row's lock).
          CONFLICT: { message: PASSKEY_LIMIT_MESSAGE },
        })
        .input(RegisterInput)
        .output(PasskeySchema),
      rename: oc
        .route({ method: "PATCH", path: "/account/passkeys/{id}", summary: "Rename a passkey" })
        .errors({
          ...AUTH_ERRORS,
          NOT_FOUND: { message: PASSKEY_NOT_FOUND_MESSAGE },
          FORBIDDEN: { message: IMPERSONATING_MESSAGE },
        })
        .input(RenamePasskeySchema)
        .output(z.void()),
      delete: oc
        .route({ method: "DELETE", path: "/account/passkeys/{id}", summary: "Remove a passkey" })
        .errors({
          ...AUTH_ERRORS,
          NOT_FOUND: { message: PASSKEY_NOT_FOUND_MESSAGE },
          FORBIDDEN: { message: IMPERSONATING_MESSAGE },
          // The last way in: no password, no connected provider, and this is the only passkey.
          CONFLICT: { message: PASSKEY_LAST_WAY_IN_MESSAGE },
        })
        .input(PasskeyIdSchema)
        .output(z.void()),
    },
    // A JSON file of everything the account holds, built by a job and kept 7 days.
    export: {
      request: oc
        .route({ method: "POST", path: "/account/export", summary: "Request a data export" })
        .errors({
          ...AUTH_ERRORS,
          FORBIDDEN: { message: IMPERSONATING_MESSAGE },
          CONFLICT: { message: EXPORT_TOO_SOON_MESSAGE, data: ExportTooSoonDataSchema },
        })
        .input(empty)
        .output(ExportRequestResultSchema),
      get: oc
        .route({ method: "GET", path: "/account/export", summary: "The latest data export" })
        .errors(AUTH_ERRORS)
        .input(empty)
        .output(DataExportSchema.nullable()),
      download: oc
        .route({
          method: "GET",
          path: "/account/export/{id}/download",
          summary: "A ready data export's file",
        })
        .errors({
          ...AUTH_ERRORS,
          FORBIDDEN: { message: IMPERSONATING_MESSAGE },
          NOT_FOUND: { message: EXPORT_NOT_FOUND_MESSAGE },
        })
        .input(ExportIdSchema)
        .output(z.file()),
    },
    // Schedules the account's purge DELETION_GRACE_MS from now and ends every session (the
    // current one too). A second call while scheduled keeps, and returns, the first date.
    delete: oc
      .route({
        method: "POST",
        path: "/account/delete",
        summary: "Schedule the account's deletion",
      })
      .errors({
        ...AUTH_ERRORS,
        BAD_REQUEST: { message: DELETE_EMAIL_MISMATCH_MESSAGE },
        // Also thrown with IMPERSONATING_MESSAGE (no data) by an impersonation session.
        FORBIDDEN: {
          message: DELETE_REAUTH_MESSAGE,
          data: z.object({ reason: z.literal(TWO_FACTOR_REAUTH_REASON) }).optional(),
        },
        CONFLICT: { message: DELETE_SOLE_OWNER_MESSAGE, data: DeleteSoleOwnerDataSchema },
      })
      .input(DeleteAccountSchema)
      .output(DeleteAccountResultSchema),
    cancelDeletion: oc
      .route({
        method: "DELETE",
        path: "/account/delete",
        summary: "Cancel the account's scheduled deletion",
      })
      .errors({ ...AUTH_ERRORS, FORBIDDEN: { message: IMPERSONATING_MESSAGE } })
      .input(empty)
      .output(z.object({})),
  },
  notes: {
    list: oc
      .route({ method: "GET", path: "/notes", summary: "List notes, newest first" })
      .errors(WORKSPACE_ERRORS)
      .input(ListNotesSchema)
      .output(NotePageSchema),
    find: oc
      .route({ method: "GET", path: "/notes/{id}", summary: "Find a note" })
      .errors(NOTE_ERRORS)
      .input(NoteIdSchema)
      .output(NoteSchema),
    create: oc
      .route({ method: "POST", path: "/notes", successStatus: 201, summary: "Create a note" })
      .errors(WORKSPACE_ERRORS)
      .input(CreateNoteSchema)
      .output(NoteSchema),
    delete: oc
      .route({ method: "DELETE", path: "/notes/{id}", summary: "Delete a note" })
      .errors(NOTE_ERRORS)
      .input(NoteIdSchema)
      .output(z.void()),
  },
  // The signed-in person's own notifications (Phase 13 A). Every procedure reads or marks the
  // caller's rows only; another user's id is never returned and is ignored by markRead.
  notifications: {
    list: oc
      .route({
        method: "GET",
        path: "/notifications",
        summary: "The signed-in user's notifications, newest first",
      })
      .errors(AUTH_ERRORS)
      .input(ListNotificationsSchema)
      .output(NotificationPageSchema),
    unreadCount: oc
      .route({
        method: "GET",
        path: "/notifications/unread-count",
        summary: "How many of the signed-in user's notifications are unread",
      })
      .errors(AUTH_ERRORS)
      .input(empty)
      .output(UnreadCountSchema),
    // Refused while impersonating: support may look, never clear a user's badge.
    markRead: oc
      .route({
        method: "POST",
        path: "/notifications/read",
        summary: "Mark some (by id) or all of the signed-in user's notifications read",
      })
      .errors({ ...AUTH_ERRORS, FORBIDDEN: { message: IMPERSONATING_MESSAGE } })
      .input(MarkNotificationsReadSchema)
      .output(z.void()),
  },
  workspaces: {
    list: oc
      .route({
        method: "GET",
        path: "/workspaces",
        summary: "The caller's workspaces and pending invitations",
      })
      .errors(AUTH_ERRORS)
      .input(empty)
      .output(WorkspaceListSchema),
    create: oc
      .route({
        method: "POST",
        path: "/workspaces",
        successStatus: 201,
        summary: "Create a workspace",
      })
      .errors({
        ...AUTH_ERRORS,
        FORBIDDEN: { message: "Verify your email to create a workspace" },
        TOO_MANY_REQUESTS: { message: "Too many workspaces created, try again in an hour" },
      })
      .input(CreateWorkspaceSchema)
      .output(WorkspaceSummarySchema),
    get: oc
      .route({ method: "GET", path: "/workspaces/{workspaceId}", summary: "One workspace" })
      .errors(WORKSPACE_ERRORS)
      .input(WorkspaceIdSchema)
      .output(WorkspaceSummarySchema),
    update: oc
      .route({ method: "PATCH", path: "/workspaces/{workspaceId}", summary: "Rename a workspace" })
      .errors(WORKSPACE_ERRORS)
      .input(UpdateWorkspaceSchema)
      .output(WorkspaceSummarySchema),
    delete: oc
      .route({ method: "DELETE", path: "/workspaces/{workspaceId}", summary: "Delete a workspace" })
      .errors({
        ...WORKSPACE_ERRORS,
        INTERNAL_SERVER_ERROR: { message: "Could not cancel the subscription, try again" },
      })
      .input(WorkspaceIdSchema)
      .output(z.void()),
    leave: oc
      .route({
        method: "POST",
        path: "/workspaces/{workspaceId}/leave",
        summary: "Leave a workspace",
      })
      .errors({ ...WORKSPACE_ERRORS, ...LAST_OWNER })
      .input(WorkspaceIdSchema)
      .output(z.void()),
    transferOwnership: oc
      .route({
        method: "POST",
        path: "/workspaces/{workspaceId}/transfer",
        summary: "Make another member the owner",
      })
      .errors({ ...WORKSPACE_ERRORS, BAD_REQUEST: { message: "Not a member of this workspace" } })
      .input(MemberTargetSchema)
      .output(z.void()),
    members: {
      list: oc
        .route({
          method: "GET",
          path: "/workspaces/{workspaceId}/members",
          summary: "List members",
        })
        .errors(WORKSPACE_ERRORS)
        .input(WorkspaceIdSchema)
        .output(MemberListSchema),
      setRole: oc
        .route({
          method: "PATCH",
          path: "/workspaces/{workspaceId}/members/{userId}",
          summary: "Change a member's role",
        })
        .errors({
          ...WORKSPACE_ERRORS,
          ...LAST_OWNER,
          BAD_REQUEST: { message: "Not a member of this workspace" },
        })
        .input(SetRoleSchema)
        .output(z.void()),
      remove: oc
        .route({
          method: "DELETE",
          path: "/workspaces/{workspaceId}/members/{userId}",
          summary: "Remove a member",
        })
        .errors({
          ...WORKSPACE_ERRORS,
          ...LAST_OWNER,
          BAD_REQUEST: { message: "Not a member of this workspace" },
        })
        .input(MemberTargetSchema)
        .output(z.void()),
    },
    invitations: {
      list: oc
        .route({
          method: "GET",
          path: "/workspaces/{workspaceId}/invitations",
          summary: "Pending invitations",
        })
        .errors(WORKSPACE_ERRORS)
        .input(WorkspaceIdSchema)
        .output(InvitationListSchema),
      create: oc
        .route({
          method: "POST",
          path: "/workspaces/{workspaceId}/invitations",
          successStatus: 201,
          summary: "Invite by email",
        })
        .errors({
          ...WORKSPACE_ERRORS,
          // Also thrown with SEAT_LIMIT_MESSAGE, and with INVITE_DOMAIN_RESTRICTED_MESSAGE
          // (`data.reason: "invite_domain"`) for an address outside the workspace's domain list.
          FORBIDDEN: {
            message: WORKSPACE_ERRORS.FORBIDDEN.message,
            data: InvitationCreateForbiddenDataSchema,
          },
          CONFLICT: { message: "Already a member" },
          TOO_MANY_REQUESTS: { message: "Too many invitations, try again in an hour" },
        })
        .input(CreateInvitationSchema)
        .output(InvitationSchema),
      revoke: oc
        .route({
          method: "DELETE",
          path: "/workspaces/{workspaceId}/invitations/{id}",
          summary: "Revoke an invitation",
        })
        .errors({ ...WORKSPACE_ERRORS, NOT_FOUND: { message: "Invitation not found" } })
        .input(InvitationIdSchema)
        .output(z.void()),
    },
    logo: {
      set: oc
        .route({
          method: "POST",
          path: "/workspaces/{workspaceId}/logo",
          summary: "Set the workspace logo",
        })
        .errors({ ...WORKSPACE_ERRORS, ...ImageUploadErrors })
        .input(WorkspaceImageUploadSchema)
        .output(LogoResultSchema),
      remove: oc
        .route({
          method: "DELETE",
          path: "/workspaces/{workspaceId}/logo",
          summary: "Remove the workspace logo",
        })
        .errors(WORKSPACE_ERRORS)
        .input(WorkspaceIdSchema)
        .output(OkSchema),
    },
    // Workspace API keys for /v1 (admin and up). The full key leaves the api once, in `create`'s
    // answer; nothing else ever returns it or its hash.
    apiKeys: {
      list: oc
        .route({
          method: "GET",
          path: "/workspaces/{workspaceId}/api-keys",
          summary: "The workspace's API keys",
        })
        .errors(WORKSPACE_ERRORS)
        .input(WorkspaceIdSchema)
        .output(ApiKeyListSchema),
      create: oc
        .route({
          method: "POST",
          path: "/workspaces/{workspaceId}/api-keys",
          successStatus: 201,
          summary: "Create an API key (the full key is returned only here)",
        })
        .errors({
          ...WORKSPACE_ERRORS,
          // Also thrown with "Requires the admin role" and IMPERSONATING_MESSAGE.
          FORBIDDEN: { message: FEATURE_MESSAGES.api, data: WorkspaceForbiddenDataSchema },
          // The workspace already holds MAX_API_KEYS live keys (decided under its row's lock).
          CONFLICT: { message: API_KEY_LIMIT_MESSAGE },
        })
        .input(CreateApiKeySchema)
        .output(CreatedApiKeySchema),
      revoke: oc
        .route({
          method: "DELETE",
          path: "/workspaces/{workspaceId}/api-keys/{id}",
          summary: "Revoke an API key",
        })
        .errors({
          ...WORKSPACE_ERRORS,
          // Also thrown with "Requires the admin role".
          FORBIDDEN: { message: IMPERSONATING_MESSAGE, data: WorkspaceForbiddenDataSchema },
          NOT_FOUND: { message: API_KEY_NOT_FOUND_MESSAGE },
        })
        .input(ApiKeyIdSchema)
        .output(z.void()),
    },
    // Outgoing webhook endpoints (admin and up). The signing secret leaves the api only in
    // `create`'s and `rotateSecret`'s answers; nothing else ever returns it.
    webhooks: {
      list: oc
        .route({
          method: "GET",
          path: "/workspaces/{workspaceId}/webhooks",
          summary: "The workspace's webhook endpoints",
        })
        .errors(WORKSPACE_ERRORS)
        .input(WorkspaceIdSchema)
        .output(WebhookEndpointListSchema),
      create: oc
        .route({
          method: "POST",
          path: "/workspaces/{workspaceId}/webhooks",
          successStatus: 201,
          summary: "Add a webhook endpoint (the signing secret is returned only here)",
        })
        .errors({
          ...WORKSPACE_ERRORS,
          // Also thrown with WEBHOOK_URL_BLOCKED_MESSAGE and WEBHOOK_URL_UNRESOLVED_MESSAGE.
          BAD_REQUEST: { message: WEBHOOK_URL_INVALID_MESSAGE },
          // Also thrown with "Requires the admin role" and IMPERSONATING_MESSAGE.
          FORBIDDEN: { message: FEATURE_MESSAGES.api, data: WorkspaceForbiddenDataSchema },
          // The workspace already holds MAX_WEBHOOK_ENDPOINTS (decided under its row's lock).
          CONFLICT: { message: WEBHOOK_LIMIT_MESSAGE },
        })
        .input(CreateWebhookEndpointSchema)
        .output(CreatedWebhookEndpointSchema),
      update: oc
        .route({
          method: "PATCH",
          path: "/workspaces/{workspaceId}/webhooks/{id}",
          summary: "Change an endpoint's URL, description or events, or enable/disable it",
        })
        .errors({
          ...WORKSPACE_ERRORS,
          // Also thrown with WEBHOOK_URL_BLOCKED_MESSAGE and WEBHOOK_URL_UNRESOLVED_MESSAGE.
          BAD_REQUEST: { message: WEBHOOK_URL_INVALID_MESSAGE },
          // Also thrown with "Requires the admin role" and IMPERSONATING_MESSAGE.
          FORBIDDEN: { message: FEATURE_MESSAGES.api, data: WorkspaceForbiddenDataSchema },
          NOT_FOUND: { message: WEBHOOK_NOT_FOUND_MESSAGE },
        })
        .input(UpdateWebhookEndpointSchema)
        .output(WebhookEndpointSchema),
      rotateSecret: oc
        .route({
          method: "POST",
          path: "/workspaces/{workspaceId}/webhooks/{id}/rotate-secret",
          summary: "Replace an endpoint's signing secret (the new one is returned only here)",
        })
        .errors({
          ...WORKSPACE_ERRORS,
          // Also thrown with "Requires the admin role" and IMPERSONATING_MESSAGE.
          FORBIDDEN: { message: FEATURE_MESSAGES.api, data: WorkspaceForbiddenDataSchema },
          NOT_FOUND: { message: WEBHOOK_NOT_FOUND_MESSAGE },
        })
        .input(WebhookEndpointIdSchema)
        .output(RotatedWebhookSecretSchema),
      delete: oc
        .route({
          method: "DELETE",
          path: "/workspaces/{workspaceId}/webhooks/{id}",
          summary: "Delete a webhook endpoint and its delivery log",
        })
        .errors({
          ...WORKSPACE_ERRORS,
          // Also thrown with "Requires the admin role".
          FORBIDDEN: { message: IMPERSONATING_MESSAGE, data: WorkspaceForbiddenDataSchema },
          NOT_FOUND: { message: WEBHOOK_NOT_FOUND_MESSAGE },
        })
        .input(WebhookEndpointIdSchema)
        .output(z.void()),
      test: oc
        .route({
          method: "POST",
          path: "/workspaces/{workspaceId}/webhooks/{id}/test",
          summary: "Queue a signed `ping` event to one endpoint",
        })
        .errors({
          ...WORKSPACE_ERRORS,
          // Also thrown with "Requires the admin role" and IMPERSONATING_MESSAGE.
          FORBIDDEN: { message: FEATURE_MESSAGES.api, data: WorkspaceForbiddenDataSchema },
          NOT_FOUND: { message: WEBHOOK_NOT_FOUND_MESSAGE },
          // The endpoint is disabled: nothing is delivered to it, a ping included.
          CONFLICT: { message: WEBHOOK_TEST_DISABLED_MESSAGE },
          // WEBHOOK_TEST_RATE_LIMIT per workspace per hour.
          TOO_MANY_REQUESTS: { message: WEBHOOK_TEST_RATE_MESSAGE },
        })
        .input(WebhookEndpointIdSchema)
        .output(SentWebhookTestSchema),
      deliveries: oc
        .route({
          method: "GET",
          path: "/workspaces/{workspaceId}/webhooks/{id}/deliveries",
          summary: "An endpoint's most recent delivery attempts",
        })
        .errors({ ...WORKSPACE_ERRORS, NOT_FOUND: { message: WEBHOOK_NOT_FOUND_MESSAGE } })
        .input(WebhookDeliveriesInputSchema)
        .output(WebhookDeliveryListSchema),
    },
    // The workspace's administrative actions over the last WORKSPACE_ACTIVITY_DAYS (admin and up,
    // every plan, readable while impersonating). Never returns network details, an admin's reason,
    // platform staff or a metadata key off the display allowlist.
    activity: {
      list: oc
        .route({
          method: "GET",
          path: "/workspaces/{workspaceId}/activity",
          summary: "The workspace's recent administrative activity, newest first",
        })
        .errors(WORKSPACE_ERRORS)
        .input(WorkspaceActivityListSchema)
        .output(WorkspaceActivityPageSchema),
    },
    // Whether every member must have two-step verification or a passkey (every plan). Admins read
    // the setting and how many members lack it; only the owner changes it.
    security: {
      get: oc
        .route({
          method: "GET",
          path: "/workspaces/{workspaceId}/security",
          summary: "The workspace's two-step requirement",
        })
        .errors(WORKSPACE_ERRORS)
        .input(WorkspaceIdSchema)
        .output(WorkspaceSecuritySchema),
      set: oc
        .route({
          method: "PUT",
          path: "/workspaces/{workspaceId}/security",
          summary: "Require (or stop requiring) two-step verification of every member",
        })
        .errors({
          ...WORKSPACE_ERRORS,
          // Also thrown with "Requires the owner role", IMPERSONATING_MESSAGE and the middleware's
          // two-step refusal (`data.reason: "two_factor_required"`).
          FORBIDDEN: {
            message: OWNER_TWO_FACTOR_MESSAGE,
            data: WorkspaceSecurityForbiddenDataSchema,
          },
        })
        .input(SetWorkspaceSecuritySchema)
        .output(SetWorkspaceSecurityResultSchema),
      // The email domains invitations are limited to (owner only, every plan); empty = any.
      setInviteDomains: oc
        .route({
          method: "PUT",
          path: "/workspaces/{workspaceId}/security/invite-domains",
          summary: "Limit invitations to addresses on the listed email domains",
        })
        .errors({
          ...WORKSPACE_ERRORS,
          // Also thrown with INVITE_DOMAINS_LIMIT_MESSAGE (`data.reason: "invite_domain_limit"`).
          BAD_REQUEST: {
            message: INVITE_DOMAINS_INVALID_MESSAGE,
            data: InviteDomainsBadRequestDataSchema,
          },
        })
        .input(SetInviteDomainsSchema)
        .output(InviteDomainsResultSchema),
    },
  },
  invitations: {
    preview: oc
      .route({
        method: "GET",
        path: "/invitations/{token}",
        summary: "What an invitation link is for",
      })
      .errors({ NOT_FOUND: { message: "This invitation is no longer valid." } })
      .input(InvitationTokenSchema)
      .output(InvitationPreviewSchema),
    accept: oc
      .route({
        method: "POST",
        path: "/invitations/{token}/accept",
        summary: "Accept an invitation",
      })
      .errors({
        ...AUTH_ERRORS,
        NOT_FOUND: { message: "This invitation is no longer valid." },
        // Also thrown with SEAT_LIMIT_MESSAGE, the verify-email refusal, and
        // INVITE_DOMAIN_NO_LONGER_ALLOWED_MESSAGE (`data.reason: "invite_domain"`).
        FORBIDDEN: {
          message: "This invitation was sent to another address",
          data: InvitationAcceptForbiddenDataSchema,
        },
      })
      .input(InvitationTokenSchema)
      .output(AcceptResultSchema),
    acceptById: oc
      .route({
        method: "POST",
        path: "/invitations/by-id/{id}/accept",
        summary: "Accept one of the caller's pending invitations",
      })
      .errors({
        ...AUTH_ERRORS,
        // Also the answer for an invitation addressed to someone else: ids are guessable.
        NOT_FOUND: { message: "This invitation is no longer valid." },
        // Also thrown with SEAT_LIMIT_MESSAGE and INVITE_DOMAIN_NO_LONGER_ALLOWED_MESSAGE
        // (`data.reason: "invite_domain"`).
        FORBIDDEN: {
          message: "Verify your email to accept this invitation",
          data: InvitationAcceptForbiddenDataSchema,
        },
      })
      .input(AcceptByIdSchema)
      .output(AcceptResultSchema),
  },
  // Uploaded files (avatars, workspace logos). Service token only, no session: a Next app's
  // /files/<key> route fetches these on the user's behalf, never the browser directly.
  files: {
    get: oc
      .route({ method: "GET", path: "/files/{+key}", summary: "An uploaded file's bytes" })
      .errors({ NOT_FOUND: { message: "Not found" } })
      .input(z.object({ key: FileKeySchema }))
      .output(z.file()),
  },
  billing: {
    get: oc
      .route({
        method: "GET",
        path: "/workspaces/{workspaceId}/billing",
        summary: "Plan and entitlements",
      })
      .errors(WORKSPACE_ERRORS)
      .input(WorkspaceIdSchema)
      .output(BillingSchema),
    checkout: oc
      .route({
        method: "POST",
        path: "/workspaces/{workspaceId}/billing/checkout",
        summary: "Start a checkout",
      })
      .errors({
        ...WORKSPACE_ERRORS,
        CONFLICT: { message: "Use the billing portal to change your plan" },
        BAD_REQUEST: { message: "This plan is not available" },
      })
      .input(CheckoutSchema)
      .output(CheckoutUrlSchema),
    portal: oc
      .route({
        method: "POST",
        path: "/workspaces/{workspaceId}/billing/portal",
        summary: "Open the billing portal",
      })
      .errors({ ...WORKSPACE_ERRORS, NOT_FOUND: { message: "No billing account yet" } })
      .input(WorkspaceIdSchema)
      .output(CheckoutUrlSchema),
    // NOT_FOUND carries "Mock billing is not enabled" when the provider is not the mock.
    mockChange: oc
      .route({
        method: "POST",
        path: "/workspaces/{workspaceId}/billing/mock",
        summary: "Change the plan (mock provider only)",
      })
      .errors(WORKSPACE_ERRORS)
      .input(MockChangeSchema)
      .output(BillingSchema),
  },
  waitlist: {
    join: oc
      .route({ method: "POST", path: "/waitlist", summary: "Join the waitlist" })
      .errors({
        TOO_MANY_REQUESTS: { message: "Too many requests, try again in a few minutes" },
      })
      .input(WaitlistJoinSchema)
      .output(WaitlistJoinResultSchema),
  },
  // The help center's contact form. Service token only; an optional x-session-token that resolves
  // to a live, non-impersonation session links the request to that user.
  support: {
    create: oc
      .route({ method: "POST", path: "/support", summary: "Send a support request" })
      .errors({ TOO_MANY_REQUESTS: { message: SUPPORT_RATE_MESSAGE } })
      .input(SupportCreateSchema)
      .output(SupportCreateResultSchema),
  },
  // The coaching site's contact form (`/kontakt`, see docs/architecture/leads.md). Service token
  // only, no session: a lead is address-keyed, never linked to an account.
  leads: {
    create: oc
      .route({ method: "POST", path: "/leads", summary: "Send a contact request" })
      .errors(LEAD_CREATE_ERRORS)
      .input(LeadCreateSchema)
      .output(LeadCreateResultSchema),
  },
  // The coaching site's booking calendar (see docs/architecture/booking.md). Service token only,
  // no session: a visitor books with their email; a token link in the confirmation mail manages
  // the booking afterwards. Every write runs the per-client, per-address and api-wide limiters.
  booking: {
    availability: oc
      .route({
        method: "GET",
        path: "/booking/availability",
        summary: "Free slots for an instant offering, per day",
      })
      .input(BookingAvailabilitySchema)
      .output(BookingAvailabilityResultSchema),
    groupEvents: oc
      .route({
        method: "GET",
        path: "/booking/group-events",
        summary: "Upcoming group coaching events with seats left",
      })
      .input(BookingGroupEventsSchema)
      .output(GroupEventsResultSchema),
    book: oc
      .route({ method: "POST", path: "/booking", summary: "Book a session or a programme" })
      .errors(BOOKING_CREATE_ERRORS)
      .input(BookingCreateSchema)
      .output(BookingCreateResultSchema),
    reserve: oc
      .route({ method: "POST", path: "/booking/group", summary: "Reserve seats at group events" })
      .errors(BOOKING_RESERVE_ERRORS)
      .input(BookingReserveSchema)
      .output(BookingCreateResultSchema),
    request: oc
      .route({
        method: "POST",
        path: "/booking/request",
        summary: "Request a workshop, programme or keynote",
      })
      .errors(BOOKING_ERRORS)
      .input(BookingRequestSchema)
      .output(BookingRequestResultSchema),
    manage: {
      get: oc
        .route({
          method: "GET",
          path: "/booking/manage/{token}",
          summary: "The bookings behind a manage link",
        })
        .errors(BOOKING_MANAGE_ERRORS)
        .input(BookingManageSchema)
        .output(BookingManageResultSchema),
      cancel: oc
        .route({
          method: "POST",
          path: "/booking/manage/{token}/cancel",
          summary: "Cancel one booking from its manage link",
        })
        .errors(BOOKING_CANCEL_ERRORS)
        .input(BookingCancelSchema)
        .output(OkSchema),
    },
  },
  // The jobs site's apply form. Service token only, no session; the CV is multipart and private
  // (never served by `files.get`).
  jobs: {
    apply: oc
      .route({ method: "POST", path: "/jobs/apply", summary: "Apply for an open role" })
      .errors(JobApplyErrors)
      .input(JobApplySchema)
      .output(JobApplyResultSchema),
  },
  // Pageviews and product events (see docs/superpowers/specs/2026-10-06-analytics-design.md).
  // Service token only, no session: a Next app's /api/analytics route forwards what its browser
  // sends, and the api's own instrumented procedures enqueue product events the same way.
  analytics: {
    ingest: oc
      .route({ method: "POST", path: "/analytics/ingest", summary: "Record a pageview or event" })
      .errors({
        BAD_REQUEST: { message: "Invalid analytics event" },
      })
      .input(AnalyticsIngestSchema)
      .output(z.void()),
  },
  // Error and web-vitals events from the apps and services (see packages/telemetry). Service token
  // only, no session: the Next apps' /api/telemetry routes forward what their browsers send.
  telemetry: {
    ingest: oc
      .route({ method: "POST", path: "/telemetry", summary: "Record errors and web vitals" })
      .errors({
        TOO_MANY_REQUESTS: { message: "Too many telemetry events, try again later" },
      })
      .input(TelemetryBatchSchema)
      .output(z.void()),
  },
  // Platform admin. Every procedure here is NOT_FOUND for anyone who is not a superadmin, and for
  // impersonation sessions — except stopImpersonation, which only an impersonation session may call.
  admin: {
    metrics: oc
      .route({ method: "GET", path: "/admin/metrics", summary: "Platform counts" })
      .errors(ADMIN_ERRORS)
      .input(empty)
      .output(AdminMetricsSchema),
    users: {
      list: oc
        .route({ method: "GET", path: "/admin/users", summary: "Search users" })
        .errors(ADMIN_ERRORS)
        .input(AdminUserListSchema)
        .output(AdminUserPageSchema),
      get: oc
        .route({ method: "GET", path: "/admin/users/{id}", summary: "A user in detail" })
        .errors(ADMIN_ERRORS)
        .input(AdminIdSchema)
        .output(AdminUserDetailSchema),
      revokeSessions: oc
        .route({
          method: "POST",
          path: "/admin/users/{id}/revoke-sessions",
          summary: "Sign the user out everywhere",
        })
        .errors(ADMIN_ERRORS)
        .input(AdminIdSchema)
        .output(OkSchema),
      impersonate: oc
        .route({
          method: "POST",
          path: "/admin/users/{id}/impersonate",
          summary: "Issue a one-hour session as the user",
        })
        .errors({
          ...ADMIN_ERRORS,
          // Also SUPERADMIN_TARGET_MESSAGE and SUSPENDED_TARGET_MESSAGE.
          FORBIDDEN: { message: SELF_TARGET_MESSAGE },
          TOO_MANY_REQUESTS: { message: "Too many impersonations, try again later" },
        })
        .input(ImpersonateSchema)
        .output(ImpersonationResultSchema),
      resetTwoFactor: oc
        .route({
          method: "POST",
          path: "/admin/users/{userId}/reset-two-factor",
          summary: "Turn off two-step verification and end the user's sessions",
        })
        .errors({
          ...ADMIN_ERRORS,
          FORBIDDEN: { message: SELF_RESET_MESSAGE },
          CONFLICT: { message: "That user does not have two-step verification on" },
          TOO_MANY_REQUESTS: { message: "Too many resets, try again later" },
        })
        .input(ResetTwoFactorSchema)
        .output(OkSchema),
      removePasskeys: oc
        .route({
          method: "POST",
          path: "/admin/users/{userId}/remove-passkeys",
          summary: "Remove every passkey and sign the user out everywhere",
        })
        .errors({
          ...ADMIN_ERRORS,
          FORBIDDEN: { message: SELF_REMOVE_PASSKEYS_MESSAGE },
          TOO_MANY_REQUESTS: { message: "Too many removals, try again later" },
        })
        .input(RemovePasskeysSchema)
        .output(OkSchema),
      suspend: oc
        .route({
          method: "POST",
          path: "/admin/users/{userId}/suspend",
          summary: "Suspend an account from signing in",
        })
        .errors({
          ...ADMIN_ERRORS,
          FORBIDDEN: { message: SELF_SUSPEND_MESSAGE },
          BAD_REQUEST: { message: SUSPEND_UNTIL_INVALID_MESSAGE },
          TOO_MANY_REQUESTS: { message: SUSPEND_RATE_MESSAGE },
        })
        .input(SuspendUserSchema)
        .output(OkSchema),
      unsuspend: oc
        .route({
          method: "POST",
          path: "/admin/users/{userId}/unsuspend",
          summary: "Lift a suspension",
        })
        .errors({
          ...ADMIN_ERRORS,
          FORBIDDEN: { message: SELF_SUSPEND_MESSAGE },
          TOO_MANY_REQUESTS: { message: SUSPEND_RATE_MESSAGE },
        })
        .input(UnsuspendUserSchema)
        .output(OkSchema),
    },
    stopImpersonation: oc
      .route({
        method: "POST",
        path: "/admin/impersonation/stop",
        summary: "End the calling impersonation session",
      })
      .errors(ADMIN_ERRORS)
      .input(empty)
      .output(OkSchema),
    workspaces: {
      list: oc
        .route({ method: "GET", path: "/admin/workspaces", summary: "Search workspaces" })
        .errors(ADMIN_ERRORS)
        .input(AdminListSchema)
        .output(AdminWorkspacePageSchema),
      get: oc
        .route({ method: "GET", path: "/admin/workspaces/{id}", summary: "A workspace in detail" })
        .errors(ADMIN_ERRORS)
        .input(AdminIdSchema)
        .output(AdminWorkspaceDetailSchema),
    },
    audit: {
      list: oc
        .route({ method: "GET", path: "/admin/audit", summary: "The audit log, newest first" })
        .errors(ADMIN_ERRORS)
        .input(AuditListSchema)
        .output(AuditPageSchema),
      export: oc
        .route({
          method: "POST",
          path: "/admin/audit/export",
          summary: "Export a date range of the audit log as CSV or JSON Lines",
        })
        .errors({
          ...ADMIN_ERRORS,
          BAD_REQUEST: { message: AUDIT_EXPORT_DATE_MESSAGE },
          CONFLICT: { message: AUDIT_EXPORT_CAP_MESSAGE },
          TOO_MANY_REQUESTS: { message: AUDIT_EXPORT_RATE_MESSAGE },
        })
        .input(AuditExportSchema)
        .output(z.file()),
    },
    jobs: {
      list: oc
        .route({
          method: "GET",
          path: "/admin/jobs",
          summary: "Queue counts and the most recently dead jobs",
        })
        .errors(ADMIN_ERRORS)
        .input(empty)
        .output(AdminJobsSchema),
      retry: oc
        .route({ method: "POST", path: "/admin/jobs/{id}/retry", summary: "Requeue a dead job" })
        .errors({
          ...ADMIN_ERRORS,
          CONFLICT: { message: JOB_RETRY_CONFLICT_MESSAGE },
        })
        .input(AdminIdSchema)
        .output(OkSchema),
      discard: oc
        .route({ method: "DELETE", path: "/admin/jobs/{id}", summary: "Delete a dead job" })
        .errors(ADMIN_ERRORS)
        .input(AdminIdSchema)
        .output(OkSchema),
    },
    support: {
      list: oc
        .route({ method: "GET", path: "/admin/support", summary: "Support requests, newest first" })
        .errors(ADMIN_ERRORS)
        .input(AdminSupportListSchema)
        .output(AdminSupportPageSchema),
      resolve: oc
        .route({
          method: "POST",
          path: "/admin/support/{id}/resolve",
          summary: "Mark a support request resolved",
        })
        .errors(ADMIN_ERRORS)
        .input(AdminIdSchema)
        .output(OkSchema),
      reopen: oc
        .route({
          method: "POST",
          path: "/admin/support/{id}/reopen",
          summary: "Reopen a resolved support request",
        })
        .errors(ADMIN_ERRORS)
        .input(AdminIdSchema)
        .output(OkSchema),
    },
    applications: {
      list: oc
        .route({
          method: "GET",
          path: "/admin/applications",
          summary: "Job applications, newest first",
        })
        .errors(ADMIN_ERRORS)
        .input(AdminApplicationListSchema)
        .output(AdminApplicationPageSchema),
      setStatus: oc
        .route({
          method: "PATCH",
          path: "/admin/applications/{id}/status",
          summary: "Set a job application's status",
        })
        .errors(ADMIN_ERRORS)
        .input(AdminApplicationSetStatusSchema)
        .output(OkSchema),
      delete: oc
        .route({
          method: "DELETE",
          path: "/admin/applications/{id}",
          summary: "Delete a job application and its CV",
        })
        .errors(ADMIN_ERRORS)
        .input(AdminIdSchema)
        .output(OkSchema),
      cv: oc
        .route({
          method: "GET",
          path: "/admin/applications/{id}/cv",
          summary: "An application's CV",
        })
        .errors(ADMIN_ERRORS)
        .input(AdminIdSchema)
        .output(z.file()),
    },
    leads: {
      list: oc
        .route({ method: "GET", path: "/admin/leads", summary: "Contact requests, newest first" })
        .errors(ADMIN_ERRORS)
        .input(AdminLeadListSchema)
        .output(AdminLeadPageSchema),
      get: oc
        .route({ method: "GET", path: "/admin/leads/{id}", summary: "One contact request" })
        .errors(ADMIN_ERRORS)
        .input(AdminIdSchema)
        .output(AdminLeadSchema),
      update: oc
        .route({
          method: "PATCH",
          path: "/admin/leads/{id}",
          summary: "Set a contact request's status or notes",
        })
        .errors(ADMIN_ERRORS)
        .input(AdminLeadUpdateSchema)
        .output(OkSchema),
      delete: oc
        .route({
          method: "DELETE",
          path: "/admin/leads/{id}",
          summary: "Delete a contact request, its answers and notes",
        })
        .errors(ADMIN_ERRORS)
        .input(AdminIdSchema)
        .output(OkSchema),
    },
    bookings: {
      calendar: oc
        .route({
          method: "GET",
          path: "/admin/bookings/calendar",
          summary: "Bookings, group events and blocked days in a date range",
        })
        .errors(ADMIN_ERRORS)
        .input(AdminBookingCalendarSchema)
        .output(AdminBookingCalendarResultSchema),
      pending: oc
        .route({
          method: "GET",
          path: "/admin/bookings/pending",
          summary: "Requests waiting for a decision, oldest first",
        })
        .errors(ADMIN_ERRORS)
        .input(empty)
        .output(AdminBookingPendingResultSchema),
      get: oc
        .route({ method: "GET", path: "/admin/bookings/{id}", summary: "One booking" })
        .errors(ADMIN_ERRORS)
        .input(AdminIdSchema)
        .output(AdminBookingSchema),
      confirm: oc
        .route({
          method: "POST",
          path: "/admin/bookings/{id}/confirm",
          summary: "Confirm a request at a chosen time",
        })
        .errors({ ...ADMIN_ERRORS, ...ADMIN_BOOKING_CONFIRM_ERRORS })
        .input(AdminBookingConfirmSchema)
        .output(OkSchema),
      decline: oc
        .route({
          method: "POST",
          path: "/admin/bookings/{id}/decline",
          summary: "Decline a request",
        })
        .errors(ADMIN_ERRORS)
        .input(AdminBookingDecideSchema)
        .output(OkSchema),
      cancel: oc
        .route({
          method: "POST",
          path: "/admin/bookings/{id}/cancel",
          summary: "Cancel a confirmed booking",
        })
        .errors(ADMIN_ERRORS)
        .input(AdminBookingDecideSchema)
        .output(OkSchema),
      availability: {
        get: oc
          .route({
            method: "GET",
            path: "/admin/bookings/availability",
            summary: "Weekly availability rules and blocked days",
          })
          .errors(ADMIN_ERRORS)
          .input(empty)
          .output(AdminAvailabilityResultSchema),
        set: oc
          .route({
            method: "PUT",
            path: "/admin/bookings/availability",
            summary: "Replace the weekly availability rules",
          })
          .errors(ADMIN_ERRORS)
          .input(AdminAvailabilitySetSchema)
          .output(OkSchema),
        block: oc
          .route({
            method: "POST",
            path: "/admin/bookings/availability/blocks",
            summary: "Block a range of days",
          })
          .errors(ADMIN_ERRORS)
          .input(AdminAvailabilityBlockSchema)
          .output(OkSchema),
        unblock: oc
          .route({
            method: "DELETE",
            path: "/admin/bookings/availability/blocks/{id}",
            summary: "Remove a blocked range",
          })
          .errors(ADMIN_ERRORS)
          .input(AdminIdSchema)
          .output(OkSchema),
      },
      groupEvents: {
        create: oc
          .route({
            method: "POST",
            path: "/admin/bookings/group-events",
            summary: "Schedule a group event, optionally as a weekly series",
          })
          .errors({ ...ADMIN_ERRORS, ...ADMIN_BOOKING_CONFIRM_ERRORS })
          .input(AdminGroupEventCreateSchema)
          .output(AdminGroupEventCreateResultSchema),
        cancel: oc
          .route({
            method: "POST",
            path: "/admin/bookings/group-events/{id}/cancel",
            summary: "Cancel a group event and tell its seat holders",
          })
          .errors(ADMIN_ERRORS)
          .input(AdminBookingDecideSchema)
          .output(OkSchema),
      },
    },
    telemetry: {
      errors: oc
        .route({
          method: "GET",
          path: "/admin/telemetry/errors",
          summary: "Errors in the last 24 hours",
        })
        .errors(ADMIN_ERRORS)
        .input(empty)
        .output(TelemetryErrorsSchema),
      vitals: oc
        .route({
          method: "GET",
          path: "/admin/telemetry/vitals",
          summary: "p75 web vitals over 7 days",
        })
        .errors(ADMIN_ERRORS)
        .input(empty)
        .output(TelemetryVitalsSchema),
    },
    analytics: {
      summary: oc
        .route({
          method: "GET",
          path: "/admin/analytics/summary",
          summary: "Pageviews, top pages and referrers, product events, and the funnel",
        })
        .errors(ADMIN_ERRORS)
        .input(AdminAnalyticsSummarySchema)
        .output(AnalyticsSummarySchema),
    },
  },
}

export type Contract = typeof contract

/** Type for `createORPCClient(link)` — lets clients stay typed without depending on @orpc/contract. */
export type ApiClient = ContractRouterClient<Contract>
