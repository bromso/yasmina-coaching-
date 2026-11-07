import type { Note } from "@repo/public-api-contract"
import type { NoteDetailRow } from "../queries/notes"

/** A stored note as /v1 shows it: a key-made note's author is the key (null once its row is
 * gone), anyone else's the person (null once their account is gone). */
export function toV1Note(row: NoteDetailRow): Note {
  const keyId = row.key_id === null ? null : Number(row.key_id)
  const authorId = row.author_id === null ? null : Number(row.author_id)
  let author: Note["author"] = null
  if (row.api_key_id !== null) {
    if (keyId !== null) author = { type: "api_key", id: keyId, name: row.key_name ?? "" }
  } else if (authorId !== null) {
    author = { type: "user", id: authorId, name: row.author_name ?? "" }
  }
  return { id: Number(row.id), title: row.title, body: row.body, createdAt: row.created_at, author }
}
