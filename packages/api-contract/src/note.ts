import { z } from "zod"
import { WorkspaceIdSchema } from "./ids"

export const NoteSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(200),
  body: z.string().max(10_000),
  createdAt: z.iso.datetime(),
  /** The user who wrote it, or null when unknown or their account was deleted ("Deleted user"). */
  authorId: z.number().int().positive().nullable(),
  /** The API key that created it through `/v1` (`authorId` is then null), else null. */
  apiKey: z.object({ id: z.number().int().positive(), name: z.string() }).nullable(),
})

export const CreateNoteSchema = WorkspaceIdSchema.extend({
  title: NoteSchema.shape.title,
  body: NoteSchema.shape.body.default(""),
})

export const NoteIdSchema = WorkspaceIdSchema.extend({
  id: z.coerce.number().int().positive(),
})

export type Note = z.infer<typeof NoteSchema>
export type CreateNote = z.input<typeof CreateNoteSchema>

export const DEFAULT_PAGE_SIZE = 20

// Query-string friendly: REST sends strings, so every field coerces; cursor and limit may be omitted.
export const ListNotesSchema = WorkspaceIdSchema.extend({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const NotePageSchema = z.object({
  items: z.array(NoteSchema),
  nextCursor: z.number().int().positive().nullable(),
})

export type ListNotes = z.input<typeof ListNotesSchema>
export type NotePage = z.infer<typeof NotePageSchema>
