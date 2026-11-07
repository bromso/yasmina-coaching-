/**
 * Dependency-free (no `@repo/api-contract` import, unlike `./api-keys`): `api-keys-card.tsx` is a
 * `"use client"` file, and the client-imports guard forbids a client-reachable module from
 * importing a value off the bare `@repo/api-contract` root — so the gating logic and this DOM
 * helper, though both about the same card, live in separate files.
 */

/** The API keys card's title (`SettingsCard`'s `titleId`): where focus goes once the show-once
 * panel's **Done** button unmounts it, the same way `focusHeadingAfterRemove` targets the
 * Passkeys card's title and `focusEmailConfirmHeading` the email-confirm panel's heading. */
export const API_KEYS_HEADING_ID = "api-keys-heading"

/**
 * Moves focus to the API keys card's title. Takes the document as a parameter so the lookup has
 * a unit test without a DOM, like its two precedents (`focusHeadingAfterRemove`,
 * `focusEmailConfirmHeading`).
 */
export function focusApiKeysHeading(doc: Pick<Document, "getElementById"> = document) {
  doc.getElementById(API_KEYS_HEADING_ID)?.focus()
}

/**
 * After a revoke is answered: a successful one turns the key's status to `revoked`, which unmounts
 * the row's form — and with it the **Confirm revoke** button that held focus — so focus moves to
 * the card's title rather than dropping to `<body>`. A refusal leaves the row, and focus on its
 * button, where they are. Like `PasskeysCard`'s `focusHeadingAfterRemove`.
 */
export function focusApiKeysHeadingAfterRevoke(
  state: { ok: boolean; message?: string },
  doc: Pick<Document, "getElementById"> = document
) {
  if (state.ok) focusApiKeysHeading(doc)
}

/**
 * The show-once panel's **Done**, once hydrated. Done is a plain link to `/workspace` — without
 * JavaScript that GET discards the create form's POST result, and the key with it — so here the
 * navigation is cancelled and the create section is remounted instead (`remount`), which drops
 * its `useActionState` and the key it held from React state; then focus goes to the card's title,
 * since the link that had it is gone.
 */
export function dismissCreatedKey(
  event: Pick<Event, "preventDefault">,
  remount: () => void,
  doc: Pick<Document, "getElementById"> = document
) {
  event.preventDefault()
  remount()
  focusApiKeysHeading(doc)
}
