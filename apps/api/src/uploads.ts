import { randomBytes } from "node:crypto"
import { ORPCError } from "@orpc/server"
import { MAX_IMAGE_BYTES } from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { apiMessage } from "./i18n"
import { enqueueStorageDelete } from "./jobs/builtin/storage"
import type { Enqueue } from "./jobs/enqueue"
import { type ImageExt, processImage } from "./storage/image"
import type { Storage } from "./storage/storage"

/** A fresh, unguessable key for a freshly processed image: `<prefix>/<ownerId>/<random>.<ext>`. */
export const newFileKey = (prefix: "avatars" | "logos", ownerId: number, ext: ImageExt) =>
  `${prefix}/${ownerId}/${randomBytes(16).toString("base64url")}.${ext}`

type UploadContext = {
  /** The language the refusal answers in. */
  locale: Locale
  storage: Storage
  enqueue: Enqueue
  /** For a failed `storage.delete` enqueue: logs it and records it as a `server` row. */
  recordFailure: (message: string, error: unknown) => void
}

/**
 * Writes `bytes` through the storage seam; a provider failure (a bucket down, bad credentials, a
 * full disk) is recorded and answered as the declared `SERVICE_UNAVAILABLE` — a retry may work —
 * rather than a generic 500.
 */
export async function putOrUnavailable(
  context: Pick<UploadContext, "locale" | "storage" | "recordFailure">,
  key: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  try {
    await context.storage.put(key, bytes, contentType)
  } catch (error) {
    context.recordFailure("storage write failed", error)
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: apiMessage(context, "storageUnavailable"),
    })
  }
}

/**
 * Validates `file` as an image (size first, so an oversized file is never read into memory),
 * stores it under a fresh key, commits that key through `commit`, then queues the previous
 * object (if any) for deletion. If `commit` throws — the database write failed — the object just
 * written is queued for deletion instead, so storage never outlives the row that would point at
 * it. Keys are not secrets, but nothing else about the file is logged.
 */
export async function replaceImage(
  context: UploadContext,
  file: File,
  key: (ext: ImageExt) => string,
  commit: (key: string) => Promise<string | null>
): Promise<string> {
  const image =
    file.size <= MAX_IMAGE_BYTES ? processImage(new Uint8Array(await file.arrayBuffer())) : null
  if (!image) throw new ORPCError("BAD_REQUEST", { message: apiMessage(context, "imageUpload") })
  const next = key(image.ext)
  await putOrUnavailable(context, next, image.bytes, image.contentType)
  let previous: string | null
  try {
    previous = await commit(next)
  } catch (error) {
    // The commit failed: queue the object just written for deletion, but never let a failure to
    // even queue that cleanup replace the real error below.
    await enqueueStorageDelete(context.enqueue, next).catch((e) =>
      context.recordFailure("storage.delete enqueue failed", e)
    )
    throw error
  }
  if (previous) {
    await enqueueStorageDelete(context.enqueue, previous).catch((e) =>
      context.recordFailure("storage.delete enqueue failed", e)
    )
  }
  return next
}
