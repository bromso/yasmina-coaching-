import { z } from "zod"
import { ClientInfoSchema } from "./auth"
import { MAX_PASSKEYS } from "./passkey-limits"

// Kept narrow like realtime.ts and support.ts: this file imports only zod and ./auth (itself
// just zod plus @repo/i18n/locales's plain constants). The `account.passkeys.*` and
// `auth.passkey.*` procedures in index.ts use these shapes.
//
// `MAX_PASSKEYS` itself lives in the dependency-free `./passkey-limits` (re-exported below) so a
// client component can import the cap without pulling in zod or the rest of the contract.

export { MAX_PASSKEYS }

/** The name shown in the list, editable any time; defaulted server-side from the authenticator's
 * transports ("This device" / "Security key") when left blank. */
export const PasskeyNameSchema = z.string().trim().min(1).max(60)

/** `account.passkeys.list`'s rows: never the credential id or public key. */
export const PasskeySchema = z.object({
  id: z.number().int().positive(),
  name: PasskeyNameSchema,
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
})
export type Passkey = z.infer<typeof PasskeySchema>

/**
 * `account.passkeys.registerOptions`: the current password, on an account that has one — the
 * same reauth/password rule `account.twoFactor.setup` uses (a session younger than
 * `REAUTH_WINDOW_MS` on a passwordless account).
 */
export const RegisterOptionsInput = z.object({
  password: z.string().max(200).optional(),
})
export type RegisterOptionsInput = z.infer<typeof RegisterOptionsInput>

/**
 * `account.passkeys.register`: the challenge id `registerOptions` answered with, the browser's
 * `startRegistration` result, validated server-side by `@simplewebauthn/server` (never by this
 * schema), plus the name the user chose. Left blank, the api names it from the response's own
 * transports.
 */
export const RegisterInput = z.object({
  challengeId: z.string().max(200),
  response: z.unknown(),
  name: PasskeyNameSchema.optional(),
})
export type RegisterInput = z.infer<typeof RegisterInput>

/**
 * `account.passkeys.registerOptions` and `auth.passkey.options` both answer this shape: the
 * library's own creation/request options JSON, plus an opaque id for the challenge minted
 * alongside them (`auth.passkey.verify` / `account.passkeys.register` send it back).
 */
export const PasskeyOptionsResult = z.object({
  options: z.unknown(),
  challengeId: z.string(),
})
export type PasskeyOptionsResult = z.infer<typeof PasskeyOptionsResult>

/** `auth.passkey.verify`: never a two-factor challenge — a passkey counts as both factors. */
export const PasskeyVerifyInput = z.object({
  challengeId: z.string().max(200),
  response: z.unknown(),
  client: ClientInfoSchema,
})
export type PasskeyVerifyInput = z.infer<typeof PasskeyVerifyInput>

/** `account.passkeys.delete`'s input: one of the caller's own passkeys, by its row id. */
export const PasskeyIdSchema = z.object({ id: z.coerce.number().int().positive() })
export type PasskeyId = z.infer<typeof PasskeyIdSchema>

/** `account.passkeys.rename`'s input. */
export const RenamePasskeySchema = z.object({
  id: z.coerce.number().int().positive(),
  name: PasskeyNameSchema,
})
export type RenamePasskey = z.infer<typeof RenamePasskeySchema>

/** `account.passkeys.registerOptions` on a passwordless account whose session is past
 * `REAUTH_WINDOW_MS` (with `data.reason: "reauth"`), like two-step setup's refusal. */
export const PASSKEY_REAUTH_MESSAGE = "Sign in again to add a passkey."

/** `account.passkeys.register`'s refusal for a response that does not verify (wrong origin, RP
 * ID, challenge, a missing user-verification flag, a malformed response) or a credential that is
 * already registered. */
export const PASSKEY_REGISTER_FAILED_MESSAGE = "That passkey couldn't be added. Try again."

/** `account.passkeys.rename` / `delete` for an id that is not one of the caller's own passkeys. */
export const PASSKEY_NOT_FOUND_MESSAGE = "Passkey not found"

/** The default name for a passkey whose authenticator reports `internal` or `hybrid` transport. */
export const PASSKEY_NAME_DEVICE = "This device"
/** The default name for any other passkey (a roaming security key, or no transports at all). */
export const PASSKEY_NAME_SECURITY_KEY = "Security key"

/** Deleting a passkey when the account has no password, no connected provider and no other
 * passkey left: the same "keep at least one way in" rule `account.identities.disconnect` applies,
 * but `CONFLICT` rather than `FORBIDDEN` (this is the design's own ruling for passkeys). */
export const PASSKEY_LAST_WAY_IN_MESSAGE =
  "This is your only way to sign in — set a password or connect a provider first."

/** Adding a passkey to an account that already has `MAX_PASSKEYS`. */
export const PASSKEY_LIMIT_MESSAGE = "You can have up to 10 passkeys. Remove one to add another."

/** `auth.passkey.verify`'s refusal for an unknown credential, a signature that does not verify, a
 * missing user-verification flag, a wrong origin or RP ID, or a stale/expired/replayed challenge —
 * every one of those answers this single message, so a client cannot tell them apart. */
export const PASSKEY_FAILED_MESSAGE =
  "That passkey didn't work. Try again or use another way to sign in."

/** `auth.passkey.verify`'s per-client limiter (`passkey:<x-api-client-id>`, 10 per 15 minutes),
 * on top of the sign-in limiter's own api-wide cap. */
export const PASSKEY_RATE_MESSAGE = "Too many passkey attempts, try again later."
