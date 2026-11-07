import type { Note, NotePage } from "@repo/api-contract"
import type { SQL } from "bun"

export type NoteRow = {
  id: number
  title: string
  body: string
  created_at: string
  user_id: number | null
  workspace_id: number
  /** The API key that created it through `/v1`, null for a note a person wrote. No foreign key. */
  api_key_id: number | null
}

/**
 * A row read with its author and key resolved: `author_id`/`author_name` are the author's when
 * their account still exists, `key_id`/`key_name` the creating key's when its row still exists
 * (keys are revoked, never deleted, except with their workspace — and its notes).
 */
export type NoteDetailRow = NoteRow & {
  author_id: number | null
  author_name: string | null
  key_id: number | null
  key_name: string | null
}

const idOrNull = (value: number | string | null) => (value === null ? null : Number(value))

/**
 * `authorId` is null once the author's account is gone: the purge keeps `notes.user_id` (the note
 * belongs to its workspace), and the reader shows "Deleted user". Ids are never reused (SQLite
 * AUTOINCREMENT, Postgres identity), so a stale id can never name someone else. A note created
 * through `/v1` has no author and carries the key instead (`apiKey`).
 */
export const toNote = (row: NoteDetailRow): Note => {
  const keyId = idOrNull(row.key_id)
  return {
    id: Number(row.id),
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    authorId: idOrNull(row.author_id),
    apiKey: keyId === null ? null : { id: keyId, name: row.key_name ?? "" },
  }
}

type NoteKey = { workspaceId: number; id: number }

export function notesQueries(sql: SQL) {
  /** The raw row, author included, or undefined when the note is not in this workspace. */
  async function findRow({ workspaceId, id }: NoteKey): Promise<NoteRow | undefined> {
    const [row]: NoteRow[] =
      await sql`SELECT * FROM notes WHERE id = ${id} AND workspace_id = ${workspaceId}`
    return row
  }

  /** One note with its author and key resolved, or undefined when not in this workspace. */
  async function findDetail({ workspaceId, id }: NoteKey): Promise<NoteDetailRow | undefined> {
    const [row]: NoteDetailRow[] = await sql`
      SELECT n.*, u.id AS author_id, u.name AS author_name, k.id AS key_id, k.name AS key_name
      FROM notes n LEFT JOIN users u ON u.id = n.user_id LEFT JOIN api_keys k ON k.id = n.api_key_id
      WHERE n.id = ${id} AND n.workspace_id = ${workspaceId}
    `
    return row
  }

  /** Keyset pagination on id within one workspace, newest first: one row past `limit` tells
   * whether more exist. */
  async function page({
    workspaceId,
    cursor,
    limit,
  }: {
    workspaceId: number
    cursor?: number
    limit: number
  }): Promise<{ rows: NoteDetailRow[]; nextCursor: number | null }> {
    const rows: NoteDetailRow[] =
      cursor === undefined
        ? await sql`
            SELECT n.*, u.id AS author_id, u.name AS author_name, k.id AS key_id, k.name AS key_name
            FROM notes n LEFT JOIN users u ON u.id = n.user_id LEFT JOIN api_keys k ON k.id = n.api_key_id
            WHERE n.workspace_id = ${workspaceId}
            ORDER BY n.id DESC LIMIT ${limit + 1}
          `
        : await sql`
            SELECT n.*, u.id AS author_id, u.name AS author_name, k.id AS key_id, k.name AS key_name
            FROM notes n LEFT JOIN users u ON u.id = n.user_id LEFT JOIN api_keys k ON k.id = n.api_key_id
            WHERE n.workspace_id = ${workspaceId} AND n.id < ${cursor}
            ORDER BY n.id DESC LIMIT ${limit + 1}
          `
    const items = rows.slice(0, limit)
    const last = items.at(-1)
    return { rows: items, nextCursor: rows.length > limit && last ? Number(last.id) : null }
  }

  return {
    /** Keyset pagination on id within one workspace: one row past `limit` tells whether more exist. */
    async list({
      workspaceId,
      cursor,
      limit,
    }: {
      workspaceId: number
      cursor?: number
      limit: number
    }): Promise<NotePage> {
      const { rows, nextCursor } = await page({ workspaceId, cursor, limit })
      return { items: rows.map(toNote), nextCursor }
    },

    /** `list`'s page as detail rows (what `/v1` shapes its own notes from). */
    page,

    findRow,

    async find(key: NoteKey): Promise<Note | undefined> {
      const row = await findDetail(key)
      return row && toNote(row)
    },

    findDetail,

    /**
     * A note by a person (`userId`) or, through `/v1`, by an API key (`apiKey`, with no user).
     * The key's name is the one the caller gave, so the answer needs no second read.
     */
    async create(
      input: { workspaceId: number; title: string; body: string } & (
        | { userId: number; apiKey?: undefined }
        | { userId?: undefined; apiKey: { id: number; name: string } }
      )
    ): Promise<Note> {
      const createdAt = new Date().toISOString()
      const userId = input.userId ?? null
      const apiKeyId = input.apiKey?.id ?? null
      const [row]: NoteRow[] = await sql`
        INSERT INTO notes (workspace_id, user_id, api_key_id, title, body, created_at)
        VALUES (${input.workspaceId}, ${userId}, ${apiKeyId}, ${input.title}, ${input.body}, ${createdAt})
        RETURNING *
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return toNote({
        ...row,
        author_id: userId,
        author_name: null,
        key_id: apiKeyId,
        key_name: input.apiKey?.name ?? null,
      })
    },

    /** False when the note is not in this workspace. */
    async delete({ workspaceId, id }: NoteKey): Promise<boolean> {
      const rows: { id: number }[] = await sql`
        DELETE FROM notes WHERE id = ${id} AND workspace_id = ${workspaceId} RETURNING id
      `
      return rows.length > 0
    },
  }
}
