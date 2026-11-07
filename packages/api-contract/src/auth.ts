import { LOCALES } from "@repo/i18n/locales"
import { z } from "zod"

export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))
// NIST 800-63B: length is the only rule.
export const PasswordSchema = z.string().min(8).max(128)

export const UserSchema = z.object({
  id: z.number().int().positive(),
  email: EmailSchema,
  name: z.string().max(100),
  createdAt: z.iso.datetime(),
  emailVerified: z.boolean(),
  /** False for an account created through a provider that has not set a password yet. */
  hasPassword: z.boolean(),
  /** Computed per request from SUPERADMIN_EMAILS and a verified email; never stored. */
  superadmin: z.boolean(),
  /** A URL to the profile avatar (see STORAGE_PUBLIC_URL), or null for none. */
  avatarUrl: z.string().nullable(),
  /** The chosen language; English until one is chosen (sign-up stores the request's). */
  locale: z.enum(LOCALES),
  /** When the account will be purged (a deletion was requested); null when none is scheduled. */
  deletionScheduledAt: z.iso.datetime().nullable(),
  /** How many passkeys the account holds, for the UI (a count, never the credentials). */
  passkeys: z.number().int().nonnegative(),
  /**
   * Whether the account satisfies a workspace's two-step requirement: two-step verification on,
   * or at least one passkey. Judged from the account's current state, not how this session
   * signed in.
   */
  twoFactorSatisfied: z.boolean(),
})
export type User = z.infer<typeof UserSchema>

/** Where a sign-in came from, for the sessions list. Sent by the Next app, never trusted for auth. */
export const ClientInfoSchema = z
  .object({ userAgent: z.string().max(500).optional(), ip: z.string().max(45).optional() })
  .optional()

export const SignUpSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  name: z.string().trim().max(100).default(""),
  client: ClientInfoSchema,
})
export const SignInSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
  client: ClientInfoSchema,
})

export const SessionTokenSchema = z.object({ token: z.string(), expiresAt: z.iso.datetime() })
export const AuthResultSchema = z.object({ user: UserSchema, session: SessionTokenSchema })
/**
 * What a sign-in answers instead of a session when the account has two-step verification on: an
 * opaque challenge (5 minutes) that only `auth.twoFactor.verify` turns into a session.
 */
export const TwoFactorChallengeSchema = z.object({
  twoFactor: z.object({ challenge: z.string(), expiresAt: z.iso.datetime() }),
})
export type TwoFactorChallenge = z.infer<typeof TwoFactorChallengeSchema>
/** `auth.signIn`, `auth.magicLink.consume` and `auth.oauth.callback` answer one of these. */
export const SignInResultSchema = z.union([AuthResultSchema, TwoFactorChallengeSchema])
export type SignInResult = z.infer<typeof SignInResultSchema>
export const isTwoFactorChallenge = (r: SignInResult): r is TwoFactorChallenge => "twoFactor" in r
/** A 6-digit authenticator code (spaces allowed) or a recovery code (`xxxxx-xxxxx`). */
export const TwoFactorVerifySchema = z.object({
  challenge: z.string().min(1).max(128),
  code: z.string().trim().min(6).max(20),
  client: ClientInfoSchema,
})
/** Every wrong code, and the answer that sends the user back to sign in again. */
export const TWO_FACTOR_WRONG_CODE_MESSAGE =
  "That code didn't work. Check your authenticator app and try again."
/**
 * The wrong-code refusal's `data.reason`: how a client tells it apart from the session's own
 * "Sign in required" (both `UNAUTHORIZED`) without reading the message, which is translated.
 */
export const TWO_FACTOR_WRONG_CODE_REASON = "wrong_code"
/** The declared `UNAUTHORIZED` of every procedure that checks a code. `data` is optional so the
 * session middleware's plain `UNAUTHORIZED` (no data) still validates as declared. */
export const TWO_FACTOR_WRONG_CODE_ERROR = {
  message: TWO_FACTOR_WRONG_CODE_MESSAGE,
  data: z.object({ reason: z.literal(TWO_FACTOR_WRONG_CODE_REASON) }).optional(),
}
/**
 * A superadmin's `admin.users.suspend` refusal, shown instead of issuing a session or a two-step
 * challenge at every sign-in path (password, magic link, OAuth, passkey, two-step verify) and by
 * `resolveSession` for a session that outlives the suspension — after the path's own credential
 * check passes, never before (a wrong credential still answers exactly as it would for anyone
 * else). Never names the admin's reason.
 */
export const ACCOUNT_SUSPENDED_MESSAGE = "This account is suspended. Contact support."
/** `account.twoFactor.setup` / `enable` for an account whose email was never verified. */
export const TWO_FACTOR_VERIFY_EMAIL_MESSAGE = "Verify your email to turn on two-step verification"
export const TWO_FACTOR_TIMED_OUT_MESSAGE = "Your sign-in timed out. Sign in again."
/** `account.twoFactor.setup` re-checks who is asking: the current password when the account has
 * one, else a session younger than this. */
export const REAUTH_WINDOW_MS = 10 * 60 * 1000
export const TWO_FACTOR_REAUTH_REASON = "reauth"
export const TWO_FACTOR_REAUTH_MESSAGE = "Sign in again to turn on two-step verification."
/** `account.setPassword` (a passwordless account) needs a session younger than REAUTH_WINDOW_MS
 * too: otherwise a stolen session could set a password, then pass `setup`'s password check. */
