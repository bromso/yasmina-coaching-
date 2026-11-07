/** `/email/confirm`'s success panel heading: where focus goes once `account.email.confirmChange`
 * succeeds (rendered with `tabIndex={-1}`: focusable from script, never a tab stop). */
export const EMAIL_CONFIRM_HEADING_ID = "email-confirm-success-heading"

/**
 * Moves focus to the success panel's heading, the way `focusHeadingAfterRemove` moves it to the
 * Passkeys card's title: a success swaps out the whole form, including the button
 * (**Confirm new email**) that held focus a moment ago, and nothing else on the page changed to
 * draw a screen reader's attention to the swap. Takes the document as a parameter so the lookup
 * has a unit test without a DOM.
 */
export function focusEmailConfirmHeading(doc: Pick<Document, "getElementById"> = document) {
  doc.getElementById(EMAIL_CONFIRM_HEADING_ID)?.focus()
}
