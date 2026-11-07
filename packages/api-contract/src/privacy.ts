import { z } from "zod"

/** A data export's lifecycle: `pending` until the job writes its file, `expired` after 7 days. */
export const DATA_EXPORT_STATUSES = ["pending", "ready", "expired"] as const
export type DataExportStatus = (typeof DATA_EXPORT_STATUSES)[number]

/** How long a ready export can be downloaded. */
export const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** How long after one request (of any status) the next one is refused. */
export const EXPORT_REQUEST_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * `account.export.request`'s refusal inside `EXPORT_REQUEST_INTERVAL_MS`. The api answers the
 * translated "You can request a new export after {time}." with the time filled in; this is only
 * the declared default.
 */
export const EXPORT_TOO_SOON_MESSAGE = "You can request a new export later."
export const EXPORT_NOT_FOUND_MESSAGE = "That export is not available."

export const DataExportSchema = z.object({
  id: z.number().int(),
  status: z.enum(DATA_EXPORT_STATUSES),
  readyAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
})
export type DataExport = z.infer<typeof DataExportSchema>

export const ExportRequestResultSchema = z.object({
  id: z.number().int(),
  status: z.literal("pending"),
})

export const ExportIdSchema = z.object({ id: z.coerce.number().int().positive() })

/** `CONFLICT`'s data: when the next request will be accepted (ISO 8601). */
export const ExportTooSoonDataSchema = z.object({ retryAt: z.string() })

/** How long a requested account deletion waits before the purge: signing in and cancelling stops it. */
export const DELETION_GRACE_MS = 7 * 24 * 60 * 60 * 1000

/** `account.delete`: the typed email is not the account's (compared case-insensitively). */
export const DELETE_EMAIL_MISMATCH_MESSAGE = "Type your account's email address to confirm."
/** `account.delete` on a session older than `REAUTH_WINDOW_MS` (with `data.reason: "reauth"`). */
export const DELETE_REAUTH_MESSAGE = "Sign in again to delete your account."
/**
 * `account.delete` while the caller is the only owner of a workspace with other members. The api
 * answers the translated "Transfer ownership or delete these workspaces first: {names}" with the
 * names filled in (and listed in `data.names`); this is only the declared default.
 */
export const DELETE_SOLE_OWNER_MESSAGE = "Transfer ownership or delete these workspaces first."

/** The confirmation: the account's own email, typed. Any string, so a mismatch gets its message. */
export const DeleteAccountSchema = z.object({ email: z.string().trim().max(254) })
export const DeleteAccountResultSchema = z.object({ deletionScheduledAt: z.iso.datetime() })
/** `CONFLICT`'s data: the workspaces the caller must hand over or delete first. */
export const DeleteSoleOwnerDataSchema = z.object({ names: z.array(z.string()) })
