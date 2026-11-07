import { render } from "@react-email/render"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import type { ReactElement } from "react"
import { AccountDeleted, type AccountDeletedProps } from "./templates/account-deleted"
import {
  AccountDeletionScheduled,
  type AccountDeletionScheduledProps,
} from "./templates/account-deletion-scheduled"
import { AccountReset, type AccountResetProps } from "./templates/account-reset"
import { AccountSuspended, type AccountSuspendedProps } from "./templates/account-suspended"
import { AccountUnsuspended, type AccountUnsuspendedProps } from "./templates/account-unsuspended"
import { DataExportReady, type DataExportReadyProps } from "./templates/data-export-ready"
import { EmailChangeConfirm, type EmailChangeConfirmProps } from "./templates/email-change-confirm"
import {
  EmailChangeRequested,
  type EmailChangeRequestedProps,
} from "./templates/email-change-requested"
import {
  EmailChangeReverted,
  type EmailChangeRevertedProps,
} from "./templates/email-change-reverted"
import { EmailChanged, type EmailChangedProps } from "./templates/email-changed"
import { Invitation, type InvitationProps } from "./templates/invitation"
import { JobApplication, type JobApplicationProps } from "./templates/job-application"
import {
  JobApplicationReceived,
  type JobApplicationReceivedProps,
} from "./templates/job-application-received"
import { MagicLink, type MagicLinkProps } from "./templates/magic-link"
import { PasskeyAdded, type PasskeyAddedProps } from "./templates/passkey-added"
import { PasskeyRemoved, type PasskeyRemovedProps } from "./templates/passkey-removed"
import { PasskeysRemoved, type PasskeysRemovedProps } from "./templates/passkeys-removed"
import { PasswordChanged, type PasswordChangedProps } from "./templates/password-changed"
import { PlanChanged, type PlanChangedProps } from "./templates/plan-changed"
import {
  RemovedFromWorkspace,
  type RemovedFromWorkspaceProps,
} from "./templates/removed-from-workspace"
import { ResetPassword, type ResetPasswordProps } from "./templates/reset-password"
import { RoleChanged, type RoleChangedProps } from "./templates/role-changed"
import { SupportReceived, type SupportReceivedProps } from "./templates/support-received"
import { SupportRequest, type SupportRequestProps } from "./templates/support-request"
import { TwoFactorDisabled, type TwoFactorDisabledProps } from "./templates/two-factor-disabled"
import { TwoFactorEnabled, type TwoFactorEnabledProps } from "./templates/two-factor-enabled"
import { TwoFactorReset, type TwoFactorResetProps } from "./templates/two-factor-reset"
import { VerifyEmail, type VerifyEmailProps } from "./templates/verify-email"
import { WaitlistWelcome, type WaitlistWelcomeProps } from "./templates/waitlist-welcome"
import { WebhookDisabled, type WebhookDisabledProps } from "./templates/webhook-disabled"
import {
  WorkspaceTwoFactorRequired,
  type WorkspaceTwoFactorRequiredProps,
} from "./templates/workspace-two-factor-required"

export type RenderedEmail = { subject: string; html: string; text: string }

async function rendered(subject: string, element: ReactElement): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}

/**
 * Every transactional email, rendered in the recipient's language (`locale`, default `"en"`).
 * Providers live in apps/api; this package only renders. The `<name>Subject` exports below stay
 * English — e2e and tests match mail by that literal string — but the `subject` this returns is
 * translated, like every other visible string in the template.
 */
