/**
 * What `PasskeySignIn` should show once a `startAuthentication` ceremony throws, classified by
 * the browser's own `DOMException.name` and which ceremony failed. Pulled out of the component —
 * which, like every interactive client component in this repo, has no rendering test of its own —
 * so the branching (two axes, four distinct outcomes) gets a direct unit test, the way
 * `apps/app/src/lib/realtime.ts`'s `decideAfterProbe` is tested without rendering `LiveNotes`.
 */
export type PasskeyErrorDisplay = "none" | "cancelled" | "failed"

/**
 * - `"AbortError"` (either ceremony): a later `startAuthentication` call replaced this one —
 *   `@simplewebauthn/browser`'s own `WebAuthnAbortService` aborts the previous call before
 *   issuing a new signal — so nothing failed and nothing is shown.
 * - `"NotAllowedError"` (either ceremony): the visitor dismissed the platform's credential prompt,
 *   or it timed out — a real cancellation, shown as a short, neutral message, never an alarming
 *   one, whether it happened on the quiet autofill ceremony or the explicit button.
 * - anything else (another `DOMException`, a generic `Error`, or a non-`Error` throw) from the
 *   explicit button's own ceremony: a genuine failure, shown, translated.
 * - anything else from the quiet autofill ceremony: shown nowhere — the visitor never asked for
 *   it, so a transient failure there must not interrupt the page with an error they didn't cause.
 */
export function classifyPasskeyError(error: unknown, fromAutofill: boolean): PasskeyErrorDisplay {
  const name = error instanceof Error ? error.name : ""
  if (name === "AbortError") return "none"
  if (name === "NotAllowedError") return "cancelled"
  return fromAutofill ? "none" : "failed"
}

/**
 * Whether the quiet autofill ceremony may still go on — to its next step, or to showing anything —
 * given how many explicit (button) ceremonies had begun when it started and how many have begun
 * now. Its `passkeyOptions()` round trip can take seconds on a slow link; a click in that window
 * starts the explicit ceremony first, and the quiet one's later `startAuthentication` would then
 * abort it through `WebAuthnAbortService` — the visitor clicks and nothing happens. So once any
 * explicit ceremony has begun, the quiet one stands down for good instead.
 */
export function quietCeremonyMayProceed(explicitAtStart: number, explicitNow: number): boolean {
  return explicitAtStart === explicitNow
}
