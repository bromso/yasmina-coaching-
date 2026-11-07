/**
 * Dependency-free (no `@repo/api-contract` import, unlike `./webhooks`): `webhooks-card.tsx` is a
 * `"use client"` file, and the client-imports guard forbids a client-reachable module from
 * importing a value off the bare `@repo/api-contract` root — so the gating logic and this DOM
 * helper, though both about the same card, live in separate files. Mirrors `./api-keys-focus`.
 */

/** The Webhooks card's title (`SettingsCard`'s `titleId`): where focus goes once a row's delete
 * unmounts it, or the add form's show-once secret panel's **Done** unmounts that, the same way
 * `API_KEYS_HEADING_ID` targets the API keys card's title. */
export const WEBHOOKS_HEADING_ID = "webhooks-heading"

/**
 * Moves focus to the Webhooks card's title. Takes the document as a parameter so the lookup has a
 * unit test without a DOM, like `focusApiKeysHeading`.
 */
export function focusWebhooksHeading(doc: Pick<Document, "getElementById"> = document) {
  doc.getElementById(WEBHOOKS_HEADING_ID)?.focus()
}

/**
 * After a delete is answered: a successful one removes the endpoint's row — and with it the
 * **Confirm delete** button that held focus — so focus moves to the card's title rather than
 * dropping to `<body>`. A refusal leaves the row, and focus on its button, where they are. Like
 * `focusApiKeysHeadingAfterRevoke`.
 */
export function focusWebhooksHeadingAfterDelete(
  state: { ok: boolean; message?: string },
  doc: Pick<Document, "getElementById"> = document
) {
  if (state.ok) focusWebhooksHeading(doc)
}

/**
 * The add form's show-once secret panel's **Done**, once hydrated. Done is a plain link to
 * `/workspace` — without JavaScript that GET discards the create form's POST result, and the
 * secret with it — so here the navigation is cancelled and the add section is remounted instead
 * (`remount`), which drops its `useActionState` and the secret it held from React state; then
 * focus goes to the card's title, since the link that had it is gone. Like `dismissCreatedKey`.
 */
export function dismissCreatedWebhookSecret(
  event: Pick<Event, "preventDefault">,
  remount: () => void,
  doc: Pick<Document, "getElementById"> = document
) {
  event.preventDefault()
  remount()
  focusWebhooksHeading(doc)
}

/**
 * A row's rotate panel's **Done**, once hydrated: the same cancelled navigation and remount as
 * `dismissCreatedWebhookSecret`, but focus is left to the remounted section, which moves it to
 * that row's own **Rotate secret** button — the reader stays on the endpoint they were working
 * on, not sent back to the card's title.
 */
export function dismissRotatedWebhookSecret(
  event: Pick<Event, "preventDefault">,
  remount: () => void
) {
  event.preventDefault()
  remount()
}