export const emails = {
  verifyEmail: (props: VerifyEmailProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("verifyEmail.subject"),
      <VerifyEmail {...props} locale={locale} />
    ),
  resetPassword: (props: ResetPasswordProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("resetPassword.subject"),
      <ResetPassword {...props} locale={locale} />
    ),
  passwordChanged: (props: PasswordChangedProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("passwordChanged.subject"),
      <PasswordChanged {...props} locale={locale} />
    ),
  magicLink: (props: MagicLinkProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("magicLink.subject"),
      <MagicLink {...props} locale={locale} />
    ),
  accountReset: (props: AccountResetProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("accountReset.subject"),
      <AccountReset {...props} locale={locale} />
    ),
  waitlistWelcome: (props: WaitlistWelcomeProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("waitlistWelcome.subject"),
      <WaitlistWelcome {...props} locale={locale} />
    ),
  invitation: (props: InvitationProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("invitation.subject", { workspace: props.workspaceName }),
      <Invitation {...props} locale={locale} />
    ),
  jobApplication: (props: JobApplicationProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("jobApplication.subject", {
        reference: props.reference,
        title: props.title,
      }),
      <JobApplication {...props} locale={locale} />
    ),
  jobApplicationReceived: (props: JobApplicationReceivedProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("jobApplicationReceived.subject", {
        reference: props.reference,
      }),
      <JobApplicationReceived {...props} locale={locale} />
    ),
  twoFactorEnabled: (props: TwoFactorEnabledProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("twoFactorEnabled.subject"),
      <TwoFactorEnabled {...props} locale={locale} />
    ),
  twoFactorDisabled: (props: TwoFactorDisabledProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("twoFactorDisabled.subject"),
      <TwoFactorDisabled {...props} locale={locale} />
    ),
  twoFactorReset: (props: TwoFactorResetProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("twoFactorReset.subject"),
      <TwoFactorReset {...props} locale={locale} />
    ),
  passkeyAdded: (props: PasskeyAddedProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("passkeyAdded.subject"),
      <PasskeyAdded {...props} locale={locale} />
    ),
  passkeyRemoved: (props: PasskeyRemovedProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("passkeyRemoved.subject"),
      <PasskeyRemoved {...props} locale={locale} />
    ),
  passkeysRemoved: (props: PasskeysRemovedProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("passkeysRemoved.subject"),
      <PasskeysRemoved {...props} locale={locale} />
    ),
  dataExportReady: (props: DataExportReadyProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("dataExportReady.subject"),
      <DataExportReady {...props} locale={locale} />
    ),
  accountDeletionScheduled: (
    props: AccountDeletionScheduledProps,
    locale: Locale = DEFAULT_LOCALE
  ) =>
    rendered(
      translatorFor(locale, "email")("accountDeletionScheduled.subject"),
      <AccountDeletionScheduled {...props} locale={locale} />
    ),
  accountDeleted: (props: AccountDeletedProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("accountDeleted.subject"),
      <AccountDeleted {...props} locale={locale} />
    ),
  accountSuspended: (props: AccountSuspendedProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("accountSuspended.subject"),
      <AccountSuspended {...props} locale={locale} />
    ),
  accountUnsuspended: (props: AccountUnsuspendedProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("accountUnsuspended.subject"),
      <AccountUnsuspended {...props} locale={locale} />
    ),
  supportRequest: (props: SupportRequestProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("supportRequest.subject", {
        reference: props.reference,
        topic: props.topic,
      }),
      <SupportRequest {...props} locale={locale} />
    ),
  supportReceived: (props: SupportReceivedProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("supportReceived.subject", { reference: props.reference }),
      <SupportReceived {...props} locale={locale} />
    ),
  emailChangeConfirm: (props: EmailChangeConfirmProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("emailChangeConfirm.subject"),
      <EmailChangeConfirm {...props} locale={locale} />
    ),
  emailChangeRequested: (props: EmailChangeRequestedProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("emailChangeRequested.subject"),
      <EmailChangeRequested {...props} locale={locale} />
    ),
  emailChanged: (props: EmailChangedProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("emailChanged.subject"),
      <EmailChanged {...props} locale={locale} />
    ),
  emailChangeReverted: (props: EmailChangeRevertedProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("emailChangeReverted.subject"),
      <EmailChangeReverted {...props} locale={locale} />
    ),
  webhookDisabled: (props: WebhookDisabledProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("webhookDisabled.subject"),
      <WebhookDisabled {...props} locale={locale} />
    ),
  workspaceTwoFactorRequired: (
    props: WorkspaceTwoFactorRequiredProps,
    locale: Locale = DEFAULT_LOCALE
  ) =>
    rendered(
      translatorFor(locale, "email")("workspaceTwoFactorRequired.subject"),
      <WorkspaceTwoFactorRequired {...props} locale={locale} />
    ),
  // The optional notification mails (Phase 13 B): each ends with an inbox link and a visible
  // "Turn off these emails" link; apps/api adds the List-Unsubscribe headers.
  roleChanged: (props: RoleChangedProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("roleChanged.subject", { workspace: props.workspaceName }),
      <RoleChanged {...props} locale={locale} />
    ),
  removedFromWorkspace: (props: RemovedFromWorkspaceProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("removedFromWorkspace.subject", {
        workspace: props.workspaceName,
      }),
      <RemovedFromWorkspace {...props} locale={locale} />
    ),
  planChanged: (props: PlanChangedProps, locale: Locale = DEFAULT_LOCALE) =>
    rendered(
      translatorFor(locale, "email")("planChanged.subject", {
        workspace: props.workspaceName,
        plan: props.plan,
      }),
      <PlanChanged {...props} locale={locale} />
    ),
}

