"use server"

import { NoteIdSchema } from "@repo/api-contract"
import { createLogger } from "@repo/log"
import { revalidatePath } from "next/cache"
import { api, describeApiError } from "@/lib/api"
import { getAuth } from "@/lib/auth"
import { appTranslator } from "@/lib/i18n"
import { type DeleteNoteState, type NoteFormState, parseNoteForm } from "@/lib/note-form"

const logger = createLogger({ service: "app" })

export async function createNote(_prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  // A server action is a public POST endpoint: check the session here, not only on the page.
  const auth = getAuth()
  const { workspace } = await auth.requireWorkspace()
  const locale = await auth.getLocale()
  const t = appTranslator(locale)
  const parsed = parseNoteForm(formData, t)
  if (!parsed.ok) return parsed
  const values = { title: parsed.note.title, body: parsed.note.body }
  // A form rendered for one workspace may be submitted after the user switched to another (a
  // second tab): refuse it rather than write into, or delete from, a workspace the page never
  // showed.
  if (parsed.note.workspaceId !== workspace.id) {
    return { ok: false, message: t("notes.switched"), values }
  }
  try {
    await (await api()).notes.create({ ...parsed.note, workspaceId: workspace.id })
  } catch (error) {
    logger.error("notes.create failed", { error })
    return { ok: false, message: describeApiError(error, { locale }), values }
  }
  revalidatePath("/notes")
  return { ok: true }
}

export async function deleteNote(
  _prev: DeleteNoteState,
  formData: FormData
): Promise<DeleteNoteState> {
  const auth = getAuth()
  const { workspace } = await auth.requireWorkspace()
  const locale = await auth.getLocale()
  const t = appTranslator(locale)
  const parsed = NoteIdSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    id: formData.get("noteId"),
  })
  if (!parsed.success) return { ok: false, message: t("validation.reload") }
  if (parsed.data.workspaceId !== workspace.id) return { ok: false, message: t("notes.switched") }
  try {
    await (await api()).notes.delete({ workspaceId: workspace.id, id: parsed.data.id })
  } catch (error) {
    logger.error("notes.delete failed", { error })
    return { ok: false, message: describeApiError(error, { locale }) }
  }
  revalidatePath("/notes")
  return { ok: true }
}
