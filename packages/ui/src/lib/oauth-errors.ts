/**
 * What a failed provider sign-in (or connect) tells the user. `apps/auth` redirects with
 * `?error=<code>&provider=<id>` — to its login page, or back to the account page when the browser
 * was signed in and connecting — and both pages render the message from here. Pure strings.
 */
export type OauthErrorCode =
  | "state"
  | "cancelled"
  | "unverified"
  | "claimed"
  | "provider"
  | "failed"

export const OAUTH_ERROR_MESSAGES: Record<OauthErrorCode, (provider?: string) => string> = {
  state: () => "That sign-in attempt expired or did not start here. Try again.",
  cancelled: () => "You cancelled the sign-in.",
  unverified: (p) =>
    p
      ? `Your ${p} account's email is not verified — sign in with your email first, then connect ${p} in your account.`
      : "Your account's email at the provider is not verified — sign in with your email first, then connect the provider in your account.",
  claimed: (p) =>
    `That ${p ?? "provider"} account is already connected to another user, or you already have one connected — disconnect it first.`,
  provider: (p) => `${p ?? "The provider"} is not responding right now. Try again in a moment.`,
  failed: () => "Sign-in failed. Try again.",
}

/**
 * The message for `?error=<code>`, naming the provider by `label` (the app's display name, or
 * undefined for an unknown id). Unknown codes, or none, show nothing.
 */
export function oauthErrorMessage(
  code: string | undefined,
  label: string | undefined
): string | undefined {
  if (!code || !Object.hasOwn(OAUTH_ERROR_MESSAGES, code)) return undefined
  return OAUTH_ERROR_MESSAGES[code as OauthErrorCode](label)
}
