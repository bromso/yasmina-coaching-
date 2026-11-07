import { z } from "zod"
import { EmailSchema } from "./auth"
import { EMAIL_CHANGE_RATE_LIMIT, EMAIL_CHANGE_RATE_WINDOW_MS } from "./email-change-limits"

// Kept narrow like realtime.ts and support.ts: this file imports only zod, ./auth (EmailSchema)
// and the dependency-free ./email-change-limits. The `account.email.*` and `auth.emailChange.*`
// procedures (added in Tasks 2-3, per the plan) use these shapes; this file adds only the
// schemas, the token purposes' shared message constants and the rate limit's own numbers — no
// router or contract-router wiring yet, so this commit still typechecks on its own.
//
// `EMAIL_CHANGE_RATE_LIMIT` / `EMAIL_CHANGE_RATE_WINDOW_MS` live in the dependency-free
// `./email-change-limits` (re-exported below) so a client component can read the limiter's own
// numbers without pulling in zod or the rest of the contract.

export { EMAIL_CHANGE_RATE_LIMIT, EMAIL_CHANGE_RATE_WINDOW_MS }

/**
 * `account.email.requestChange`'s input: the new address, plus the fresh-credential proof the
 * shared `requireFreshCredential` helper asks for (the current password, on an account that has
 * one) and, only when two-step verification is on, a current authenticator or recovery code —
 * checked through the same path and limiter (`2fa:manage:<id>`) as `account.twoFactor.disable`.
 */
export const EmailChangeRequestSchema = z.object({
  newEmail: EmailSchema,
  password: z.string().max(200).optional(),
  code: z.string().trim().min(6).max(20).optional(),
})
export type EmailChangeRequest = z.infer<typeof EmailChangeRequestSchema>

/**
 * A pending email change, as both `account.email.get` and `account.email.requestChange` answer
 * it: the new address masked (`maskEmail`, never the full address — whoever reads this is signed
 * in as the account, not necessarily the one who asked for the change) and when its confirm link
 * expires.
 */
export const EmailChangePendingSchema = z.object({
  maskedEmail: z.string(),
  expiresAt: z.iso.datetime(),
})
export type EmailChangePending = z.infer<typeof EmailChangePendingSchema>

/**
 * The shared input for every link this feature mails: `account.email.confirmChange`,
 * `auth.emailChange.cancel` and `auth.emailChange.revert` each take just the opaque token from
 * their own link's query string.
 */
export const EmailChangeTokenSchema = z.object({ token: z.string().max(200) })
export type EmailChangeToken = z.infer<typeof EmailChangeTokenSchema>

/**
 * `account.email.requestChange` re-checks who is asking the same way `account.twoFactor.setup`
 * and `account.passkeys.registerOptions` do: the current password on an account that has one
 * (`UNAUTHORIZED`, `data.reason: "password"` — the shared `TWO_FACTOR_PASSWORD_REASON` from
 * `./auth`), else a session younger than `REAUTH_WINDOW_MS` (`FORBIDDEN`, `data.reason: "reauth"`
 * — the shared `TWO_FACTOR_REAUTH_REASON`).
 */
export const EMAIL_CHANGE_REAUTH_MESSAGE = "Sign in again to change your email."

/**
 * `account.email.requestChange` on an account with two-step verification on: a current
 * authenticator or recovery code, checked like `account.twoFactor.disable` (same limiter,
 * `2fa:manage:<id>`). A wrong one is `UNAUTHORIZED` with this reason — a value of its own, not
 * `TWO_FACTOR_WRONG_CODE_REASON`'s `"wrong_code"`, so a client can tell which of the request's
 * three checks (password, reauth, code) failed without parsing the translated message.
 */
export const EMAIL_CHANGE_CODE_REASON = "code"

/** `account.email.requestChange` for a `newEmail` equal to the account's current address. */
export const EMAIL_CHANGE_SAME_EMAIL_MESSAGE = "Enter a different email address."

/** `account.email.requestChange`'s own limiter (`email-change:<userId>`, see
 * `EMAIL_CHANGE_RATE_LIMIT` / `EMAIL_CHANGE_RATE_WINDOW_MS` above). */
export const EMAIL_CHANGE_RATE_MESSAGE = "Too many email change attempts, try again later."

/** `account.email.confirmChange` for a token that names a different account than the caller. */
export const EMAIL_CHANGE_WRONG_ACCOUNT_MESSAGE = "This link is for another account"

/** An unknown, used or expired token at `account.email.confirmChange`, `auth.emailChange.cancel`
 * or `auth.emailChange.revert` alike. */
export const EMAIL_CHANGE_LINK_INVALID_MESSAGE = "This link is invalid, expired or already used"

/** `account.email.confirmChange` (the new address was taken by another account meanwhile) and
 * `auth.emailChange.revert` (the old address was taken meanwhile) alike: `CONFLICT`, nothing
 * changes. */
export const EMAIL_CHANGE_TAKEN_MESSAGE = "That address is now in use"

/** `account.email.get`: the account's current address and its pending change, if any. */
export const EmailChangeStatusSchema = z.object({
  email: z.string(),
  pending: EmailChangePendingSchema.nullable(),
})
export type EmailChangeStatus = z.infer<typeof EmailChangeStatusSchema>

/**
 * `account.email.requestChange`'s answer — the same whether or not the address already belongs to
 * another account. A taken address leaves the same pending change and the same notice to the
 * current address; only the confirm mail to the taken address is skipped (and confirming the
 * stored change is refused), so it is no existence oracle.
 */
export const EmailChangeRequestResultSchema = z.object({ pending: EmailChangePendingSchema })
export type EmailChangeRequestResult = z.infer<typeof EmailChangeRequestResultSchema>

/** `account.email.confirmChange`'s answer: the account's address now. */
export const EmailChangeConfirmResultSchema = z.object({ email: z.string() })
export type EmailChangeConfirmResult = z.infer<typeof EmailChangeConfirmResultSchema>

/**
 * `auth.emailChange.revert` when the address the undo link would restore now belongs to another
 * account: `CONFLICT`, nothing changes (the link stays usable). Its own wording rather than
 * `EMAIL_CHANGE_TAKEN_MESSAGE`'s, since the owner cannot fix this themselves.
 */
export const EMAIL_CHANGE_REVERT_TAKEN_MESSAGE =
  "That address is now used by another account. Contact support to recover yours."

/**
 * `auth.emailChange.revert`'s answer. `passwordReset`: the account had a password, so it was
 * cleared and a reset link went to the restored address. Never an address: whoever holds the
 * link only ever learns that the undo happened.
 */
export const EmailChangeRevertResultSchema = z.object({ passwordReset: z.boolean() })
export type EmailChangeRevertResult = z.infer<typeof EmailChangeRevertResultSchema>
