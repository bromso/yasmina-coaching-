// Deliberately its own tiny module, imported for VALUES by the "use client" forms
// (email-cancel-form.tsx / email-revert-form.tsx): those forms take only `type` imports from
// `./email-change`, which also pulls in `@orpc/client`, `@repo/log` and the i18n translator for
// its action cores — fine for a server action, but it would drag all of that into the browser
// bundle the moment a client component imported a value from that module too. Mirrors apps/
// account's standalone `lib/email-confirm.ts`.

/** `/email/cancel`'s success panel heading: where focus goes once the cancel succeeds (rendered
 * with `tabIndex={-1}`: focusable from script, never a tab stop) — mirrors apps/account's
 * `EMAIL_CONFIRM_HEADING_ID` / `focusEmailConfirmHeading`. */
export const EMAIL_CANCEL_HEADING_ID = "email-cancel-success-heading"

/** `/email/revert`'s own success heading, same reasoning. */
export const EMAIL_REVERT_HEADING_ID = "email-revert-success-heading"

/**
 * Moves focus to `/email/cancel`'s success panel heading: a success swaps out the whole form,
 * including the button (**Cancel this change**) that held focus a moment ago, and nothing else on
 * the page changed to draw a screen reader's attention to the swap. Takes the document as a
 * parameter so the lookup has a unit test without a DOM.
 */
export function focusEmailCancelHeading(doc: Pick<Document, "getElementById"> = document) {
  doc.getElementById(EMAIL_CANCEL_HEADING_ID)?.focus()
}

/** `/email/revert`'s own version of `focusEmailCancelHeading`, same reasoning. */
export function focusEmailRevertHeading(doc: Pick<Document, "getElementById"> = document) {
  doc.getElementById(EMAIL_REVERT_HEADING_ID)?.focus()
}

/** `/email/unsubscribe`'s own success heading, same reasoning. */
export const EMAIL_UNSUBSCRIBE_HEADING_ID = "email-unsubscribe-success-heading"

/** `/email/unsubscribe`'s own version of `focusEmailCancelHeading`, same reasoning. */
export function focusEmailUnsubscribeHeading(doc: Pick<Document, "getElementById"> = document) {
  doc.getElementById(EMAIL_UNSUBSCRIBE_HEADING_ID)?.focus()
}
