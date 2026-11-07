export type StoredObject = { body: Uint8Array; contentType: string; size: number }
export type ListedObject = { key: string; lastModified: Date }

/** The seam for user files. Keys are always ours (see FILE_KEY_PATTERN); providers trust them. */
export type Storage = {
  kind: "local" | "s3"
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<StoredObject | null>
  /** A missing key is not an error. */
  delete(key: string): Promise<void>
  /** Every object whose key starts with `prefix`, for `storage.sweep`. Order is not guaranteed. */
  list(prefix: string): AsyncIterable<ListedObject>
}

export const CONTENT_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const

export function contentTypeForKey(key: string): string {
  const ext = key.slice(key.lastIndexOf(".") + 1)
  // Data exports (`exports/<userId>/<random>.json`); never an image, so not in CONTENT_TYPES.
  if (ext === "json") return "application/json"
  // Job application CVs (`applications/<random>.pdf`); downloaded only by a superadmin.
  if (ext === "pdf") return "application/pdf"
  return Object.hasOwn(CONTENT_TYPES, ext)
    ? CONTENT_TYPES[ext as keyof typeof CONTENT_TYPES]
    : "application/octet-stream"
}
