/**
 * What the `ImageUploadCard` should show, given the persisted image and any local preview. Pulled
 * out as a pure function because of a round trip that changes which branch would otherwise render:
 * a successful remove flips `url` from a string to `null` in the very same update that carries the
 * remove action's own "removed" message. If the Remove form (and the message inside it) were both
 * gated on `url`, that message would never be shown — the branch holding it has already been swapped
 * out by the time the result is available, with or without JavaScript (see `two-factor-view.ts` for
 * the same class of bug). The fix is structural, not just logic: `ImageUploadCard` renders the
 * remove `FormMessage` unconditionally and uses `showRemove` (from here) only to gate the form/button
 * themselves, so a message that arrives in the same update `url` disappears in is never lost.
 */
export type ImageUploadView = {
  /** The local preview takes priority over the persisted image; neither shows the initials fallback. */
  shown: string | null
  /** Whether the Remove form/button should render — never based on a message, only on `url`. */
  showRemove: boolean
}

export function resolveImageUploadView(input: {
  url: string | null
  preview: string | null
}): ImageUploadView {
  return { shown: input.preview ?? input.url, showRemove: input.url !== null }
}