export const SET_PASSWORD_REAUTH_MESSAGE = "Sign in again to set a password."
/** Connecting a provider while signed in (`auth.oauth.start` / `callback` with a session) needs a
 * session younger than REAUTH_WINDOW_MS too: otherwise a stolen session could attach the thief's
 * own identity and sign in with it for good. */
export const CONNECT_REAUTH_MESSAGE = "Sign in again to connect a sign-in provider."
/** A missing or wrong `currentPassword` on setup: `data.reason` tells it apart from "Sign in
 * required" (also `UNAUTHORIZED`). */
export const TWO_FACTOR_PASSWORD_REASON = "password"
export const TwoFactorSetupSchema = z.object({ currentPassword: z.string().max(200).optional() })

/** `account.twoFactor.get`. */
export const TwoFactorStatusSchema = z.object({
  enabled: z.boolean(),
  recoveryCodesLeft: z.number().int(),
})
export type TwoFactorStatus = z.infer<typeof TwoFactorStatusSchema>
/** `account.twoFactor.setup`: the secret to show once (grouped on screen) and its otpauth:// URL. */
export const TwoFactorSetupResultSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
})
/** `enable` / `disable` / `regenerateRecoveryCodes`: a TOTP code or a recovery code, same as `verify`. */
export const TwoFactorCodeSchema = z.object({ code: z.string().trim().min(6).max(20) })
/** `enable` / `regenerateRecoveryCodes`: the new codes, shown once and never retrievable again. */
export const TwoFactorRecoveryCodesSchema = z.object({ recoveryCodes: z.array(z.string()) })

/** Set when the session was issued by a superadmin acting as this user. */
export const ImpersonationSchema = z.object({
  by: z.object({ id: z.number().int().positive(), name: z.string(), email: z.string() }),
  reason: z.string(),
  expiresAt: z.iso.datetime(),
})
export const MeSchema = z.object({
  user: UserSchema,
  session: z.object({ id: z.number().int().positive(), expiresAt: z.iso.datetime() }),
  impersonation: ImpersonationSchema.nullable(),
  /**
   * Whether `user.locale` was ever stored (at sign-up from the request's language, or through
   * `account.setLocale`). False means it is only the English default, which a client should not
   * treat as a preference — the browser's own language should win.
   */
  localeChosen: z.boolean(),
})
export type Me = z.infer<typeof MeSchema>

export const RequestPasswordResetSchema = z.object({ email: EmailSchema })
export const ResetPasswordSchema = z.object({ token: z.string().min(1), password: PasswordSchema })

export const MagicLinkRequestSchema = z.object({ email: EmailSchema })
export const MagicLinkConsumeSchema = z.object({
  token: z.string().min(1).max(128),
  client: ClientInfoSchema,
})

export const VerifyEmailSchema = z.object({ token: z.string().min(1).max(128) })
export const ResendVerificationResultSchema = z.object({ sent: z.boolean() })

export const UpdateProfileSchema = z.object({ name: z.string().trim().max(100) })
/** `account.setLocale`'s input and output: one of `LOCALES`, nothing else. */
export const SetLocaleSchema = z.object({ locale: z.enum(LOCALES) })
export const ChangePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: PasswordSchema })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "Choose a password you have not used here",
    path: ["newPassword"],
    // A client translating Zod issues looks this key up instead of matching the English message.
    params: { key: "passwordReused" },
  })

export const SessionSummarySchema = z.object({
  id: z.number().int().positive(),
  current: z.boolean(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  userAgent: z.string().nullable(),
})
export type SessionSummary = z.infer<typeof SessionSummarySchema>
export const SessionListSchema = z.object({ items: z.array(SessionSummarySchema) })
export const SessionIdSchema = z.object({ id: z.coerce.number().int().positive() })

export const ProviderIdSchema = z.enum(["google", "github", "apple"])
export type ProviderId = z.infer<typeof ProviderIdSchema>
export const ProvidersSchema = z.object({ providers: z.array(ProviderIdSchema) })

export const OAuthStartSchema = z.object({ provider: ProviderIdSchema })
export const OAuthStartResultSchema = z.object({
  url: z.string().url(),
  state: z.string(),
  codeVerifier: z.string().optional(),
})
export const OAuthCallbackSchema = z.object({
  provider: ProviderIdSchema,
  code: z.string().min(1).max(2048),
  codeVerifier: z.string().max(256).optional(),
  /** Apple posts the name once, on first consent, in the callback body. */
  appleUser: z
    .object({
      name: z
        .object({
          firstName: z.string().max(100).optional(),
          lastName: z.string().max(100).optional(),
        })
        .optional(),
    })
    .optional(),
  client: ClientInfoSchema,
})

export const IdentitySchema = z.object({
  provider: ProviderIdSchema,
  email: z.string().nullable(),
  createdAt: z.iso.datetime(),
})
export type Identity = z.infer<typeof IdentitySchema>
export const IdentityListSchema = z.object({ items: z.array(IdentitySchema) })
export const DisconnectIdentitySchema = z.object({ provider: ProviderIdSchema })
export const SetPasswordSchema = z.object({ password: PasswordSchema })

/** Every procedure that needs a session declares this; the api's middleware throws it. */
export const AUTH_ERRORS = { UNAUTHORIZED: { message: "Sign in required" } } as const
