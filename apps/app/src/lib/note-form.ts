import { CreateNoteSchema } from "@repo/api-contract"
import type { z } from "zod"
import { type AppT, appTranslator, zodMessage } from "./i18n"

export type NoteFormValues = { title: string; body: string }

/** What the create-note server action returns to the form. */
export type NoteFormState = { ok: true } | { ok: false; message: string; values: NoteFormValues }

/** What the delete-note server action returns to its button. */
export type DeleteNoteState = { ok: true } | { ok: false; message: string }

/**
 * Validates the form with the contract's own schema, so the rules live in one place; the first
 * issue becomes the form's message, in `t`'s language (English by default).
 */
export function parseNoteForm(
  formData: FormData,
  t: AppT = appTranslator()
):
  | { ok: true; note: z.output<typeof CreateNoteSchema> }
  | { ok: false; message: string; values: NoteFormValues } {
  const values = {
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? ""),
  }
  const parsed = CreateNoteSchema.safeParse({
    ...values,
    workspaceId: String(formData.get("workspaceId") ?? ""),
  })
  if (parsed.success) return { ok: true, note: parsed.data }
  const [issue] = parsed.error.issues
  const message = issue ? zodMessage(t)(issue) : t("validation.reload")
  return { ok: false, message, values }
}
