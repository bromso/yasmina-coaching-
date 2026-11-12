import type { Migration } from "../migrate"
import notes from "./0001_notes"
import auth from "./0002_auth"
import notesOwner from "./0003_notes_owner"
import emailVerification from "./0004_email_verification"
import identities from "./0005_identities"
import identityPerProvider from "./0006_identity_per_provider"
import waitlist from "./0007_waitlist"
import workspaces from "./0008_workspaces"
import notesWorkspace from "./0009_notes_workspace"
import billing from "./0010_billing"
import admin from "./0011_admin"
import telemetry from "./0012_telemetry"
import twoFactor from "./0013_two_factor"
import files from "./0014_files"
import jobs from "./0015_jobs"
import analytics from "./0016_analytics"
import userLocale from "./0017_user_locale"
import sessionsRevokedAt from "./0018_sessions_revoked_at"
import privacy from "./0019_privacy"
import support from "./0020_support"
import jobApplications from "./0021_job_applications"
import jobsRequestId from "./0022_jobs_request_id"
import jobsNameIndex from "./0023_jobs_name_index"
import passkeys from "./0024_passkeys"
import emailChange from "./0025_email_change"
import suspensions from "./0026_suspensions"
import apiKeys from "./0027_api_keys"
import webhooks from "./0028_webhooks"
import auditWorkspace from "./0029_audit_workspace"
import workspaceRequireTwoFactor from "./0030_workspace_require_two_factor"
import workspaceInviteDomains from "./0031_workspace_invite_domains"
import notifications from "./0032_notifications"
import notificationPreferences from "./0033_notification_preferences"
import booking from "./0034_booking"
import groupEventOffering from "./0035_group_event_offering"
import leads from "./0036_leads"
import bookingTerms from "./0037_booking_terms"

/** Every migration, in order. A new file goes here too — nothing is picked up by accident. */
export const migrations: readonly Migration[] = [
  notes,
  auth,
  notesOwner,
  emailVerification,
  identities,
  identityPerProvider,
  waitlist,
  workspaces,
  notesWorkspace,
  billing,
  admin,
  telemetry,
  twoFactor,
  files,
  jobs,
  analytics,
  userLocale,
  sessionsRevokedAt,
  privacy,
  support,
  jobApplications,
  jobsRequestId,
  jobsNameIndex,
  passkeys,
  emailChange,
  suspensions,
  apiKeys,
  webhooks,
  auditWorkspace,
  workspaceRequireTwoFactor,
  workspaceInviteDomains,
  notifications,
  notificationPreferences,
  booking,
  groupEventOffering,
  leads,
  bookingTerms,
]