export {
  AccountDeleted,
  type AccountDeletedProps,
  accountDeletedSubject,
} from "./templates/account-deleted"
export {
  AccountDeletionScheduled,
  type AccountDeletionScheduledProps,
  accountDeletionScheduledSubject,
} from "./templates/account-deletion-scheduled"
export {
  AccountReset,
  type AccountResetProps,
  accountResetSubject,
} from "./templates/account-reset"
export {
  AccountSuspended,
  type AccountSuspendedProps,
  accountSuspendedSubject,
} from "./templates/account-suspended"
export {
  AccountUnsuspended,
  type AccountUnsuspendedProps,
  accountUnsuspendedSubject,
} from "./templates/account-unsuspended"
export {
  DataExportReady,
  type DataExportReadyProps,
  dataExportReadySubject,
} from "./templates/data-export-ready"
export {
  EmailChangeConfirm,
  type EmailChangeConfirmProps,
  emailChangeConfirmSubject,
} from "./templates/email-change-confirm"
export {
  EmailChangeRequested,
  type EmailChangeRequestedProps,
  emailChangeRequestedSubject,
} from "./templates/email-change-requested"
export {
  EmailChangeReverted,
  type EmailChangeRevertedProps,
  emailChangeRevertedSubject,
} from "./templates/email-change-reverted"
export {
  EmailChanged,
  type EmailChangedProps,
  emailChangedSubject,
} from "./templates/email-changed"
export { Invitation, type InvitationProps, invitationSubject } from "./templates/invitation"
export {
  JobApplication,
  type JobApplicationProps,
  jobApplicationSubject,
} from "./templates/job-application"
export {
  JobApplicationReceived,
  type JobApplicationReceivedProps,
  jobApplicationReceivedSubject,
} from "./templates/job-application-received"
export { BRAND } from "./templates/layout"
export { MagicLink, type MagicLinkProps, magicLinkSubject } from "./templates/magic-link"
export {
  PasskeyAdded,
  type PasskeyAddedProps,
  passkeyAddedSubject,
} from "./templates/passkey-added"
export {
  PasskeyRemoved,
  type PasskeyRemovedProps,
  passkeyRemovedSubject,
} from "./templates/passkey-removed"
export {
  PasskeysRemoved,
  type PasskeysRemovedProps,
  passkeysRemovedSubject,
} from "./templates/passkeys-removed"
export {
  PasswordChanged,
  type PasswordChangedProps,
  passwordChangedSubject,
} from "./templates/password-changed"
export {
  PlanChanged,
  type PlanChangedProps,
  planChangedSubject,
} from "./templates/plan-changed"
export {
  RemovedFromWorkspace,
  type RemovedFromWorkspaceProps,
  removedFromWorkspaceSubject,
} from "./templates/removed-from-workspace"
export {
  ResetPassword,
  type ResetPasswordProps,
  resetPasswordSubject,
} from "./templates/reset-password"
export {
  RoleChanged,
  type RoleChangedProps,
  roleChangedSubject,
} from "./templates/role-changed"
export {
  SupportReceived,
  type SupportReceivedProps,
  supportReceivedSubject,
} from "./templates/support-received"
export {
  SupportRequest,
  type SupportRequestProps,
  supportRequestSubject,
} from "./templates/support-request"
export {
  TwoFactorDisabled,
  type TwoFactorDisabledProps,
  twoFactorDisabledSubject,
} from "./templates/two-factor-disabled"
export {
  TwoFactorEnabled,
  type TwoFactorEnabledProps,
  twoFactorEnabledSubject,
} from "./templates/two-factor-enabled"
export {
  TwoFactorReset,
  type TwoFactorResetProps,
  twoFactorResetSubject,
} from "./templates/two-factor-reset"
export { VerifyEmail, type VerifyEmailProps, verifyEmailSubject } from "./templates/verify-email"
export {
  WaitlistWelcome,
  type WaitlistWelcomeProps,
  waitlistWelcomeSubject,
} from "./templates/waitlist-welcome"
export {
  WebhookDisabled,
  type WebhookDisabledProps,
  webhookDisabledSubject,
} from "./templates/webhook-disabled"
export {
  WorkspaceTwoFactorRequired,
  type WorkspaceTwoFactorRequiredProps,
  workspaceTwoFactorRequiredSubject,
} from "./templates/workspace-two-factor-required"
