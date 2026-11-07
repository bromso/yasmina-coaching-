import type { FormState } from "@repo/ui/components/form-feedback"

/**
 * What `AddPasskeyForm` should show once a `startRegistration` ceremony throws, classified by the
 * browser's own `DOMException.name`. Pulled out of the component — which, like every interactive
 * client component in this repo, has no rendering test of its own — so the branching gets a
 * direct unit test, mirroring `apps/auth/src/lib/passkey.ts`'s `classifyPasskeyError` for the
 * sign-in button. Simpler than that one: there is no quiet autofill ceremony running alongside the
 * explicit one here, so every outcome is shown, never suppressed.
 */
export type PasskeyRegisterErrorDisplay = "none" | "cancelled" | "exists" | "failed"

/**
 * - `"AbortError"`: a second `startRegistration` call (a fast double submit) replaced this one —
 *   `@simplewebauthn/browser`'s own `WebAuthnAbortService` aborts the previous call before issuing
 *   a new signal — so nothing failed and nothing is shown.
 * - `"NotAllowedError"`: the visitor dismissed the platform's credential prompt, or it timed out —
 *   a real cancellation, shown as a short, neutral message, never an alarming one.
 * - `"InvalidStateError"`: the authenticator already holds a passkey for this account — the
 *   options' `excludeCredentials` named it (`@simplewebauthn/browser` keeps the name on its
 *   `ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED` error). Trying again can never succeed on this
 *   device, so it gets its own message rather than "try again".
 * - anything else (another `DOMException`, a generic `Error`, or a non-`Error` throw): a genuine
 *   failure, shown, translated.
 */
export function classifyPasskeyRegisterError(error: unknown): PasskeyRegisterErrorDisplay {
  const name = error instanceof Error ? error.name : ""
  if (name === "AbortError") return "none"
  if (name === "NotAllowedError") return "cancelled"
  if (name === "InvalidStateError") return "exists"
  return "failed"
}

/**
 * `AddPasskeyForm`'s mapping from `classifyPasskeyRegisterError`'s result to what it shows,
 * pulled out as its own pure function (rather than inlined in the component) so "a cancellation
 * is neutral, not an error" can't regress silently — see the unit test below. Mirrors
 * `apps/auth/src/components/passkey-sign-in.tsx`'s own mapping: a cancellation is `ok: true` (a
 * polite `role="status"` through `FormMessage`, never the destructive `role="alert"` — the
 * visitor didn't do anything wrong, they just backed out of the prompt), a genuine failure — and a
 * device that already has a passkey for the account — is `ok: false`. `"none"` (a superseded ceremony, `AbortError`) returns `undefined`: nothing to
 * show, so the caller leaves whatever state it already had.
 */
export function passkeyRegisterErrorState(
  display: PasskeyRegisterErrorDisplay,
  messages: { cancelled: string; exists: string; failed: string }
): FormState | undefined {
  if (display === "cancelled") return { ok: true, message: messages.cancelled }
  if (display === "exists") return { ok: false, message: messages.exists }
  if (display === "failed") return { ok: false, message: messages.failed }
  return undefined
}

/** The id of the Passkeys card's title on the Security page (`SettingsCard`'s `titleId`): where
 * focus goes once a passkey is removed. */
export const PASSKEYS_HEADING_ID = "passkeys-heading"

/**
 * After a removal is answered: a successful one unmounts the row whose **Confirm removal** button
 * held focus, which would otherwise drop keyboard and screen-reader users on `<body>`, so focus
 * moves to the card's own title (rendered with `tabIndex={-1}`: focusable from script, never a tab
 * stop). A refusal leaves the row — and focus on its button — where they are. Takes the document
 * as a parameter so the branching has a unit test without a DOM.
 */
export function focusHeadingAfterRemove(
  state: FormState,
  doc: Pick<Document, "getElementById"> = document
) {
  if (state.ok) doc.getElementById(PASSKEYS_HEADING_ID)?.focus()
}
